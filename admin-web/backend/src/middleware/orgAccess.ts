import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { isOrganizationActive } from "../utils/parseBoolean";
import { AppError } from "./errorHandler";

export const SCHOOL_INACTIVE_MSG =
  "Your school account is currently inactive. Please contact the administrator.";
export const INSTITUTE_INACTIVE_MSG =
  "Your institute account is currently inactive. Please contact the administrator.";

const TEACHER_UNLINKED_MSG =
  "Teacher account is not linked to a school or institute. Please contact the administrator.";

export async function assertTeacherOrgActive(options: {
  schoolId?: string | null;
  instituteId?: string | null;
  schoolIsActive?: boolean | null;
  instituteIsActive?: boolean | null;
}): Promise<void> {
  const { schoolId, instituteId, schoolIsActive, instituteIsActive } = options;

  if (schoolId) {
    if (schoolIsActive !== undefined && schoolIsActive !== null) {
      if (!isOrganizationActive(schoolIsActive)) {
        throw new AppError(SCHOOL_INACTIVE_MSG, 403);
      }
      return;
    }

    const result = await pool.query<{ is_active: boolean | null }>(
      `SELECT is_active FROM schools WHERE id = $1::uuid LIMIT 1`,
      [schoolId]
    );
    if (!result.rows[0]) {
      throw new AppError("School not found", 404);
    }
    if (!isOrganizationActive(result.rows[0].is_active)) {
      throw new AppError(SCHOOL_INACTIVE_MSG, 403);
    }
    return;
  }

  if (instituteId) {
    if (instituteIsActive !== undefined && instituteIsActive !== null) {
      if (!isOrganizationActive(instituteIsActive)) {
        throw new AppError(INSTITUTE_INACTIVE_MSG, 403);
      }
      return;
    }

    const result = await pool.query<{ is_active: boolean | null }>(
      `SELECT is_active FROM institutes WHERE id = $1::uuid LIMIT 1`,
      [instituteId]
    );
    if (!result.rows[0]) {
      throw new AppError("Institute not found", 404);
    }
    if (!isOrganizationActive(result.rows[0].is_active)) {
      throw new AppError(INSTITUTE_INACTIVE_MSG, 403);
    }
    return;
  }

  throw new AppError(TEACHER_UNLINKED_MSG, 403);
}

/** Block teacher API access when the linked school/institute is turned OFF. */
export async function requireActiveTeacherOrg(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (req.user?.role === "organization_staff") {
      if (!req.user.organizationId) throw new AppError("Account is not linked to an organization", 403);
      const result = await pool.query("SELECT is_active FROM organizations WHERE id = $1", [req.user.organizationId]);
      if (!result.rows[0] || result.rows[0].is_active === false) throw new AppError("Organization is inactive. Contact the administrator.", 403);
      next(); return;
    }
    if (
      !req.user ||
      (req.user.role !== "teacher" && req.user.role !== "institute_staff")
    ) {
      next();
      return;
    }
    await assertTeacherOrgActive({
      schoolId: req.user.schoolId,
      instituteId: req.user.instituteId,
    });
    next();
  } catch (error) {
    next(error);
  }
}
