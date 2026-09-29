import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadSchoolAsset } from "../config/storage";
import { loadOrgOwnerAdminId } from "../utils/adminScope";
import {
  getTeacherOrgId,
  isInstituteStaff,
} from "../utils/teacherOrgScope";
import type { InstituteRow, SchoolRow, TemplateRow } from "../types/admin";

function orgFiles(req: Request): {
  logo?: Express.Multer.File;
  signature?: Express.Multer.File;
  organization?: Express.Multer.File;
} {
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;
  return {
    logo: files?.logo?.[0],
    signature: files?.signature?.[0],
    organization: files?.organization?.[0],
  };
}

/**
 * GET /teacher/organization — school profile for Organization Details screen
 */
export async function getTeacherOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const orgId = getTeacherOrgId(req.user);

    const row = isInstituteStaff(req.user)
      ? (
          await pool.query<InstituteRow>(
            `SELECT id, name, year, phone, institute_code, address, instructions,
                    logo_url, signature_url, organization_photo_url, model, tags,
                    template_id, created_at,
                    COALESCE(allow_screenshot, true) AS allow_screenshot,
                    COALESCE(allow_screen_recording, true) AS allow_screen_recording,
                    COALESCE(field_visibility, '{}'::jsonb) AS field_visibility,
                    COALESCE(allow_number_edit, true) AS allow_number_edit,
                    COALESCE(show_captured_section, true) AS show_captured_section
             FROM institutes
             WHERE id = $1
             LIMIT 1`,
            [orgId]
          )
        ).rows[0]
      : (
          await pool.query<SchoolRow>(
            `SELECT id, name, year, phone, phone2, school_code, address, instructions,
                    logo_url, signature_url, organization_photo_url, model, tags,
                    template_id, created_at,
                    COALESCE(allow_screenshot, true) AS allow_screenshot,
                    COALESCE(allow_screen_recording, true) AS allow_screen_recording,
                    COALESCE(field_visibility, '{}'::jsonb) AS field_visibility,
                    COALESCE(allow_number_edit, true) AS allow_number_edit,
                    COALESCE(show_captured_section, true) AS show_captured_section
             FROM schools
             WHERE id = $1
             LIMIT 1`,
            [orgId]
          )
        ).rows[0];

    if (!row) {
      throw new AppError(
        isInstituteStaff(req.user) ? "Institute not found" : "School not found",
        404
      );
    }

    const orgTable = isInstituteStaff(req.user) ? "institutes" : "schools";
    const ownerAdminId = await loadOrgOwnerAdminId(orgTable, orgId);
    const templates =
      ownerAdminId != null
        ? await pool.query<Pick<TemplateRow, "id" | "name" | "orientation">>(
            `SELECT id, name, orientation
             FROM templates
             WHERE owner_admin_id = $1
             ORDER BY name ASC`,
            [ownerAdminId]
          )
        : { rows: [] };

    res.status(200).json({
      status: "ok",
      orgType: isInstituteStaff(req.user) ? "institute" : "school",
      school: row,
      templates: templates.rows,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /teacher/organization — update school details + optional image uploads
 */
export async function updateTeacherOrganization(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const orgId = getTeacherOrgId(req.user);
    const instituteUser = isInstituteStaff(req.user);

    if (instituteUser) {
      const existing = await pool.query<InstituteRow>(
        `SELECT * FROM institutes WHERE id = $1 LIMIT 1`,
        [orgId]
      );
      const institute = existing.rows[0];
      if (!institute) throw new AppError("Institute not found", 404);

      const phone =
        req.body.phone !== undefined
          ? String(req.body.phone).trim() || null
          : institute.phone;
      const instituteCode =
        req.body.institute_code !== undefined ||
        req.body.instituteCode !== undefined ||
        req.body.school_code !== undefined ||
        req.body.schoolCode !== undefined
          ? String(
              req.body.institute_code ??
                req.body.instituteCode ??
                req.body.school_code ??
                req.body.schoolCode
            ).trim() || null
          : institute.institute_code;
      const address =
        req.body.address !== undefined
          ? String(req.body.address).trim() || null
          : institute.address;
      const instructions =
        req.body.instructions !== undefined
          ? String(req.body.instructions).trim() || null
          : institute.instructions;
      const model =
        req.body.model !== undefined
          ? String(req.body.model).trim() || null
          : institute.model ?? null;
      const tags =
        req.body.tags !== undefined
          ? String(req.body.tags).trim() || null
          : institute.tags ?? null;
      const year =
        req.body.year !== undefined
          ? String(req.body.year).trim() || null
          : institute.year;
      const templateId =
        req.body.template_id !== undefined || req.body.templateId !== undefined
          ? String(req.body.template_id ?? req.body.templateId).trim() || null
          : institute.template_id ?? null;

      if (templateId) {
        const ownerAdminId = await loadOrgOwnerAdminId("institutes", orgId);
        const tpl = await pool.query(
          `SELECT id FROM templates WHERE id = $1 AND owner_admin_id = $2 LIMIT 1`,
          [templateId, ownerAdminId]
        );
        if (!tpl.rows[0]) {
          throw new AppError("Template not found", 400);
        }
      }

      const { logo, signature, organization } = orgFiles(req);
      let logoUrl = institute.logo_url;
      let signatureUrl = institute.signature_url;
      let organizationPhotoUrl =
        institute.organization_photo_url ?? null;

      if (logo) {
        logoUrl = await uploadSchoolAsset(orgId, "logo", logo);
      }
      if (signature) {
        signatureUrl = await uploadSchoolAsset(orgId, "signature", signature);
      }
      if (organization) {
        organizationPhotoUrl = await uploadSchoolAsset(
          orgId,
          "organization",
          organization
        );
      }

      const updated = await pool.query<InstituteRow>(
        `UPDATE institutes
         SET phone = $1,
             institute_code = $2,
             address = $3,
             instructions = $4,
             model = $5,
             tags = $6,
             template_id = $7,
             logo_url = $8,
             signature_url = $9,
             organization_photo_url = $10,
             year = $11
         WHERE id = $12
         RETURNING id, name, year, phone, institute_code, address, instructions,
                   logo_url, signature_url, organization_photo_url, model, tags,
                   template_id, created_at`,
        [
          phone,
          instituteCode,
          address,
          instructions,
          model,
          tags,
          templateId,
          logoUrl,
          signatureUrl,
          organizationPhotoUrl,
          year,
          orgId,
        ]
      );

      res.status(200).json({
        status: "ok",
        orgType: "institute",
        school: updated.rows[0],
      });
      return;
    }

    const existing = await pool.query<SchoolRow>(
      `SELECT * FROM schools WHERE id = $1 LIMIT 1`,
      [orgId]
    );
    const school = existing.rows[0];
    if (!school) throw new AppError("School not found", 404);

    const phone =
      req.body.phone !== undefined
        ? String(req.body.phone).trim() || null
        : school.phone;
    const schoolCode =
      req.body.school_code !== undefined || req.body.schoolCode !== undefined
        ? String(req.body.school_code ?? req.body.schoolCode).trim() || null
        : school.school_code;
    const address =
      req.body.address !== undefined
        ? String(req.body.address).trim() || null
        : school.address;
    const instructions =
      req.body.instructions !== undefined
        ? String(req.body.instructions).trim() || null
        : school.instructions;
    const model =
      req.body.model !== undefined
        ? String(req.body.model).trim() || null
        : school.model ?? null;
    const tags =
      req.body.tags !== undefined
        ? String(req.body.tags).trim() || null
        : school.tags ?? null;
    const phone2 =
      req.body.phone2 !== undefined
        ? String(req.body.phone2).trim() || null
        : school.phone2 ?? null;
    const year =
      req.body.year !== undefined
        ? String(req.body.year).trim() || null
        : school.year;
    const templateId =
      req.body.template_id !== undefined || req.body.templateId !== undefined
        ? String(req.body.template_id ?? req.body.templateId).trim() || null
        : school.template_id;

    if (templateId) {
      const ownerAdminId = await loadOrgOwnerAdminId("schools", orgId);
      const tpl = await pool.query(
        `SELECT id FROM templates WHERE id = $1 AND owner_admin_id = $2 LIMIT 1`,
        [templateId, ownerAdminId]
      );
      if (!tpl.rows[0]) {
        throw new AppError("Template not found", 400);
      }
    }

    const { logo, signature, organization } = orgFiles(req);
    let logoUrl = school.logo_url;
    let signatureUrl = school.signature_url;
    let organizationPhotoUrl = school.organization_photo_url ?? null;

    if (logo) {
      logoUrl = await uploadSchoolAsset(orgId, "logo", logo);
    }
    if (signature) {
      signatureUrl = await uploadSchoolAsset(orgId, "signature", signature);
    }
    if (organization) {
      organizationPhotoUrl = await uploadSchoolAsset(
        orgId,
        "organization",
        organization
      );
    }

    const updated = await pool.query<SchoolRow>(
      `UPDATE schools
       SET phone = $1,
           phone2 = $2,
           school_code = $3,
           address = $4,
           instructions = $5,
           model = $6,
           tags = $7,
           template_id = $8,
           logo_url = $9,
           signature_url = $10,
           organization_photo_url = $11,
           year = $12
       WHERE id = $13
       RETURNING id, name, year, phone, phone2, school_code, address, instructions,
                 logo_url, signature_url, organization_photo_url, model, tags,
                 template_id, created_at`,
      [
        phone,
        phone2,
        schoolCode,
        address,
        instructions,
        model,
        tags,
        templateId,
        logoUrl,
        signatureUrl,
        organizationPhotoUrl,
        year,
        orgId,
      ]
    );

    res.status(200).json({
      status: "ok",
      orgType: "school",
      school: updated.rows[0],
    });
  } catch (error) {
    next(error);
  }
}
