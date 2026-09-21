import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import {
  adminSeesAllOrganizations,
  requireAdminScope,
} from "../utils/adminScope";

/**
 * GET /api/admin/dashboard-summary?year=2025
 * Scoped to schools/institutes owned by the logged-in admin (super admin sees all).
 */
export async function getDashboardSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const seeAll = await adminSeesAllOrganizations(scope, req);
    const year =
      typeof req.query.year === "string" ? req.query.year.trim() : "";

    const schoolValues: unknown[] = [];
    let schoolWhere = "";
    if (!seeAll) {
      schoolValues.push(scope.adminUserId);
      schoolWhere = ` WHERE owner_admin_id = $1`;
    }

    const instituteValues: unknown[] = [];
    let instituteWhere = "";
    if (!seeAll) {
      instituteValues.push(scope.adminUserId);
      instituteWhere = ` WHERE owner_admin_id = $1`;
    }

    const schoolStats = await pool.query<{
      total: string;
      active: string;
      inactive: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::text AS active,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = false)::text AS inactive
       FROM schools${schoolWhere}`,
      schoolValues
    );

    const instituteStats = await pool.query<{
      total: string;
      active: string;
      inactive: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::text AS active,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = false)::text AS inactive
       FROM institutes${instituteWhere}`,
      instituteValues
    );

    const studentValues: unknown[] = [];
    const studentFilters: string[] = ["s.school_id IS NOT NULL"];
    if (!seeAll) {
      studentValues.push(scope.adminUserId);
      studentFilters.push(`sc.owner_admin_id = $${studentValues.length}`);
    }
    const studentWhere = `WHERE ${studentFilters.join(" AND ")}`;

    const capturedExpr = `(s.status IN ('captured', 'printed') OR NULLIF(TRIM(s.photo_url), '') IS NOT NULL)`;

    const studentStats = await pool.query<{
      total: string;
      captured: string;
      uncaptured: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE ${capturedExpr})::text AS captured,
         COUNT(*) FILTER (WHERE NOT (${capturedExpr}))::text AS uncaptured
       FROM students s
       INNER JOIN schools sc ON sc.id = s.school_id
       ${studentWhere}`,
      studentValues
    );

    const instituteMemberValues: unknown[] = [];
    const instituteMemberFilters: string[] = ["s.institute_id IS NOT NULL"];
    if (!seeAll) {
      instituteMemberValues.push(scope.adminUserId);
      instituteMemberFilters.push(`i.owner_admin_id = $${instituteMemberValues.length}`);
    }
    const instituteMemberWhere = `WHERE ${instituteMemberFilters.join(" AND ")}`;

    const instituteMemberStats = await pool.query<{
      total: string;
      captured: string;
      uncaptured: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE ${capturedExpr})::text AS captured,
         COUNT(*) FILTER (WHERE NOT (${capturedExpr}))::text AS uncaptured
       FROM students s
       INNER JOIN institutes i ON i.id = s.institute_id
       ${instituteMemberWhere}`,
      instituteMemberValues
    );

    const templateCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM templates WHERE owner_admin_id = $1`,
      [scope.adminUserId]
    );
    const modelCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM catalog_items WHERE kind = 'model' AND owner_admin_id = $1`,
      [scope.adminUserId]
    );

    const overviewSchoolFilter = seeAll
      ? ""
      : ` AND s.owner_admin_id = $1`;
    const overviewInstituteFilter = seeAll
      ? ""
      : ` AND i.owner_admin_id = $1`;
    const overviewValues = seeAll ? [] : [scope.adminUserId];

    const overview = await pool.query<{
      day: string;
      schools: string;
      institutes: string;
    }>(
      `SELECT
         to_char(d::date, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::text FROM schools s WHERE s.created_at::date = d::date${overviewSchoolFilter}) AS schools,
         (SELECT COUNT(*)::text FROM institutes i WHERE i.created_at::date = d::date${overviewInstituteFilter}) AS institutes
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d`,
      overviewValues
    );

    const activityValues: unknown[] = [];
    const activityParts: string[] = [];

    if (seeAll) {
      activityParts.push(
        `SELECT 'school'::text AS kind, name AS title, created_at FROM schools`
      );
      activityParts.push(
        `SELECT 'institute', name, created_at FROM institutes`
      );
    } else {
      activityValues.push(scope.adminUserId);
      activityParts.push(
        `SELECT 'school'::text AS kind, name AS title, created_at FROM schools WHERE owner_admin_id = $1`
      );
      activityParts.push(
        `SELECT 'institute', name, created_at FROM institutes WHERE owner_admin_id = $1`
      );
    }

    activityValues.push(scope.adminUserId);
    const catalogParam = activityValues.length;
    activityParts.push(
      `SELECT 'template'::text AS kind, name AS title, created_at FROM templates WHERE owner_admin_id = $${catalogParam}`
    );
    activityParts.push(
      `SELECT kind, name, created_at FROM catalog_items WHERE owner_admin_id = $${catalogParam}`
    );

    const activity = await pool.query<{
      kind: string;
      title: string;
      created_at: string;
    }>(
      `SELECT kind, title, created_at FROM (
         ${activityParts.join(" UNION ALL ")}
       ) x
       ORDER BY created_at DESC NULLS LAST
       LIMIT 8`,
      activityValues
    );

    const schools = schoolStats.rows[0];
    const institutes = instituteStats.rows[0];
    const stats = studentStats.rows[0];
    const schoolPhotos = Number(stats?.total ?? 0);
    const schoolCaptured = Number(stats?.captured ?? 0);
    const schoolPending = Number(stats?.uncaptured ?? 0);

    const instStats = instituteMemberStats.rows[0];
    const institutePhotos = Number(instStats?.total ?? 0);
    const instituteCaptured = Number(instStats?.captured ?? 0);
    const institutePending = Number(instStats?.uncaptured ?? 0);

    res.status(200).json({
      status: "ok",
      year: year || null,
      totalSchools: Number(schools?.total ?? 0),
      activeSchools: Number(schools?.active ?? 0),
      inactiveSchools: Number(schools?.inactive ?? 0),
      totalInstitutes: Number(institutes?.total ?? 0),
      activeInstitutes: Number(institutes?.active ?? 0),
      inactiveInstitutes: Number(institutes?.inactive ?? 0),
      totalTemplates: Number(templateCount.rows[0]?.count ?? 0),
      totalModels: Number(modelCount.rows[0]?.count ?? 0),
      totalStudents: schoolPhotos,
      totalCaptured: schoolCaptured,
      totalUncaptured: schoolPending,
      schoolPhotos,
      schoolCaptured,
      schoolPending,
      institutePhotos,
      instituteCaptured,
      institutePending,
      overview: overview.rows.map((row) => ({
        day: row.day,
        schools: Number(row.schools),
        institutes: Number(row.institutes),
      })),
      recentActivity: activity.rows,
    });
  } catch (error) {
    next(error);
  }
}
