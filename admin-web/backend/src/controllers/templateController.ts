import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadTemplateImage } from "../config/storage";
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
import {
  isTemplateOrientation,
  type TemplateRow,
} from "../types/admin";
import { routeParam } from "../utils/routeParams";

function parseConfigJson(raw: unknown): unknown {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      throw new AppError("config_json must be valid JSON", 400);
    }
  }
  return null;
}

/** Admin: create a template owned by the logged-in admin (not shared with other admins). */
export async function createTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const name = String(req.body.name ?? "").trim();
    const orientation = String(req.body.orientation ?? "").trim();
    const configJson = parseConfigJson(req.body.config_json ?? req.body.configJson);

    if (!name) throw new AppError("Template name is required", 400);
    if (!isTemplateOrientation(orientation)) {
      throw new AppError(
        "orientation must be one of: vertical_single, vertical_both, horizontal_single, horizontal_both, staff_id",
        400
      );
    }

    const inserted = await pool.query<TemplateRow>(
      `INSERT INTO templates (school_id, name, orientation, config_json, owner_admin_id)
       VALUES (NULL, $1, $2, $3, $4)
       RETURNING *`,
      [name, orientation, configJson, scope.adminUserId]
    );

    const template = inserted.rows[0];
    if (!template) throw new AppError("Failed to create template", 500);

    if (req.file) {
      const imageUrl = await uploadTemplateImage(template.id, req.file);
      const updated = await pool.query<TemplateRow>(
        `UPDATE templates SET image_url = $1 WHERE id = $2 RETURNING *`,
        [imageUrl, template.id]
      );
      res.status(201).json({ status: "ok", template: updated.rows[0] });
      return;
    }

    res.status(201).json({ status: "ok", template });
  } catch (error) {
    next(error);
  }
}

