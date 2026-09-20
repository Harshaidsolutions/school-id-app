import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import type { InstituteRow, SchoolRow } from "../types/admin";
import {
  resolveModelImageUrl,
  resolveTagSelections,
  resolveTemplateImageUrl,
} from "../utils/orgSelectionImages";

/** GET /admin/schools/:id/organization-info — read-only teacher-submitted school details */
export async function getSchoolOrganizationInfo(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schoolId = req.params.id;
    if (!schoolId) throw new AppError("School id is required", 400);

    const result = await pool.query<
      SchoolRow & { template_name: string | null; template_image_url: string | null }
    >(
      `SELECT s.id, s.name, s.year, s.phone, s.phone2, s.school_code, s.address, s.instructions,
              s.logo_url, s.signature_url, s.organization_photo_url, s.model, s.tags,
              s.template_id, s.owner_admin_id, s.created_at,
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
    const instituteId = req.params.id;
    if (!instituteId) throw new AppError("Institute id is required", 400);

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
              i.logo_url, i.signature_url, i.created_at,
              i.model, i.tags, i.template_id, i.owner_admin_id,
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
