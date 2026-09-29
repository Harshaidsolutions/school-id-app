import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { SCHOOL_ASSETS_BUCKET, uploadBufferToBucket } from "../config/storage";
import { requireAdminScope, requireSuperAdmin } from "../utils/adminScope";
import {
  requestAdminActionOtp,
  verifyAdminActionOtp,
} from "../utils/adminOtp";
import { routeParam } from "../utils/routeParams";

const SALT_ROUNDS = 10;

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

function cleanWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length < 10 || digits.length > 15) {
    throw new AppError("WhatsApp number must be 10 to 15 digits", 400);
  }
  return digits;
}

function cleanUrl(value: string): string {
  const url = value.trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url) || url.length > 300) {
    throw new AppError("Links must start with http:// or https://", 400);
  }
  return url;
}

function cleanAbout(value: string): string {
  const text = value.trim();
  if (text.length > 4000) throw new AppError("About Us is too long", 400);
  return text;
}

const ADMIN_PUBLIC_COLUMNS = `id, email, username, display_name, phone, photo_url, created_at,
  whatsapp, facebook_url, instagram_url, youtube_url, about_us`;

export async function getAdminProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const row = await pool.query<{
      id: string;
      email: string;
      username: string | null;
      display_name: string | null;
      phone: string | null;
      photo_url: string | null;
    }>(
      `SELECT id, email, username, display_name, phone, photo_url
       FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [scope.adminUserId]
    );
    if (!row.rows[0]) throw new AppError("Admin account not found", 404);
    const u = row.rows[0];
    const orgCounts = await pool.query<{
      total_schools: number;
      total_institutes: number;
      owned_schools: number;
      owned_institutes: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM schools) AS total_schools,
         (SELECT COUNT(*)::int FROM institutes) AS total_institutes,
         (SELECT COUNT(*)::int FROM schools WHERE owner_admin_id = $1) AS owned_schools,
         (SELECT COUNT(*)::int FROM institutes WHERE owner_admin_id = $1) AS owned_institutes`,
      [scope.adminUserId]
    );
    const counts = orgCounts.rows[0];
    res.status(200).json({
      status: "ok",
      user: {
        id: u.id,
        email: u.email,
        username: u.username,
        role: "admin",
        schoolId: null,
        assignedClass: null,
        assignedSection: null,
        displayName: u.display_name,
        phone: u.phone,
        photoUrl: u.photo_url,
        isSuperAdmin: scope.isSuperAdmin,
        canListAllOrganizations: scope.isSuperAdmin,
        orgScope: {
          totalSchools: counts?.total_schools ?? 0,
          totalInstitutes: counts?.total_institutes ?? 0,
          ownedSchools: counts?.owned_schools ?? 0,
          ownedInstitutes: counts?.owned_institutes ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function listManagedAdmins(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const result = await pool.query(
      `SELECT ${ADMIN_PUBLIC_COLUMNS},
              COALESCE(is_super_admin, false) AS is_super_admin,
              COALESCE(is_active, true) AS is_active,
              NULLIF(TRIM(password_plain), '') AS password_plain
       FROM users
       WHERE role = 'admin'
       ORDER BY created_at ASC NULLS LAST`
    );
    res.status(200).json({ status: "ok", admins: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function createManagedAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const displayName = String(req.body.displayName ?? req.body.name ?? "").trim();
    const username = String(req.body.username ?? "").trim();
    const email = String(req.body.email ?? "").trim();
    const phone = normalizePhone(String(req.body.phone ?? ""));
    const whatsapp = cleanWhatsapp(String(req.body.whatsapp ?? ""));
    const facebookUrl = cleanUrl(String(req.body.facebook ?? req.body.facebookUrl ?? ""));
    const instagramUrl = cleanUrl(String(req.body.instagram ?? req.body.instagramUrl ?? ""));
    const youtubeUrl = cleanUrl(String(req.body.youtube ?? req.body.youtubeUrl ?? ""));
    const aboutUs = cleanAbout(String(req.body.aboutUs ?? req.body.about_us ?? ""));
    const password = String(req.body.password ?? "");

    if (!displayName) throw new AppError("Admin name is required", 400);
    if (!username) throw new AppError("Username is required", 400);
    if (!isValidEmail(email)) throw new AppError("Valid email is required", 400);
    if (phone.length !== 10) throw new AppError("Phone must be 10 digits", 400);
    if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);

    const dup = await pool.query(
      `SELECT id FROM users
       WHERE lower(email) = lower($1)
          OR (username IS NOT NULL AND lower(username) = lower($2))
       LIMIT 1`,
      [email, username]
    );
    if (dup.rows[0]) throw new AppError("Email or username already in use", 409);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const inserted = await pool.query(
      `INSERT INTO users (
         email, username, password_hash, password_plain, role, display_name, phone,
         whatsapp, facebook_url, instagram_url, youtube_url, about_us,
         is_super_admin, is_active
       )
       VALUES ($1, $2, $3, $4, 'admin', $5, $6, $7, $8, $9, $10, $11, false, true)
       RETURNING ${ADMIN_PUBLIC_COLUMNS},
                 COALESCE(is_active, true) AS is_active,
                 NULLIF(TRIM(password_plain), '') AS password_plain`,
      [
        email,
        username,
        passwordHash,
        password,
        displayName,
        phone,
        whatsapp || null,
        facebookUrl || null,
        instagramUrl || null,
        youtubeUrl || null,
        aboutUs || null,
      ]
    );

    res.status(201).json({ status: "ok", admin: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function updateManagedAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const existing = await pool.query(
      `SELECT id, is_super_admin FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (!existing.rows[0]) throw new AppError("Admin not found", 404);
    if (existing.rows[0].is_super_admin) {
      throw new AppError("Super admin account cannot be edited here", 403);
    }

    const displayName =
      req.body.displayName !== undefined
        ? String(req.body.displayName).trim()
        : undefined;
    const username =
      req.body.username !== undefined ? String(req.body.username).trim() : undefined;
    const email =
      req.body.email !== undefined ? String(req.body.email).trim() : undefined;
    const phone =
      req.body.phone !== undefined ? normalizePhone(String(req.body.phone)) : undefined;
    const whatsapp =
      req.body.whatsapp !== undefined ? cleanWhatsapp(String(req.body.whatsapp)) : undefined;
    const facebookUrl =
      req.body.facebook !== undefined || req.body.facebookUrl !== undefined
        ? cleanUrl(String(req.body.facebook ?? req.body.facebookUrl ?? ""))
        : undefined;
    const instagramUrl =
      req.body.instagram !== undefined || req.body.instagramUrl !== undefined
        ? cleanUrl(String(req.body.instagram ?? req.body.instagramUrl ?? ""))
        : undefined;
    const youtubeUrl =
      req.body.youtube !== undefined || req.body.youtubeUrl !== undefined
        ? cleanUrl(String(req.body.youtube ?? req.body.youtubeUrl ?? ""))
        : undefined;
    const aboutUs =
      req.body.aboutUs !== undefined || req.body.about_us !== undefined
        ? cleanAbout(String(req.body.aboutUs ?? req.body.about_us ?? ""))
        : undefined;

    if (email !== undefined && !isValidEmail(email)) {
      throw new AppError("Valid email is required", 400);
    }
    if (phone !== undefined && phone.length !== 10) {
      throw new AppError("Phone must be 10 digits", 400);
    }

    const updated = await pool.query(
      `UPDATE users SET
         display_name = COALESCE($2, display_name),
         username = COALESCE($3, username),
         email = COALESCE($4, email),
         phone = COALESCE($5, phone),
         whatsapp = CASE WHEN $6::boolean THEN NULLIF($7, '') ELSE whatsapp END,
         facebook_url = CASE WHEN $8::boolean THEN NULLIF($9, '') ELSE facebook_url END,
         instagram_url = CASE WHEN $10::boolean THEN NULLIF($11, '') ELSE instagram_url END,
         youtube_url = CASE WHEN $12::boolean THEN NULLIF($13, '') ELSE youtube_url END,
         about_us = CASE WHEN $14::boolean THEN NULLIF($15, '') ELSE about_us END
       WHERE id = $1
       RETURNING ${ADMIN_PUBLIC_COLUMNS}`,
      [
        id,
        displayName ?? null,
        username ?? null,
        email ?? null,
        phone ?? null,
        whatsapp !== undefined,
        whatsapp ?? "",
        facebookUrl !== undefined,
        facebookUrl ?? "",
        instagramUrl !== undefined,
        instagramUrl ?? "",
        youtubeUrl !== undefined,
        youtubeUrl ?? "",
        aboutUs !== undefined,
        aboutUs ?? "",
      ]
    );

    res.status(200).json({ status: "ok", admin: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function requestManagedAdminDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const superScope = await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const target = await pool.query<{ email: string; is_super_admin: boolean | null }>(
      `SELECT email, is_super_admin FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError("Admin not found", 404);
    if (target.rows[0].is_super_admin) {
      throw new AppError("Super admin cannot be deleted", 403);
    }

    const superRow = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [superScope.adminUserId]
    );
    const adminEmail = superRow.rows[0]?.email;
    if (!adminEmail) throw new AppError("Super admin email is required", 400);

    const otpResult = await requestAdminActionOtp({
      adminUserId: superScope.adminUserId,
      adminEmail,
      actionType: "delete_managed_admin",
      resourceId: id,
      emailSubject: "Confirm admin account deletion",
      emailIntro: "Confirm deletion of the managed admin account.",
      logPrefix: "[admin-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function deleteManagedAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const superScope = await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    await verifyAdminActionOtp({
      adminUserId: superScope.adminUserId,
      actionType: "delete_managed_admin",
      resourceId: id,
      otp,
    });

    const target = await pool.query(
      `SELECT id, is_super_admin FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError("Admin not found", 404);
    if (target.rows[0].is_super_admin) {
      throw new AppError("Super admin cannot be deleted", 403);
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    res.status(200).json({ status: "ok", deleted: true });
  } catch (error) {
    next(error);
  }
}

export async function requestManagedAdminPasswordOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const superScope = await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const superRow = await pool.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 LIMIT 1`,
      [superScope.adminUserId]
    );
    const adminEmail = superRow.rows[0]?.email;
    if (!adminEmail) throw new AppError("Super admin email is required", 400);

    const otpResult = await requestAdminActionOtp({
      adminUserId: superScope.adminUserId,
      adminEmail,
      actionType: "change_managed_admin_password",
      resourceId: id,
      emailSubject: "Confirm admin password change",
      emailIntro: "Confirm password change for the managed admin account.",
      logPrefix: "[admin-password]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function changeManagedAdminPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const superScope = await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    const password = String(req.body.password ?? "");
    const otp = String(req.body.otp ?? "").trim();

    if (!id) throw new AppError("Admin id is required", 400);
    if (password.length < 8) throw new AppError("Password must be at least 8 characters", 400);

    await verifyAdminActionOtp({
      adminUserId: superScope.adminUserId,
      actionType: "change_managed_admin_password",
      resourceId: id,
      otp,
    });

    const target = await pool.query(
      `SELECT is_super_admin FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (!target.rows[0]) throw new AppError("Admin not found", 404);
    if (target.rows[0].is_super_admin) {
      throw new AppError("Super admin password cannot be changed here", 403);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await pool.query(
      `UPDATE users SET password_hash = $2, password_plain = $3 WHERE id = $1 AND role = 'admin'`,
      [id, passwordHash, password]
    );

    res.status(200).json({ status: "ok", updated: true });
  } catch (error) {
    next(error);
  }
}

export async function uploadManagedAdminPhoto(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    const file = req.file;
    if (!id) throw new AppError("Admin id is required", 400);
    if (!file) throw new AppError("Photo file is required", 400);

    const ext = file.mimetype === "image/png" ? "png" : "jpg";
    const photoUrl = await uploadBufferToBucket(
      SCHOOL_ASSETS_BUCKET,
      `admin-users/${id}/photo.${ext}`,
      file.buffer,
      file.mimetype
    );
    const updated = await pool.query(
      `UPDATE users SET photo_url = $2 WHERE id = $1 AND role = 'admin'
       RETURNING id, email, username, display_name, phone, photo_url`,
      [id, photoUrl]
    );
    if (!updated.rows[0]) throw new AppError("Admin not found", 404);

    res.status(200).json({ status: "ok", admin: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function setManagedAdminActive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const existing = await pool.query(
      `SELECT id, is_super_admin FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [id]
    );
    if (!existing.rows[0]) throw new AppError("Admin not found", 404);
    if (existing.rows[0].is_super_admin) {
      throw new AppError("Super admin status cannot be changed", 403);
    }

    const isActive = req.body.isActive ?? req.body.is_active;
    if (typeof isActive !== "boolean") {
      throw new AppError("isActive boolean is required", 400);
    }

    const updated = await pool.query(
      `UPDATE users SET is_active = $2 WHERE id = $1 AND role = 'admin'
       RETURNING id, email, username, display_name, phone, photo_url, created_at,
                 COALESCE(is_super_admin, false) AS is_super_admin,
                 COALESCE(is_active, true) AS is_active,
                 NULLIF(TRIM(password_plain), '') AS password_plain`,
      [id, isActive]
    );

    res.status(200).json({ status: "ok", admin: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

const CAPTURED_PHOTO = `LOWER(COALESCE(st.status, '')) IN ('captured', 'printed')`;

export async function getManagedAdminOverview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    await requireSuperAdmin(req);
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Admin id is required", 400);

    const admin = await pool.query(
      `SELECT ${ADMIN_PUBLIC_COLUMNS},
              COALESCE(is_active, true) AS is_active
       FROM users
       WHERE id = $1
         AND role = 'admin'
         AND COALESCE(is_super_admin, false) = false
       LIMIT 1`,
      [id]
    );
    if (!admin.rows[0]) throw new AppError("Admin not found", 404);

    const [schools, institutes] = await Promise.all([
      pool.query(
        `SELECT s.id, s.name, s.created_at, COALESCE(s.is_active, true) AS is_active,
                COUNT(st.id)::int AS people_count,
                COUNT(st.id) FILTER (WHERE ${CAPTURED_PHOTO})::int AS captured_photos,
                COUNT(st.id) FILTER (WHERE NOT (${CAPTURED_PHOTO}))::int AS pending_photos
         FROM schools s
         LEFT JOIN students st ON st.school_id = s.id
         WHERE s.owner_admin_id = $1
         GROUP BY s.id
         ORDER BY lower(s.name) ASC`,
        [id]
      ),
      pool.query(
        `SELECT i.id, i.name, i.created_at, COALESCE(i.is_active, true) AS is_active,
                COUNT(st.id)::int AS people_count,
                COUNT(st.id) FILTER (WHERE ${CAPTURED_PHOTO})::int AS captured_photos,
                COUNT(st.id) FILTER (WHERE NOT (${CAPTURED_PHOTO}))::int AS pending_photos
         FROM institutes i
         LEFT JOIN students st ON st.institute_id = i.id
         WHERE i.owner_admin_id = $1
         GROUP BY i.id
         ORDER BY lower(i.name) ASC`,
        [id]
      ),
    ]);

    res.status(200).json({
      status: "ok",
      admin: admin.rows[0],
      schools: schools.rows,
      institutes: institutes.rows,
    });
  } catch (error) {
    next(error);
  }
}
