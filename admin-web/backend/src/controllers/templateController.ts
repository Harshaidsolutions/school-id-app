import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadTemplateImage } from "../config/storage";
import {
  getTeacherOrgId,
  isInstituteStaff,
} from "../utils/teacherOrgScope";
import {
  isTemplateOrientation,
  type TemplateRow,
} from "../types/admin";

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

/** Admin: create a global template (visible to all schools / teachers).
 * school_id in the request body is ignored — templates are not school-scoped.
 */
export async function createTemplate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Intentionally ignore school_id / schoolId if clients still send them
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
      `INSERT INTO templates (school_id, name, orientation, config_json)
       VALUES (NULL, $1, $2, $3)
       RETURNING *`,
      [name, orientation, configJson]
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

/** Admin: list all global templates (optional orientation filter). */
export async function listTemplates(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const orientation =
      typeof req.query.orientation === "string"
        ? req.query.orientation.trim()
        : "";

    const values: unknown[] = [];
    const conditions: string[] = [];
    if (orientation) {
      if (!isTemplateOrientation(orientation)) {
        throw new AppError("Invalid orientation filter", 400);
      }
      values.push(orientation);
      conditions.push(`orientation = $${values.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
    const { id } = req.params;
    if (!id) throw new AppError("Template id is required", 400);

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
    const { id } = req.params;
    if (!id) throw new AppError("Template id is required", 400);

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

    const values: unknown[] = [];
    const conditions: string[] = [];
    if (orientation) {
      if (!isTemplateOrientation(orientation)) {
        throw new AppError("Invalid orientation filter", 400);
      }
      values.push(orientation);
      conditions.push(`orientation = $${values.length}`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query<TemplateRow>(
      `SELECT * FROM templates
       ${where}
       ORDER BY created_at DESC`,
      values
    );

    const orgId = getTeacherOrgId(req.user);
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

    const template = await pool.query<TemplateRow>(
      `SELECT * FROM templates WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!template.rows[0]) {
      throw new AppError("Template not found", 404);
    }

    const orgId = getTeacherOrgId(req.user);
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
