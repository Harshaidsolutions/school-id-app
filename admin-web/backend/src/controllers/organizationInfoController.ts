import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import type { InstituteRow, SchoolRow } from "../types/admin";
import {
  resolveModelImageUrl,
  resolveTagSelections,
  resolveTemplateImageUrl,
} from "../utils/orgSelectionImages";
import {
  assertInstituteOwnedByAdmin,
  assertSchoolOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";
import { sanitizeFieldVisibility } from "../utils/recordStatus";
import { routeParam } from "../utils/routeParams";

/** GET /admin/schools/:id/organization-info — read-only teacher-submitted school details */
export async function getSchoolOrganizationInfo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = routeParam(req.params.id);
    if (!schoolId) throw new AppError("School id is required", 400);
    const scope = await requireAdminScope(req);
    await assertSchoolOwnedByAdmin(scope, schoolId);

    const result = await pool.query<
      SchoolRow & { template_name: string | null; template_image_url: string | null }
    >(
      `SELECT s.id, s.name, s.year, s.phone, s.phone2, s.school_code, s.address, s.instructions,
              s.logo_url, s.signature_url, s.organization_photo_url, s.model, s.tags,
              s.template_id, s.owner_admin_id, s.created_at,
              COALESCE(s.field_visibility, '{}'::jsonb) AS field_visibility,
              COALESCE(s.allow_number_edit, true) AS allow_number_edit,
              COALESCE(s.allow_record_edit, true) AS allow_record_edit,
              COALESCE(s.show_captured_section, true) AS show_captured_section,
              t.name AS template_name,
              t.image_url AS template_image_url
       FROM schools s
       LEFT JOIN templates t ON t.id = s.template_id
       WHERE s.id = $1
       LIMIT 1`,
      [schoolId]
    );

    const school = result.rows[0];
    if (!school) throw new AppError("School not found", 404);

    const ownerAdminId = school.owner_admin_id ?? null;
    const [model_image_url, tag_items] = await Promise.all([
      resolveModelImageUrl(school.model, ownerAdminId),
      resolveTagSelections(school.tags, ownerAdminId),
    ]);
    const template_image_url =
      school.template_image_url ??
      (await resolveTemplateImageUrl(school.template_id));

    res.status(200).json({
      status: "ok",
      organization: {
        ...school,
        model_image_url,
        tag_items,
        template_image_url,
      },
    });
  } catch (error) {
    next(error);
  }
}

/** GET /admin/institutes/:id/organization-info — read-only institute profile details */
export async function getInstituteOrganizationInfo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const instituteId = routeParam(req.params.id);
    if (!instituteId) throw new AppError("Institute id is required", 400);
    const scope = await requireAdminScope(req);
    await assertInstituteOwnedByAdmin(scope, instituteId);

    const result = await pool.query<
      InstituteRow & {
        template_name: string | null;
        template_image_url: string | null;
        model: string | null;
        tags: string | null;
        template_id: string | null;
      }
    >(
      `SELECT i.id, i.name, i.year, i.phone, i.institute_code, i.address, i.instructions,
              i.logo_url, i.signature_url, i.organization_photo_url, i.created_at,
              i.model, i.tags, i.template_id, i.owner_admin_id,
              COALESCE(i.field_visibility, '{}'::jsonb) AS field_visibility,
              COALESCE(i.allow_number_edit, true) AS allow_number_edit,
              COALESCE(i.allow_record_edit, true) AS allow_record_edit,
              COALESCE(i.show_captured_section, true) AS show_captured_section,
              t.name AS template_name,
              t.image_url AS template_image_url
       FROM institutes i
       LEFT JOIN templates t ON t.id = i.template_id
       WHERE i.id = $1
       LIMIT 1`,
      [instituteId]
    );

    const institute = result.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    const ownerAdminId = institute.owner_admin_id ?? null;
    const [model_image_url, tag_items] = await Promise.all([
      resolveModelImageUrl(institute.model, ownerAdminId),
      resolveTagSelections(institute.tags, ownerAdminId),
    ]);
    const template_image_url =
      institute.template_image_url ??
      (await resolveTemplateImageUrl(institute.template_id));

    res.status(200).json({
      status: "ok",
      organization: {
        ...institute,
        model_image_url,
        tag_items,
        template_image_url,
      },
    });
  } catch (error) {
    next(error);
  }
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true || value === false) return value;
  throw new AppError("Settings must be true or false", 400);
}

async function saveOrgAppSettings(
  table: "schools" | "institutes",
  id: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const institute = table === "institutes";
  const current = await pool.query<{
    field_visibility: Record<string, boolean> | null;
    allow_number_edit: boolean;
    allow_record_edit: boolean;
    show_captured_section: boolean;
  }>(
    `SELECT COALESCE(field_visibility, '{}'::jsonb) AS field_visibility,
            COALESCE(allow_number_edit, true) AS allow_number_edit,
            COALESCE(allow_record_edit, true) AS allow_record_edit,
            COALESCE(show_captured_section, true) AS show_captured_section
     FROM ${table} WHERE id = $1 LIMIT 1`,
    [id]
  );
  const row = current.rows[0];
  if (!row) throw new AppError(institute ? "Institute not found" : "School not found", 404);

  const visibility =
    body.field_visibility !== undefined
      ? sanitizeFieldVisibility(body.field_visibility, institute)
      : row.field_visibility ?? {};
  const allowNumberEdit = readBool(body.allow_number_edit, row.allow_number_edit);
  const allowRecordEdit = readBool(body.allow_record_edit, row.allow_record_edit);
  const showCaptured = readBool(body.show_captured_section, row.show_captured_section);

  const updated = await pool.query(
    `UPDATE ${table}
     SET field_visibility = $2::jsonb,
         allow_number_edit = $3,
         allow_record_edit = $4,
         show_captured_section = $5
     WHERE id = $1
     RETURNING field_visibility, allow_number_edit, allow_record_edit, show_captured_section`,
    [id, JSON.stringify(visibility), allowNumberEdit, allowRecordEdit, showCaptured]
  );
  return updated.rows[0] as Record<string, unknown>;
}

export async function updateSchoolAppSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = routeParam(req.params.id);
    if (!schoolId) throw new AppError("School id is required", 400);
    const scope = await requireAdminScope(req);
    await assertSchoolOwnedByAdmin(scope, schoolId);
    const settings = await saveOrgAppSettings(
      "schools",
      schoolId,
      req.body as Record<string, unknown>
    );
    res.status(200).json({ status: "ok", settings });
  } catch (error) {
    next(error);
  }
}

export async function updateInstituteAppSettings(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const instituteId = routeParam(req.params.id);
    if (!instituteId) throw new AppError("Institute id is required", 400);
    const scope = await requireAdminScope(req);
    await assertInstituteOwnedByAdmin(scope, instituteId);
    const settings = await saveOrgAppSettings(
      "institutes",
      instituteId,
      req.body as Record<string, unknown>
    );
    res.status(200).json({ status: "ok", settings });
  } catch (error) {
    next(error);
  }
}