/** Admin: list templates owned by the logged-in admin. */
export async function listTemplates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const orientation =
      typeof req.query.orientation === "string"
        ? req.query.orientation.trim()
        : "";

    const values: unknown[] = [];
    const conditions: string[] = [];
    const owner = adminCatalogOwnerSql(scope, "templates", 1);
    conditions.push(`owner_admin_id = $${values.length + 1}`);
    values.push(owner.value);
    if (orientation) {
      if (!isTemplateOrientation(orientation)) {
        throw new AppError("Invalid orientation filter", 400);
      }
      values.push(orientation);
      conditions.push(`orientation = $${values.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query<TemplateRow>(
      `SELECT * FROM templates
       ${where}
       ORDER BY created_at DESC`,
      values
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      templates: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

/** @deprecated Prefer listTemplates — kept so old admin clients with /templates/:schoolId still work. */
export async function listTemplatesBySchool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  return listTemplates(req, res, next);
}

export async function updateTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Template id is required", 400);

    await assertCatalogRowOwnedByAdmin(scope, "templates", id);

    const existing = await pool.query<TemplateRow>(
      `SELECT * FROM templates WHERE id = $1 LIMIT 1`,
      [id]
    );
    const template = existing.rows[0];
    if (!template) throw new AppError("Template not found", 404);

    const name =
      req.body.name !== undefined
        ? String(req.body.name).trim()
        : template.name;
    if (!name) throw new AppError("Template name is required", 400);

    let orientation = template.orientation;
    if (req.body.orientation !== undefined) {
      const nextOrientation = String(req.body.orientation).trim();
      if (!isTemplateOrientation(nextOrientation)) {
        throw new AppError("Invalid orientation", 400);
      }
      orientation = nextOrientation;
    }

    const configJson =
      req.body.config_json !== undefined || req.body.configJson !== undefined
        ? parseConfigJson(req.body.config_json ?? req.body.configJson)
        : template.config_json;

    let imageUrl = template.image_url;
    if (req.file) {
      imageUrl = await uploadTemplateImage(template.id, req.file);
    }

    // Ensure row is treated as global going forward
    const updated = await pool.query<TemplateRow>(
      `UPDATE templates
       SET name = $1, orientation = $2, config_json = $3, image_url = $4, school_id = NULL
       WHERE id = $5
       RETURNING *`,
      [name, orientation, configJson, imageUrl, id]
    );

    res.status(200).json({ status: "ok", template: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function deleteTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Template id is required", 400);

    await assertCatalogRowOwnedByAdmin(scope, "templates", id);

    const result = await pool.query(
      `DELETE FROM templates WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rows[0]) throw new AppError("Template not found", 404);

    await pool.query(
      `UPDATE schools SET template_id = NULL WHERE template_id = $1`,
      [id]
    );

    res.status(200).json({ status: "ok", deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function bulkDeleteTemplates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const raw = req.body?.ids;
    if (!Array.isArray(raw)) throw new AppError("ids are required", 400);
    const ids = [
      ...new Set(
        raw.map((id: unknown) => String(id).trim()).filter((id) => id.length > 0)
      ),
    ];
    if (ids.length === 0) throw new AppError("Select at least one item", 400);
    if (ids.length > 200) {
      throw new AppError("Select 200 items or fewer at a time", 400);
    }
    const deleted: string[] = [];
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await assertCatalogRowOwnedByAdmin(scope, "templates", id);
        const result = await pool.query(
          `DELETE FROM templates WHERE id = $1 RETURNING id`,
          [id]
        );
        if (!result.rows[0]) {
          failed.push({ id, message: "Template not found" });
          continue;
        }
        await pool.query(
          `UPDATE schools SET template_id = NULL WHERE template_id = $1`,
          [id]
        );
        await pool.query(
          `UPDATE institutes SET template_id = NULL WHERE template_id = $1`,
          [id]
        );
        deleted.push(id);
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

/** Teacher: all global templates + this school's selected template_id. */
export async function listTeacherTemplates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const orientation =
      typeof req.query.orientation === "string"
        ? req.query.orientation.trim()
        : "";

    const orgId = getTeacherOrgId(req.user);
    const orgTable = isInstituteStaff(req.user) ? "institutes" : "schools";
    const ownerAdminId = await loadOrgOwnerAdminId(orgTable, orgId);
    if (!ownerAdminId) {
      res.status(200).json({
        status: "ok",
        count: 0,
        selectedTemplateId: null,
        templates: [],
      });
      return;
    }

    const values: unknown[] = [ownerAdminId];
    const conditions: string[] = [`owner_admin_id = $1`];
    if (orientation) {
      if (!isTemplateOrientation(orientation)) {
        throw new AppError("Invalid orientation filter", 400);
      }
      values.push(orientation);
      conditions.push(`orientation = $${values.length}`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const result = await pool.query<TemplateRow>(
      `SELECT * FROM templates
       ${where}
       ORDER BY created_at DESC`,
      values
    );
    const selected = isInstituteStaff(req.user)
      ? await pool.query<{ template_id: string | null }>(
          `SELECT template_id FROM institutes WHERE id = $1`,
          [orgId]
        )
      : await pool.query<{ template_id: string | null }>(
          `SELECT template_id FROM schools WHERE id = $1`,
          [orgId]
        );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      selectedTemplateId: selected.rows[0]?.template_id ?? null,
      templates: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function selectTeacherTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError("Authentication required", 401);
    }

    const { id } = req.params;
    if (!id) throw new AppError("Template id is required", 400);

    const orgId = getTeacherOrgId(req.user);
    const orgTable = isInstituteStaff(req.user) ? "institutes" : "schools";
    const ownerAdminId = await loadOrgOwnerAdminId(orgTable, orgId);
    if (!ownerAdminId) {
      throw new AppError("Template not found", 404);
    }

    const template = await pool.query<TemplateRow>(
      `SELECT * FROM templates WHERE id = $1 AND owner_admin_id = $2 LIMIT 1`,
      [id, ownerAdminId]
    );
    if (!template.rows[0]) {
      throw new AppError("Template not found", 404);
    }
    if (isInstituteStaff(req.user)) {
      await pool.query(`UPDATE institutes SET template_id = $1 WHERE id = $2`, [
        id,
        orgId,
      ]);
    } else {
      await pool.query(`UPDATE schools SET template_id = $1 WHERE id = $2`, [
        id,
        orgId,
      ]);
    }

    res.status(200).json({
      status: "ok",
      selectedTemplateId: id,
      template: template.rows[0],
    });
  } catch (error) {
    next(error);
  }
}
