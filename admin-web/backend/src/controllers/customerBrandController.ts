import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

const APP_BRAND_NAME = "My School ID Card";

/**
 * Branding for the logged-in school or institute account.
 * Comes from that organization's owner admin. Never returns passwords.
 */
export async function getTeacherBranding(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError("Unauthorized", 401);

    const result = await pool.query<{
      display_name: string | null;
      phone: string | null;
      whatsapp: string | null;
      facebook_url: string | null;
      instagram_url: string | null;
      youtube_url: string | null;
      about_us: string | null;
      email: string | null;
    }>(
      `SELECT owner.display_name, owner.phone, owner.whatsapp,
              owner.facebook_url, owner.instagram_url, owner.youtube_url,
              owner.about_us, owner.email
       FROM users me
       LEFT JOIN schools s ON s.id = me.school_id
       LEFT JOIN institutes i ON i.id = me.institute_id
       LEFT JOIN users owner ON owner.id = COALESCE(s.owner_admin_id, i.owner_admin_id)
         AND owner.role = 'admin'
       WHERE me.id = $1
       LIMIT 1`,
      [userId]
    );

    const row = result.rows[0];
    const adminName = row?.display_name?.trim() || APP_BRAND_NAME;
    res.set("Cache-Control", "no-store");
    res.status(200).json({
      status: "ok",
      branding: {
        adminName,
        phone: row?.phone?.trim() || null,
        whatsapp: row?.whatsapp?.trim() || null,
        facebook: row?.facebook_url?.trim() || null,
        instagram: row?.instagram_url?.trim() || null,
        youtube: row?.youtube_url?.trim() || null,
        aboutUs: row?.about_us?.trim() || null,
        email: row?.email?.trim() || null,
      },
    });
  } catch (error) {
    next(error);
  }
}
