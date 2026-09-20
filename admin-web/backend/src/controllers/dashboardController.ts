import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";

/**
 * GET /api/admin/dashboard-summary?year=2025
 */
export async function getDashboardSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const year =
      typeof req.query.year === "string" ? req.query.year.trim() : "";

    const schoolStats = await pool.query<{
      total: string;
      active: string;
      inactive: string;
    }>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = true)::text AS active,
         COUNT(*) FILTER (WHERE COALESCE(is_active, true) = false)::text AS inactive
       FROM schools`
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
       FROM institutes`
    );

    const studentStats = await pool.query<{
      total: string;
      captured: string;
      uncaptured: string;
    }>(
      year
        ? `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE s.status IN ('captured', 'printed'))::text AS captured,
             COUNT(*) FILTER (WHERE s.status IS DISTINCT FROM 'captured' AND s.status IS DISTINCT FROM 'printed')::text AS uncaptured
           FROM students s
           INNER JOIN schools sc ON sc.id = s.school_id
           WHERE sc.year = $1`
        : `SELECT
             COUNT(*)::text AS total,
             COUNT(*) FILTER (WHERE status IN ('captured', 'printed'))::text AS captured,
             COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'captured' AND status IS DISTINCT FROM 'printed')::text AS uncaptured
           FROM students`,
      year ? [year] : []
    );

    const templateCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM templates`
    );
    const modelCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM catalog_items WHERE kind = 'model'`
    );

    const overview = await pool.query<{
      day: string;
      schools: string;
      institutes: string;
    }>(
      `SELECT
         to_char(d::date, 'YYYY-MM-DD') AS day,
         (SELECT COUNT(*)::text FROM schools s WHERE s.created_at::date = d::date) AS schools,
         (SELECT COUNT(*)::text FROM institutes i WHERE i.created_at::date = d::date) AS institutes
       FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS d`
    );

    const activity = await pool.query<{
      kind: string;
      title: string;
      created_at: string;
    }>(
      `SELECT kind, title, created_at FROM (
         SELECT 'school'::text AS kind, name AS title, created_at FROM schools
         UNION ALL
         SELECT 'institute', name, created_at FROM institutes
         UNION ALL
         SELECT 'template', name, created_at FROM templates
         UNION ALL
         SELECT kind, name, created_at FROM catalog_items
       ) x
       ORDER BY created_at DESC NULLS LAST
       LIMIT 8`
    );

    const schools = schoolStats.rows[0];
    const institutes = instituteStats.rows[0];
    const stats = studentStats.rows[0];
    const schoolPhotos = Number(stats?.total ?? 0);
    const schoolCaptured = Number(stats?.captured ?? 0);
    const schoolPending = Number(stats?.uncaptured ?? 0);

    // Institute student/photo records are not linked yet — metrics stay at 0 until supported.
    const institutePhotos = 0;
    const instituteCaptured = 0;
    const institutePending = 0;

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
