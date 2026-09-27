import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";

/**
 * Public-safe names and brochure files only.
 * Does not return phones, addresses, logins, or passwords.
 */
export async function getPublicShowcase(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schools = await pool.query<{ name: string; logo_url: string | null }>(
      `SELECT name, logo_url
       FROM schools
       WHERE COALESCE(is_active, true) = true
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY name ASC`
    );
    const institutes = await pool.query<{ name: string; logo_url: string | null }>(
      `SELECT name, logo_url
       FROM institutes
       WHERE COALESCE(is_active, true) = true
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY name ASC`
    );
    const brochures = await pool.query<{ name: string; image_url: string }>(
      `SELECT name, image_url
       FROM catalog_items
       WHERE kind = 'brochure'
         AND NULLIF(trim(image_url), '') IS NOT NULL
         AND NULLIF(trim(name), '') IS NOT NULL
       ORDER BY created_at DESC`
    );

    const organizations = [...schools.rows, ...institutes.rows]
      .map((row) => ({
        name: row.name.trim(),
        logoUrl: row.logo_url?.trim() || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.status(200).json({
      status: "ok",
      schools: organizations,
      brochures: brochures.rows.map((row) => ({
        name: row.name.trim(),
        fileUrl: row.image_url,
      })),
    });
  } catch (error) {
    next(error);
  }
}
