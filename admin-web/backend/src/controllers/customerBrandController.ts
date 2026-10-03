import { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { resolveIsSuperAdmin } from "../utils/adminScope";

const CHILD_NAME_FALLBACK = "My School ID Card";

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
      owner_id: string | null;
      display_name: string | null;
      phone: string | null;
      whatsapp: string | null;
      facebook_url: string | null;
      instagram_url: string | null;
      youtube_url: string | null;
      email: string | null;
      username: string | null;
      is_super_admin: boolean | null;
    }>(
      `SELECT owner.id AS owner_id,
              owner.display_name, owner.phone, owner.whatsapp,
              owner.facebook_url, owner.instagram_url, owner.youtube_url,
              owner.email, owner.username,
              COALESCE(owner.is_super_admin, false) AS is_super_admin
       FROM users me
       LEFT JOIN schools s ON s.id = me.school_id
       LEFT JOIN institutes i ON i.id = me.institute_id
       LEFT JOIN organizations o ON o.id = me.organization_id
       LEFT JOIN users owner ON owner.id = COALESCE(s.owner_admin_id, i.owner_admin_id, o.owner_admin_id)
         AND owner.role = 'admin'
       WHERE me.id = $1
       LIMIT 1`,
      [userId]
    );

    const row = result.rows[0];
    const childOwned =
      Boolean(row?.owner_id) &&
      !resolveIsSuperAdmin({
        role: "admin",
        email: row?.email,
        username: row?.username,
        is_super_admin: row?.is_super_admin,
      });

    res.set("Cache-Control", "no-store");
    if (!childOwned) {
      res.status(200).json({ status: "ok", branding: { source: "platform" } });
      return;
    }

    res.status(200).json({
      status: "ok",
      branding: {
        source: "child",
        adminName: row?.display_name?.trim() || CHILD_NAME_FALLBACK,
        phone: row?.phone?.trim() || null,
        whatsapp: row?.whatsapp?.trim() || null,
        facebook: row?.facebook_url?.trim() || null,
        instagram: row?.instagram_url?.trim() || null,
        youtube: row?.youtube_url?.trim() || null,
        email: row?.email?.trim() || null,
      },
    });
  } catch (error) {
    next(error);
  }
}
