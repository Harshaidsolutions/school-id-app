import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadCatalogFile } from "../config/storage";
import {
  adminCatalogOwnerSql,
  assertCatalogRowOwnedByAdmin,
  loadOrgOwnerAdminId,
  requireAdminScope,
} from "../utils/adminScope";
import {
  getTeacherOrgId,
  isInstituteStaff,
} from "../utils/teacherOrgScope";

export const CATALOG_KINDS = [
  "model",
  "tag",
  "brochure",
  "extra_1",
  "extra_2",
] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

interface CatalogRow {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  image_url: string | null;
  extra_image_urls: string[] | null;
  file_size: number | null;
  created_at: string;
}

function parseExtraImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
}

function parseKind(raw: unknown): CatalogKind {
  let kind = String(raw ?? "").trim().toLowerCase();
  if (kind === "tags") kind = "tag";
  if (kind === "models") kind = "model";
  if ((CATALOG_KINDS as readonly string[]).includes(kind)) {
    return kind as CatalogKind;
  }
  throw new AppError("Invalid catalog kind", 400);
}

function resolveCatalogKind(req: Request): CatalogKind {
  const fromQuery = req.query.kind;
  const fromBody = req.body?.kind;
  const fromParams = req.params.kind;
  return parseKind(fromQuery ?? fromBody ?? fromParams);
}

export async function listCatalogItems(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const kind = resolveCatalogKind(req);
    const owner = adminCatalogOwnerSql(scope, "catalog_items", 2);
    const result = await pool.query<CatalogRow>(
      `SELECT id, kind, name, description, image_url, extra_image_urls, file_size, created_at
       FROM catalog_items
       WHERE kind = $1${owner.clause}
       ORDER BY created_at DESC`,
      [kind, owner.value]
    );
    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      items: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCatalogItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const kind = resolveCatalogKind(req);
    const rawName = String(req.body.name ?? "").trim();
    const name =
      rawName ||
      (req.file?.originalname
        ? req.file.originalname.replace(/\.[^.]+$/, "").trim()
        : "");
    const description = String(req.body.description ?? "").trim() || null;

    if (!name) throw new AppError("Name is required", 400);
    if (!req.file) throw new AppError("Image file is required", 400);

    const inserted = await pool.query<CatalogRow>(
      `INSERT INTO catalog_items (kind, name, description, file_size, owner_admin_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kind, name, description, image_url, extra_image_urls, file_size, created_at`,
      [kind, name, description, req.file.size, scope.adminUserId]
    );
    const item = inserted.rows[0];
    if (!item) throw new AppError("Failed to create item", 500);

    const imageUrl = await uploadCatalogFile(kind, item.id, req.file);
    const updated = await pool.query<CatalogRow>(
      `UPDATE catalog_items SET image_url = $1 WHERE id = $2
       RETURNING id, kind, name, description, image_url, extra_image_urls, file_size, created_at`,
      [imageUrl, item.id]
    );

    res.status(201).json({ status: "ok", item: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function updateCatalogItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = String(req.params.id ?? "").trim();
    if (!id) throw new AppError("id is required", 400);

    await assertCatalogRowOwnedByAdmin(scope, "catalog_items", id);

    const existing = await pool.query<CatalogRow>(
      `SELECT id, kind, name, description, image_url, extra_image_urls, file_size, created_at
       FROM catalog_items WHERE id = $1`,
      [id]
    );
    const row = existing.rows[0];
    if (!row) throw new AppError("Item not found", 404);

    const name =
      req.body.name !== undefined
        ? String(req.body.name).trim()
        : row.name;
    const description =
      req.body.description !== undefined
        ? String(req.body.description).trim() || null
        : row.description;

    let imageUrl = row.image_url;
    let fileSize = row.file_size;
    if (req.file) {
      imageUrl = await uploadCatalogFile(row.kind, row.id, req.file);
      fileSize = req.file.size;
    }

    const updated = await pool.query<CatalogRow>(
      `UPDATE catalog_items
       SET name = $1, description = $2, image_url = $3, file_size = $4
       WHERE id = $5
       RETURNING id, kind, name, description, image_url, extra_image_urls, file_size, created_at`,
      [name, description, imageUrl, fileSize, id]
    );

    res.status(200).json({ status: "ok", item: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function appendCatalogExtraImage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = String(req.params.id ?? "").trim();
    if (!id) throw new AppError("id is required", 400);
    if (!req.file) throw new AppError("Image file is required", 400);

    await assertCatalogRowOwnedByAdmin(scope, "catalog_items", id);

    const existing = await pool.query<CatalogRow>(
      `SELECT id, kind, extra_image_urls FROM catalog_items WHERE id = $1`,
      [id]
    );
    const row = existing.rows[0];
    if (!row) throw new AppError("Item not found", 404);

    const imageUrl = await uploadCatalogFile(row.kind, `${row.id}-extra`, req.file);
    const extras = parseExtraImageUrls(row.extra_image_urls);
    if (!extras.includes(imageUrl)) {
      extras.push(imageUrl);
    }

    const updated = await pool.query<CatalogRow>(
      `UPDATE catalog_items
       SET extra_image_urls = $1::jsonb
       WHERE id = $2
       RETURNING id, kind, name, description, image_url, extra_image_urls, file_size, created_at`,
      [JSON.stringify(extras), id]
    );

    res.status(200).json({ status: "ok", item: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function deleteCatalogItem(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = String(req.params.id ?? "").trim();
    await assertCatalogRowOwnedByAdmin(scope, "catalog_items", id);
    const result = await pool.query(
      `DELETE FROM catalog_items WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) throw new AppError("Item not found", 404);
    res.status(200).json({ status: "ok" });
  } catch (error) {
    next(error);
  }
}

async function teacherCatalogOwnerId(req: Request): Promise<string | null> {
  if (!req.user) throw new AppError("Authentication required", 401);
  const orgId = getTeacherOrgId(req.user);
  const orgTable = isInstituteStaff(req.user) ? "institutes" : "schools";
  return loadOrgOwnerAdminId(orgTable, orgId);
}

export async function listTeacherBrochures(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ownerAdminId = await teacherCatalogOwnerId(req);
    if (!ownerAdminId) {
      res.status(200).json({ status: "ok", count: 0, brochures: [] });
      return;
    }
    const result = await pool.query<CatalogRow>(
      `SELECT id, kind, name, description, image_url, file_size, created_at
       FROM catalog_items
       WHERE kind = 'brochure' AND image_url IS NOT NULL AND owner_admin_id = $1
       ORDER BY created_at DESC`,
      [ownerAdminId]
    );
    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      brochures: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        fileUrl: row.image_url,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getLatestTeacherBrochure(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ownerAdminId = await teacherCatalogOwnerId(req);
    if (!ownerAdminId) {
      res.status(200).json({ status: "ok", brochure: null });
      return;
    }
    const result = await pool.query<CatalogRow>(
      `SELECT id, kind, name, description, image_url, file_size, created_at
       FROM catalog_items
       WHERE kind = 'brochure' AND image_url IS NOT NULL AND owner_admin_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [ownerAdminId]
    );
    const row = result.rows[0] ?? null;
    res.status(200).json({
      status: "ok",
      brochure: row
        ? {
            id: row.id,
            name: row.name,
            fileUrl: row.image_url,
            createdAt: row.created_at,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
}
