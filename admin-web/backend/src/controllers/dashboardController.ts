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
    const ownedSchool = seeAll
      ? `(owner_admin_id = $1 OR owner_admin_id IS NULL)`
      : `owner_admin_id = $1`;
    const ownedInstitute = seeAll
      ? `(owner_admin_id = $1 OR owner_admin_id IS NULL)`
      : `owner_admin_id = $1`;

    const schoolWhere = ` WHERE ${ownedSchool}`;
    const instituteWhere = ` WHERE ${ownedInstitute}`;

    const studentValues: unknown[] = [scope.adminUserId];
    const studentFilters: string[] = [
      "s.school_id IS NOT NULL",
      "COALESCE(sc.is_active, true) = true",
      seeAll
        ? `(sc.owner_admin_id = $1 OR sc.owner_admin_id IS NULL)`
        : `sc.owner_admin_id = $1`,
    ];
    const studentWhere = `WHERE ${studentFilters.join(" AND ")}`;

    const capturedExpr = `LOWER(COALESCE(s.status, '')) IN ('captured', 'printed')`;

    const instituteMemberValues: unknown[] = [scope.adminUserId];
    const instituteMemberFilters: string[] = [
      "s.institute_id IS NOT NULL",
      "COALESCE(i.is_active, true) = true",
      seeAll
        ? `(i.owner_admin_id = $1 OR i.owner_admin_id IS NULL)`
        : `i.owner_admin_id = $1`,
    ];
    const instituteMemberWhere = `WHERE ${instituteMemberFilters.join(" AND ")}`;

    const modelCountSql = `SELECT COUNT(*)::text AS count FROM catalog_items WHERE kind = 'model' AND owner_admin_id = $1`;

    const overviewSchoolFilter = seeAll
      ? ` AND (s.owner_admin_id = $1 OR s.owner_admin_id IS NULL)`
      : ` AND s.owner_admin_id = $1`;
    const overviewInstituteFilter = seeAll
      ? ` AND (i.owner_admin_id = $1 OR i.owner_admin_id IS NULL)`
      : ` AND i.owner_admin_id = $1`;
    const overviewValues = [scope.adminUserId];

    const overviewSql = `SELECT
         to_char(d::date, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::text FROM schools s WHERE s.created_at::date = d::date${overviewSchoolFilter}) AS schools,
         (SELECT COUNT(*)::text FROM institutes i WHERE i.created_at::date = d::date${overviewInstituteFilter}) AS institutes
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d`;

    const activityValues: unknown[] = [];
    const activityParts: string[] = [];

    activityValues.push(scope.adminUserId);
    const ownedActivity = seeAll
      ? `(owner_admin_id = $1 OR owner_admin_id IS NULL)`
      : `owner_admin_id = $1`;
    activityParts.push(
      `SELECT 'school'::text AS kind, name AS title, created_at FROM schools WHERE ${ownedActivity}`
    );
    activityParts.push(
      `SELECT 'institute', name, created_at FROM institutes WHERE ${ownedActivity}`
    );

    activityValues.push(scope.adminUserId);
    const catalogParam = activityValues.length;
    activityParts.push(
      `SELECT 'template'::text AS kind, name AS title, created_at FROM templates WHERE owner_admin_id = $${catalogParam}`
    );
    activityParts.push(
      `SELECT kind, name, created_at FROM catalog_items WHERE owner_admin_id = $${catalogParam}`
    );

    const activitySql = `SELECT kind, title, created_at FROM (
         ${activityParts.join(" UNION ALL ")}
       ) x
       ORDER BY created_at DESC NULLS LAST
       LIMIT 8`;

    const [
      schoolStats,
      instituteStats,
      organizationStats,
      organizationRecordStats,
      studentStats,
      instituteMemberStats,
      templateCount,
      modelCount,
      overview,
      activity,
    ] = await Promise.all([
      pool.query<{ total: string; active: string; inactive: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::text AS active,
           COUNT(*) FILTER (WHERE COALESCE(is_active, true) = false)::text AS inactive
         FROM schools${schoolWhere}`,
        [scope.adminUserId]
      ),
      pool.query<{ total: string; active: string; inactive: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::text AS active,
           COUNT(*) FILTER (WHERE COALESCE(is_active, true) = false)::text AS inactive
         FROM institutes${instituteWhere}`,
        [scope.adminUserId]
      ),
      pool.query<{ total: string; active: string; inactive: string }>(
        `SELECT COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE COALESCE(is_active, true))::text AS active,
          COUNT(*) FILTER (WHERE NOT COALESCE(is_active, true))::text AS inactive
         FROM organizations WHERE ($2::boolean OR owner_admin_id = $1)`,
        [scope.adminUserId, seeAll]
      ),
      pool.query<{ total: string; captured: string; uncaptured: string }>(
        `WITH records AS (
          SELECT s.id, EXISTS (
            SELECT 1 FROM organization_form_fields f WHERE f.form_id = s.form_id
              AND f.enabled AND f.field_type = 'photo' AND f.field_name NOT ILIKE '%signature%'
          ) AND NOT EXISTS (
            SELECT 1 FROM organization_form_fields f
            LEFT JOIN organization_submission_values v ON v.field_id = f.id AND v.submission_id = s.id
            WHERE f.form_id = s.form_id AND f.enabled AND f.field_type = 'photo'
              AND f.field_name NOT ILIKE '%signature%' AND NULLIF(v.photo_url, '') IS NULL
          ) AS captured
          FROM organization_submissions s JOIN organizations o ON o.id = s.organization_id
          WHERE COALESCE(o.is_active, true) AND ($2::boolean OR o.owner_admin_id = $1)
        ) SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE captured)::text AS captured,
          COUNT(*) FILTER (WHERE NOT captured)::text AS uncaptured FROM records`,
        [scope.adminUserId, seeAll]
      ),
      pool.query<{ total: string; captured: string; uncaptured: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE ${capturedExpr})::text AS captured,
           COUNT(*) FILTER (WHERE NOT (${capturedExpr}))::text AS uncaptured
         FROM students s
         INNER JOIN schools sc ON sc.id = s.school_id
         ${studentWhere}`,
        studentValues
      ),
      pool.query<{ total: string; captured: string; uncaptured: string }>(
        `SELECT
           COUNT(*)::text AS total,
           COUNT(*) FILTER (WHERE ${capturedExpr})::text AS captured,
           COUNT(*) FILTER (WHERE NOT (${capturedExpr}))::text AS uncaptured
         FROM students s
         INNER JOIN institutes i ON i.id = s.institute_id
         ${instituteMemberWhere}`,
        instituteMemberValues
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM templates WHERE owner_admin_id = $1`,
        [scope.adminUserId]
      ),
      pool.query<{ count: string }>(modelCountSql, [scope.adminUserId]),
      pool.query<{ day: string; schools: string; institutes: string }>(
        overviewSql,
        overviewValues
      ),
      pool.query<{ kind: string; title: string; created_at: string }>(
        activitySql,
        activityValues
      ),
    ]);

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
      totalOrganizations: Number(organizationStats.rows[0]?.total ?? 0),
      activeOrganizations: Number(organizationStats.rows[0]?.active ?? 0),
      inactiveOrganizations: Number(organizationStats.rows[0]?.inactive ?? 0),
      organizationRecords: Number(organizationRecordStats.rows[0]?.total ?? 0),
      organizationCaptured: Number(organizationRecordStats.rows[0]?.captured ?? 0),
      organizationPending: Number(organizationRecordStats.rows[0]?.uncaptured ?? 0),
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
