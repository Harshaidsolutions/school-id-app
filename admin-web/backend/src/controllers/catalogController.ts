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
  video_url?: string | null;
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

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

function isVideoUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();
  const extOk =
    name.endsWith(".mp4") || name.endsWith(".webm") || name.endsWith(".mov");
  const mimeOk =
    mime === "video/mp4" ||
    mime === "video/webm" ||
    mime === "video/quicktime" ||
    mime === "application/octet-stream";
  return extOk && mimeOk;
}

function catalogUploads(req: Request): {
  image?: Express.Multer.File;
  video?: Express.Multer.File;
} {
  const bag = req.files as
    | { file?: Express.Multer.File[]; video?: Express.Multer.File[] }
    | undefined;
  const primary = bag?.file?.[0] ?? req.file;
  const extraVideo = bag?.video?.[0];
  let image: Express.Multer.File | undefined;
  let video: Express.Multer.File | undefined;
  if (primary) {
    if (isVideoUpload(primary)) video = primary;
    else image = primary;
  }
  if (extraVideo) {
    if (!isVideoUpload(extraVideo)) {
      throw new AppError("Video must be an MP4, WEBM, or MOV file", 400);
    }
    video = extraVideo;
  }
  if (image && image.size > IMAGE_MAX_BYTES) {
    throw new AppError("Image or PDF must be 10MB or smaller", 400);
  }
  if (video && video.size > VIDEO_MAX_BYTES) {
    throw new AppError("Video must be 50MB or smaller", 400);
  }
  return { image, video };
}

function parseBulkIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new AppError("ids are required", 400);
  const ids = [
    ...new Set(raw.map((id) => String(id).trim()).filter((id) => id.length > 0)),
  ];
  if (ids.length === 0) throw new AppError("Select at least one item", 400);
  if (ids.length > 200) {
    throw new AppError("Select 200 items or fewer at a time", 400);
  }
  return ids;
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
      `SELECT id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at
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
    const uploads = catalogUploads(req);
    if (kind !== "model" && uploads.video) {
      throw new AppError("Video upload is only allowed for models", 400);
    }
    if (!uploads.image && !uploads.video) {
      throw new AppError("Image file is required", 400);
    }
    if (kind !== "model" && !uploads.image) {
      throw new AppError("Image file is required", 400);
    }
    const primary = uploads.image ?? uploads.video;
    const rawName = String(req.body.name ?? "").trim();
    const name =
      rawName ||
      (primary?.originalname
        ? primary.originalname.replace(/\.[^.]+$/, "").trim()
        : "");
    const description = String(req.body.description ?? "").trim() || null;

    if (!name) throw new AppError("Name is required", 400);

    const inserted = await pool.query<CatalogRow>(
      `INSERT INTO catalog_items (kind, name, description, file_size, owner_admin_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at`,
      [kind, name, description, primary?.size ?? 0, scope.adminUserId]
    );
    const item = inserted.rows[0];
    if (!item) throw new AppError("Failed to create item", 500);

    const imageUrl = uploads.image
      ? await uploadCatalogFile(kind, item.id, uploads.image)
      : null;
    const videoUrl = uploads.video
      ? await uploadCatalogFile(kind, `${item.id}-video`, uploads.video)
      : null;
    const updated = await pool.query<CatalogRow>(
      `UPDATE catalog_items
       SET image_url = $1, video_url = $2, file_size = $3
       WHERE id = $4
       RETURNING id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at`,
      [imageUrl, videoUrl, primary?.size ?? 0, item.id]
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
      `SELECT id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at
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

    const uploads = catalogUploads(req);
    if (row.kind !== "model" && uploads.video) {
      throw new AppError("Video upload is only allowed for models", 400);
    }
    let imageUrl = row.image_url;
    let videoUrl = row.video_url ?? null;
    let fileSize = row.file_size;
    if (uploads.image) {
      imageUrl = await uploadCatalogFile(row.kind, row.id, uploads.image);
      fileSize = uploads.image.size;
    }
    if (uploads.video) {
      videoUrl = await uploadCatalogFile(row.kind, `${row.id}-video`, uploads.video);
      fileSize = uploads.video.size;
    }

    const updated = await pool.query<CatalogRow>(
      `UPDATE catalog_items
       SET name = $1, description = $2, image_url = $3, video_url = $4, file_size = $5
       WHERE id = $6
       RETURNING id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at`,
      [name, description, imageUrl, videoUrl, fileSize, id]
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
       RETURNING id, kind, name, description, image_url, video_url, extra_image_urls, file_size, created_at`,
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

export async function bulkDeleteCatalogItems(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const ids = parseBulkIds(req.body?.ids);
    const deleted: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await assertCatalogRowOwnedByAdmin(scope, "catalog_items", id);
        const result = await pool.query(
          `DELETE FROM catalog_items WHERE id = $1 RETURNING id`,
          [id]
        );
        if (!result.rows[0]) {
          failed.push({ id, message: "Item not found" });
        } else {
          deleted.push(id);
        }
      } catch (error) {
        failed.push({
          id,
          message: error instanceof AppError ? error.message : "Delete failed",
        });
      }
    }
    const status =
      failed.length === 0 ? "ok" : deleted.length === 0 ? "error" : "partial";
    res.status(deleted.length === 0 ? 400 : 200).json({
      status,
      deleted,
      failed,
      deletedCount: deleted.length,
      failedCount: failed.length,
    });
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
