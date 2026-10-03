import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { signAuthToken } from "../middleware/auth";
import { sendEmail } from "../utils/email";
import {
  LoginRequest,
  RegisterRequest,
  User,
  UserRole,
} from "../types/auth";
import { assertTeacherOrgActive } from "../middleware/orgAccess";
import {
  isPrimarySuperAdminEmail,
  queryAdminSeesAllOrganizations,
  resolveIsSuperAdmin,
  SUPER_ADMIN_EMAIL,
  userMayUseAdminPasswordReset,
} from "../utils/adminScope";

const SALT_ROUNDS = 10;
const VALID_ROLES: UserRole[] = ["admin", "teacher"];
const OTP_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

function generateResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      throw new AppError("Email and password are required", 400);
    }

    const result = await pool.query<
      User & {
        school_is_active: boolean | null;
        institute_is_active: boolean | null;
        organization_id: string | null;
        organization_is_active: boolean | null;
      }
    >(
      `SELECT u.id, u.email, u.username, u.password_hash, u.role, u.school_id, u.institute_id,
              u.organization_id, u.assigned_class, u.assigned_section, u.created_at,
              u.display_name, u.phone, u.photo_url,
              COALESCE(u.is_super_admin, false) AS is_super_admin,
              COALESCE(u.is_active, true) AS is_active,
              s.is_active AS school_is_active,
              i.is_active AS institute_is_active,
              org.is_active AS organization_is_active
       FROM users u
       LEFT JOIN schools s ON s.id = u.school_id
       LEFT JOIN institutes i ON i.id = u.institute_id
       LEFT JOIN organizations org ON org.id = u.organization_id
       WHERE lower(u.email) = lower($1)
          OR (u.username IS NOT NULL AND lower(u.username) = lower($1))
       ORDER BY
         COALESCE(u.is_super_admin, false) DESC,
         CASE WHEN u.role = 'admin' THEN 0 ELSE 1 END,
         CASE WHEN lower(u.email) = lower($1) THEN 0 ELSE 1 END,
         u.created_at ASC NULLS LAST`,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      throw new AppError("User not found", 401);
    }

    let user = result.rows[0];
    let passwordMatches = false;
    for (const candidate of result.rows) {
      if (!candidate.password_hash || typeof candidate.password_hash !== "string") {
        continue;
      }
      try {
        if (await bcrypt.compare(password, candidate.password_hash)) {
          user = candidate;
          passwordMatches = true;
          break;
        }
      } catch {
        continue;
      }
    }
    if (!passwordMatches || !user) {
      throw new AppError("Wrong password", 401);
    }

    const userActive = (user as User & { is_active?: boolean }).is_active !== false;
    if (user.role === "admin" && !userActive) {
      throw new AppError("This admin account is disabled. Contact the super admin.", 403);
    }

    if (user.role === "teacher" || user.role === "institute_staff") {
      await assertTeacherOrgActive({
        schoolId: user.school_id,
        instituteId: user.institute_id,
        schoolIsActive: user.school_is_active,
        instituteIsActive: user.institute_is_active,
      });
    }
    if (user.role === "organization_staff" && user.organization_is_active === false) {
      throw new AppError("This organization account is disabled.", 403);
    }

    const isSuperAdmin =
      user.role === "admin"
        ? await queryAdminSeesAllOrganizations(user.id)
        : resolveIsSuperAdmin({
            role: user.role,
            email: user.email,
            username: user.username,
            is_super_admin: (user as User & { is_super_admin?: boolean })
              .is_super_admin,
          });

    const token = signAuthToken({
      userId: user.id,
      role: user.role,
      schoolId: user.school_id,
      instituteId: user.institute_id,
      organizationId: user.organization_id,
      assignedClass: user.assigned_class,
      assignedSection: user.assigned_section,
      isSuperAdmin: isSuperAdmin || undefined,
    });

    const profile = user as User & {
      display_name?: string | null;
      phone?: string | null;
      photo_url?: string | null;
      is_super_admin?: boolean;
    };

    res.status(200).json({
      status: "ok",
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        schoolId: user.school_id,
        instituteId: user.institute_id,
        organizationId: user.organization_id,
        assignedClass: user.assigned_class,
        assignedSection: user.assigned_section,
        displayName: profile.display_name ?? null,
        phone: profile.phone ?? null,
        photoUrl: profile.photo_url ?? null,
        isSuperAdmin,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * One-time bootstrap: creates the first admin only when zero admins exist.
 * Permanently returns 403 once any admin account is present.
 */
export async function setupFirstAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const existingAdmins = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`
    );
    const adminCount = Number(existingAdmins.rows[0]?.count ?? 0);
    if (adminCount > 0) {
      throw new AppError(
        "Setup is disabled. An admin account already exists.",
        403
      );
    }

    const email = String(req.body.email ?? "").trim();
    const password = String(req.body.password ?? "");

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      throw new AppError("Email and password are required", 400);
    }

    if (!isValidEmail(email)) {
      throw new AppError(
        "Email must be a valid address (e.g. name@domain.com)",
        400
      );
    }

    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const inserted = await pool.query<User>(
      `INSERT INTO users (email, password_hash, role, school_id, assigned_class, assigned_section)
       VALUES ($1, $2, 'admin', NULL, NULL, NULL)
       RETURNING id, email, password_hash, role, school_id, assigned_class, assigned_section, created_at`,
      [email.toLowerCase(), passwordHash]
    );

    const user = inserted.rows[0];
    if (!user) {
      throw new AppError("Failed to create first admin", 500);
    }

    res.status(201).json({
      status: "ok",
      message:
        "First admin created. This setup route is now permanently disabled.",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.school_id,
        assignedClass: user.assigned_class,
        assignedSection: user.assigned_section,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body as RegisterRequest;
    const email = body.email?.trim();
    const password = body.password;
    const role = body.role;
    const schoolId = body.schoolId?.trim();
    const assignedClass = body.assignedClass?.trim() || null;
    const assignedSection = body.assignedSection?.trim() || null;

    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      throw new AppError("Email and password are required", 400);
    }

    if (!isValidEmail(email)) {
      throw new AppError(
        "Email must be a valid address (e.g. name@domain.com)",
        400
      );
    }

    if (!VALID_ROLES.includes(role)) {
      throw new AppError("Role must be 'admin' or 'teacher'", 400);
    }

    // Teachers must be created by an authenticated admin via this route only.
    if (role === "teacher" && !isNonEmptyString(schoolId)) {
      throw new AppError("schoolId is required for teachers", 400);
    }

    if (role === "teacher" && !assignedClass) {
      throw new AppError("assignedClass is required for teachers", 400);
    }

    if (role === "teacher" && !assignedSection) {
      throw new AppError("assignedSection is required for teachers", 400);
    }

    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
      [email]
    );

    if (existing.rows[0]) {
      throw new AppError("A user with this email already exists", 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const inserted = await pool.query<User>(
      `INSERT INTO users (email, password_hash, role, school_id, assigned_class, assigned_section)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, password_hash, role, school_id, assigned_class, assigned_section, created_at`,
      [
        email.toLowerCase(),
        passwordHash,
        role,
        schoolId || null,
        assignedClass,
        assignedSection,
      ]
    );

    const user = inserted.rows[0];
    if (!user) {
      throw new AppError("Failed to create user", 500);
    }

    res.status(201).json({
      status: "ok",
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        schoolId: user.school_id,
        assignedClass: user.assigned_class,
        assignedSection: user.assigned_section,
      },
    });
  } catch (error) {
    next(error);
  }
}

const FORGOT_PASSWORD_CONTACT_ADMIN =
  "Please contact admin for password.";

/**
 * POST /auth/forgot-password
 * Body: { email }
 * OTP is sent only for the primary Harsha ID Solutions super admin account.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    if (!isNonEmptyString(email) || !isValidEmail(email)) {
      throw new AppError("A valid email is required", 400);
    }

    const userResult = await pool.query<
      User & { is_super_admin?: boolean | null; username?: string | null }
    >(
      `SELECT id, email, password_hash, role, school_id, assigned_class, assigned_section, created_at,
              is_super_admin, username
       FROM users WHERE lower(email) = $1 LIMIT 1`,
      [email]
    );
    const user = userResult.rows[0];

    if (!user || !userMayUseAdminPasswordReset(user)) {
      throw new AppError(FORGOT_PASSWORD_CONTACT_ADMIN, 403);
    }

    const okBody: Record<string, unknown> = {
      status: "ok",
      codeSent: true,
      message: "A verification code has been sent to your email.",
    };

    // Invalidate previous unused OTPs for this user
    await pool.query(
      `UPDATE password_reset_otps
       SET consumed_at = NOW()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [user.id]
    );

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await pool.query(
      `INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [user.id, user.email, otpHash, expiresAt]
    );

    const mailText = `Your Harsha ID Solutions verification code is: ${otp}\n\nThis code expires in 15 minutes. If you did not request a password reset, ignore this email.`;
    const mailHtml = `<p>Your Harsha ID Solutions verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires in 15 minutes. If you did not request a password reset, ignore this email.</p>`;

    const mail = await sendEmail({
      to: user.email,
      subject: "Password reset verification code",
      text: mailText,
      html: mailHtml,
    });

    if (!mail.delivered) {
      // Dev only: surface OTP when SMTP is unset. Never expose OTP in production.
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) {
        console.log(
          `[password-reset] SMTP not configured. OTP for ${user.email}: ${otp} (expires ${expiresAt.toISOString()})`
        );
        okBody.devOtp = otp;
        okBody.emailDelivery = "logged";
      } else {
        console.error(
          `[password-reset] SMTP not configured — cannot email OTP in production (user ${user.email}). Set SMTP_* env vars.`
        );
        okBody.emailDelivery = "failed";
      }
    } else {
      okBody.emailDelivery = "sent";
    }

    res.status(200).json(okBody);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/verify-reset-otp
 * Body: { email, otp }
 * Returns { resetToken } short-lived one-time token (15 min).
 */
export async function verifyResetOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const otp = String(req.body.otp ?? "").trim();

    if (!isNonEmptyString(email) || !isValidEmail(email)) {
      throw new AppError("A valid email is required", 400);
    }
    if (!isNonEmptyString(otp) || !/^\d{6}$/.test(otp)) {
      throw new AppError("A valid 6-digit code is required", 400);
    }
    if (!isPrimarySuperAdminEmail(email)) {
      throw new AppError("Invalid or expired code", 400);
    }

    const otpRow = await pool.query<{
      id: string;
      user_id: string;
      otp_hash: string;
      expires_at: Date;
    }>(
      `SELECT id, user_id, otp_hash, expires_at
       FROM password_reset_otps
       WHERE lower(email) = $1 AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );

    const row = otpRow.rows[0];
    if (!row) {
      throw new AppError("Invalid or expired code", 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError("Invalid or expired code", 400);
    }

    const matches = await bcrypt.compare(otp, row.otp_hash);
    if (!matches) {
      throw new AppError("Invalid or expired code", 400);
    }

    const resetUserResult = await pool.query<
      User & { is_super_admin?: boolean | null; username?: string | null }
    >(
      `SELECT id, email, password_hash, role, school_id, assigned_class, assigned_section, created_at,
              is_super_admin, username
       FROM users WHERE id = $1 LIMIT 1`,
      [row.user_id]
    );
    const resetUser = resetUserResult.rows[0];
    if (!resetUser || !userMayUseAdminPasswordReset(resetUser)) {
      throw new AppError("Invalid or expired code", 400);
    }

    // Consume OTP
    await pool.query(
      `UPDATE password_reset_otps SET consumed_at = NOW() WHERE id = $1`,
      [row.id]
    );

    // Invalidate prior unused reset tokens for this user
    await pool.query(
      `UPDATE password_reset_tokens
       SET consumed_at = NOW()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [row.user_id]
    );

    const resetToken = generateResetToken();
    const tokenHash = hashToken(resetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [row.user_id, email, tokenHash, expiresAt]
    );

    res.status(200).json({
      status: "ok",
      resetToken,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /auth/reset-password
 * Body: { email, resetToken, newPassword }
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const resetToken = String(req.body.resetToken ?? "").trim();
    const newPassword = String(req.body.newPassword ?? "");

    if (!isNonEmptyString(email) || !isValidEmail(email)) {
      throw new AppError("A valid email is required", 400);
    }
    if (!isNonEmptyString(resetToken)) {
      throw new AppError("Reset token is required", 400);
    }
    if (newPassword.length < 8) {
      throw new AppError("Password must be at least 8 characters", 400);
    }
    if (!isPrimarySuperAdminEmail(email)) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const tokenHash = hashToken(resetToken);
    const tokenRow = await pool.query<{
      id: string;
      user_id: string;
      expires_at: Date;
    }>(
      `SELECT id, user_id, expires_at
       FROM password_reset_tokens
       WHERE token_hash = $1 AND lower(email) = $2 AND consumed_at IS NULL
       LIMIT 1`,
      [tokenHash, email]
    );

    const row = tokenRow.rows[0];
    if (!row) {
      throw new AppError("Invalid or expired reset token", 400);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const resetUserResult = await pool.query<
      User & { is_super_admin?: boolean | null; username?: string | null }
    >(
      `SELECT id, email, password_hash, role, school_id, assigned_class, assigned_section, created_at,
              is_super_admin, username
       FROM users WHERE id = $1 LIMIT 1`,
      [row.user_id]
    );
    const resetUser = resetUserResult.rows[0];
    if (!resetUser || !userMayUseAdminPasswordReset(resetUser)) {
      throw new AppError("Invalid or expired reset token", 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await pool.query("BEGIN");
    try {
      await pool.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [passwordHash, row.user_id]
      );
      await pool.query(
        `UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = $1`,
        [row.id]
      );
      // Invalidate any leftover OTPs/tokens for this user
      await pool.query(
        `UPDATE password_reset_otps SET consumed_at = NOW()
         WHERE user_id = $1 AND consumed_at IS NULL`,
        [row.user_id]
      );
      await pool.query(
        `UPDATE password_reset_tokens SET consumed_at = NOW()
         WHERE user_id = $1 AND consumed_at IS NULL AND id <> $2`,
        [row.user_id, row.id]
      );
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    res.status(200).json({
      status: "ok",
      message: "Password updated. You can log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
}

/** Public login-page contacts for the Super Admin account only. */
export async function getSuperAdminContacts(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query<{
      email: string | null;
      phone: string | null;
      whatsapp: string | null;
      facebook_url: string | null;
      instagram_url: string | null;
      youtube_url: string | null;
    }>(
      `SELECT
         preferred.email,
         preferred.facebook_url,
         preferred.instagram_url,
         preferred.youtube_url,
         COALESCE(NULLIF(TRIM(preferred.phone), ''), numbers.phone) AS phone,
         COALESCE(NULLIF(TRIM(preferred.whatsapp), ''), numbers.whatsapp, NULLIF(TRIM(preferred.phone), ''), numbers.phone) AS whatsapp
       FROM (
         SELECT email, phone, whatsapp, facebook_url, instagram_url, youtube_url
         FROM users
         WHERE role = 'admin'
           AND (
             COALESCE(is_super_admin, false) = true
             OR lower(trim(email)) = $1
           )
         ORDER BY COALESCE(is_super_admin, false) DESC, created_at ASC NULLS LAST
         LIMIT 1
       ) preferred
       CROSS JOIN (
         SELECT
           (
             SELECT NULLIF(TRIM(phone), '')
             FROM users
             WHERE role = 'admin'
               AND COALESCE(is_super_admin, false) = true
               AND NULLIF(TRIM(phone), '') IS NOT NULL
             ORDER BY created_at ASC NULLS LAST
             LIMIT 1
           ) AS phone,
           (
             SELECT NULLIF(TRIM(whatsapp), '')
             FROM users
             WHERE role = 'admin'
               AND COALESCE(is_super_admin, false) = true
               AND NULLIF(TRIM(whatsapp), '') IS NOT NULL
             ORDER BY created_at ASC NULLS LAST
             LIMIT 1
           ) AS whatsapp
       ) numbers`,
      [SUPER_ADMIN_EMAIL]
    );
    const row = result.rows[0];
    res.status(200).json({
      status: "ok",
      email: row?.email?.trim() || null,
      phone: row?.phone?.trim() || null,
      whatsapp: row?.whatsapp?.trim() || null,
      facebook: row?.facebook_url?.trim() || null,
      instagram: row?.instagram_url?.trim() || null,
      youtube: row?.youtube_url?.trim() || null,
    });
  } catch (error) {
    next(error);
  }
}
