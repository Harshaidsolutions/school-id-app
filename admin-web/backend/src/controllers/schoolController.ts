import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadSchoolAsset } from "../config/storage";
import { sendEmail } from "../utils/email";
import {
  findOwnerUserSql,
  ownerPasswordSelect,
  ownerUserLateralJoin,
  ownerUsernameSelect,
} from "../utils/ownerCredentials";
import type { SchoolRow } from "../types/admin";
import { parseBooleanField } from "../utils/parseBoolean";
import {
  adminSeesAllOrganizations,
  assertSchoolOwnedByAdmin,
  requireAdminScope,
} from "../utils/adminScope";
import { routeParam } from "../utils/routeParams";

const SALT_ROUNDS = 10;

function defaultAcademicYear(): string {
  return String(new Date().getFullYear());
}

function yearFilterClause(column: string, year: string): { clause: string; values: unknown[] } {
  if (!year) return { clause: "", values: [] };
  return {
    clause: `WHERE ${column} = $1`,
    values: [year],
  };
}

function filesMap(req: Request): {
  logo?: Express.Multer.File;
  signature?: Express.Multer.File;
} {
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;
  return {
    logo: files?.logo?.[0],
    signature: files?.signature?.[0],
  };
}

function syntheticOwnerEmail(username: string, domain: string): string {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64);
  return `${slug || "owner"}@${domain}`;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function createSchool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new AppError("School name is required", 400);

    const year = String(req.body.year ?? "").trim() || null;
    const phone = String(req.body.phone ?? "").trim() || null;
    const schoolCode = String(req.body.school_code ?? req.body.schoolCode ?? "").trim() || null;
    const address = String(req.body.address ?? "").trim() || null;
    const instructions = String(req.body.instructions ?? "").trim() || null;

    const inserted = await pool.query<SchoolRow>(
      `INSERT INTO schools (name, year, phone, school_code, address, instructions, owner_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, year, phone, schoolCode, address, instructions, scope.adminUserId]
    );

    const school = inserted.rows[0];
    if (!school) throw new AppError("Failed to create school", 500);

    const { logo, signature } = filesMap(req);
    let logoUrl = school.logo_url;
    let signatureUrl = school.signature_url;

    if (logo) {
      logoUrl = await uploadSchoolAsset(school.id, "logo", logo);
    }
    if (signature) {
      signatureUrl = await uploadSchoolAsset(school.id, "signature", signature);
    }

    if (logo || signature) {
      const updated = await pool.query<SchoolRow>(
        `UPDATE schools SET logo_url = $1, signature_url = $2 WHERE id = $3 RETURNING *`,
        [logoUrl, signatureUrl, school.id]
      );
      res.status(201).json({ status: "ok", school: updated.rows[0] });
      return;
    }

    res.status(201).json({ status: "ok", school });
  } catch (error) {
    next(error);
  }
}

export async function createSchoolWithOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    const schoolName = String(
      req.body.schoolName ?? req.body.name ?? ""
    ).trim();
    const ownerName = String(req.body.ownerName ?? "").trim();
    const password = String(req.body.password ?? "");
    const confirmPassword =
      req.body.confirmPassword !== undefined
        ? String(req.body.confirmPassword)
        : undefined;
    const phoneNumber =
      String(req.body.phoneNumber ?? req.body.phone ?? "").trim() || null;

    if (!schoolName) throw new AppError("School name is required", 400);
    if (!ownerName) throw new AppError("Owner name is required", 400);
    if (!password) throw new AppError("Password is required", 400);
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }

    const username = ownerName;
    const email = looksLikeEmail(ownerName)
      ? ownerName.toLowerCase()
      : syntheticOwnerEmail(ownerName, "teachers.local");

    await client.query("BEGIN");

    const taken = await client.query(
      `SELECT id FROM users
       WHERE (username IS NOT NULL AND lower(username) = lower($1))
          OR lower(email) = lower($1)
          OR lower(email) = lower($2)
       LIMIT 1`,
      [username, email]
    );
    if (taken.rows[0]) {
      throw new AppError("Owner username is already taken", 409);
    }

    const schoolResult = await client.query<SchoolRow>(
      `INSERT INTO schools (name, phone, year, owner_username_plain, owner_password_plain)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [schoolName, phoneNumber, defaultAcademicYear(), username, password]
    );
    const school = schoolResult.rows[0];
    if (!school) throw new AppError("Failed to create school", 500);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      `INSERT INTO users (email, username, password_hash, password_plain, role, school_id, is_owner)
       VALUES ($1, $2, $3, $4, 'teacher', $5, true)`,
      [email, username, passwordHash, password, school.id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      school,
      teacherUsername: username,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore rollback errors */
    }
    next(error);
  } finally {
    client.release();
  }
}

export async function listSchools(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const year =
      typeof req.query.year === "string" ? req.query.year.trim() : "";
    const filters: string[] = [];
    const values: unknown[] = [];
    if (year) {
      filters.push(`s.year = $${values.length + 1}`);
      values.push(year);
    }
    if (!(await adminSeesAllOrganizations(scope, req))) {
      filters.push(`s.owner_admin_id = $${values.length + 1}`);
      values.push(scope.adminUserId);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query<SchoolRow & {
      owner_username: string | null;
      owner_user_id: string | null;
      owner_password: string | null;
    }>(
      `SELECT
         s.*,
         COALESCE(s.is_active, true) AS is_active,
         owner.id AS owner_user_id,
         ${ownerUsernameSelect("s.owner_username_plain")} AS owner_username,
         ${ownerPasswordSelect("s.owner_password_plain")} AS owner_password
       FROM schools s
       ${ownerUserLateralJoin("s", "school_id")}
       ${where}
       ORDER BY s.created_at DESC NULLS LAST, s.name ASC`,
      values
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      schools: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSchool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("School id is required", 400);

    const scope = await requireAdminScope(req);
    const existing = await pool.query<SchoolRow>(
      `SELECT * FROM schools WHERE id = $1 LIMIT 1`,
      [id]
    );
    const school = existing.rows[0];
    if (!school) throw new AppError("School not found", 404);
    await assertSchoolOwnedByAdmin(scope, id);

    const name =
      req.body.name !== undefined
        ? String(req.body.name).trim()
        : school.name;
    if (!name) throw new AppError("School name is required", 400);

    const year =
      req.body.year !== undefined
        ? String(req.body.year).trim() || null
        : school.year;
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
    const templateId =
      req.body.template_id !== undefined || req.body.templateId !== undefined
        ? String(req.body.template_id ?? req.body.templateId).trim() || null
        : school.template_id;
    const isActive =
      req.body.is_active !== undefined
        ? parseBooleanField(req.body.is_active, school.is_active ?? true)
        : school.is_active ?? true;

    const { logo, signature } = filesMap(req);
    let logoUrl = school.logo_url;
    let signatureUrl = school.signature_url;

    if (logo) {
      logoUrl = await uploadSchoolAsset(school.id, "logo", logo);
    }
    if (signature) {
      signatureUrl = await uploadSchoolAsset(school.id, "signature", signature);
    }

    const updated = await pool.query<SchoolRow>(
      `UPDATE schools
       SET name = $1, year = $2, phone = $3, school_code = $4, address = $5,
           instructions = $6, logo_url = $7, signature_url = $8, template_id = $9,
           is_active = $10
       WHERE id = $11
       RETURNING *`,
      [
        name,
        year,
        phone,
        schoolCode,
        address,
        instructions,
        logoUrl,
        signatureUrl,
        templateId,
        isActive,
        id,
      ]
    );

    const ownerUsername =
      req.body.ownerUsername !== undefined || req.body.owner_username !== undefined
        ? String(req.body.ownerUsername ?? req.body.owner_username).trim()
        : undefined;
    const ownerPassword =
      req.body.ownerPassword !== undefined || req.body.owner_password !== undefined
        ? String(req.body.ownerPassword ?? req.body.owner_password)
        : undefined;

    if (ownerUsername !== undefined || ownerPassword !== undefined) {
      if (ownerUsername !== undefined && !ownerUsername) {
        throw new AppError("Username is required", 400);
      }

      if (ownerPassword !== undefined && ownerPassword.length > 0) {
        await pool.query(
          `UPDATE schools SET owner_password_plain = $1 WHERE id = $2`,
          [ownerPassword, id]
        );
      }

      if (ownerUsername !== undefined) {
        await pool.query(
          `UPDATE schools SET owner_username_plain = $1 WHERE id = $2`,
          [ownerUsername, id]
        );
      }

      const ownerResult = await pool.query<{ id: string }>(
        findOwnerUserSql("school_id"),
        [id]
      );
      const owner = ownerResult.rows[0];
      if (owner) {
        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (ownerUsername !== undefined) {
          updates.push(`username = $${idx++}`);
          values.push(ownerUsername);
        }
        if (ownerPassword !== undefined && ownerPassword.length > 0) {
          const passwordHash = await bcrypt.hash(ownerPassword, SALT_ROUNDS);
          updates.push(`password_hash = $${idx++}`);
          values.push(passwordHash);
          updates.push(`password_plain = $${idx++}`);
          values.push(ownerPassword);
        }

        if (updates.length > 0) {
          values.push(owner.id);
          await pool.query(
            `UPDATE users SET ${updates.join(", ")} WHERE id = $${idx}`,
            values
          );
        }
      }
    }

    res.status(200).json({ status: "ok", school: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

/** PATCH /admin/schools/:id/active — toggle teacher login without multipart upload middleware. */
export async function setSchoolActive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError("School id is required", 400);

    if (req.body.is_active === undefined && req.body.isActive === undefined) {
      throw new AppError("is_active is required", 400);
    }

    const isActive = parseBooleanField(
      req.body.is_active ?? req.body.isActive,
      true
    );

    const updated = await pool.query<SchoolRow>(
      `UPDATE schools
       SET is_active = $1
       WHERE id = $2::uuid
       RETURNING *`,
      [isActive, id]
    );

    const school = updated.rows[0];
    if (!school) throw new AppError("School not found", 404);

    res.status(200).json({ status: "ok", school });
  } catch (error) {
    next(error);
  }
}

const OTP_TTL_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;

function generateOtp(): string {
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, "0");
}

/**
 * POST /admin/schools/:id/request-delete-otp
 * Emails a 6-digit OTP to the logged-in admin (devOtp when SMTP unset, non-prod).
 */
export async function requestSchoolDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = req.params.id;
    if (!schoolId) throw new AppError("School id is required", 400);

    const schoolResult = await pool.query<{ id: string; name: string }>(
      `SELECT id, name FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    const school = schoolResult.rows[0];
    if (!school) throw new AppError("School not found", 404);

    const adminResult = await pool.query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
      [req.user.userId]
    );
    const admin = adminResult.rows[0];
    if (!admin?.email) {
      throw new AppError("Admin account email is required to send OTP", 400);
    }

    await pool.query(
      `UPDATE school_delete_otps
       SET consumed_at = NOW()
       WHERE school_id = $1 AND admin_user_id = $2 AND consumed_at IS NULL`,
      [schoolId, admin.id]
    );

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await pool.query(
      `INSERT INTO school_delete_otps
         (school_id, admin_user_id, email, otp_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [schoolId, admin.id, admin.email, otpHash, expiresAt]
    );

    const mailText = `Your verification code to delete school "${school.name}" is: ${otp}\n\nThis code expires in 15 minutes. If you did not request this, ignore this email.`;
    const mailHtml = `<p>Your verification code to delete school <strong>${school.name}</strong> is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires in 15 minutes. If you did not request this, ignore this email.</p>`;

    const mail = await sendEmail({
      to: admin.email,
      subject: `Delete school confirmation: ${school.name}`,
      text: mailText,
      html: mailHtml,
    });

    const body: Record<string, unknown> = {
      status: "ok",
      message: "If your admin email can receive mail, a verification code has been sent.",
      schoolId: school.id,
      schoolName: school.name,
    };

    if (!mail.delivered) {
      const isProd = process.env.NODE_ENV === "production";
      if (!isProd) {
        console.log(
          `[school-delete] SMTP not configured. OTP for school ${school.id} / ${admin.email}: ${otp}`
        );
        body.devOtp = otp;
        body.emailDelivery = "logged";
      } else {
        console.error(
          `[school-delete] SMTP not configured — cannot email OTP in production (admin ${admin.email}).`
        );
        body.emailDelivery = "failed";
      }
    } else {
      body.emailDelivery = "sent";
    }

    res.status(200).json(body);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /admin/schools/:id
 * Body: { otp } — must match a valid school_delete_otps row for this admin + school.
 * Cascades students/notifications via FK; removes teacher users for the school first.
 */
export async function deleteSchool(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const schoolId = req.params.id;
    if (!schoolId) throw new AppError("School id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError("A valid 6-digit code is required", 400);
    }

    await client.query("BEGIN");

    const schoolResult = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM schools WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [schoolId]
    );
    const school = schoolResult.rows[0];
    if (!school) {
      throw new AppError("School not found", 404);
    }

    const otpResult = await client.query<{
      id: string;
      otp_hash: string;
      expires_at: Date;
    }>(
      `SELECT id, otp_hash, expires_at
       FROM school_delete_otps
       WHERE school_id = $1
         AND admin_user_id = $2
         AND consumed_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [schoolId, req.user.userId]
    );

    const otpRow = otpResult.rows[0];
    if (!otpRow) {
      throw new AppError("Invalid or expired code", 400);
    }
    if (new Date(otpRow.expires_at).getTime() < Date.now()) {
      throw new AppError("Invalid or expired code", 400);
    }

    const matches = await bcrypt.compare(otp, otpRow.otp_hash);
    if (!matches) {
      throw new AppError("Invalid or expired code", 400);
    }

    await client.query(
      `UPDATE school_delete_otps SET consumed_at = NOW() WHERE id = $1`,
      [otpRow.id]
    );

    // Teachers reference school_id without guaranteed CASCADE — remove first
    await client.query(`DELETE FROM users WHERE school_id = $1`, [schoolId]);

    // Clear this school's selected template pointer (templates themselves are global)
    await client.query(
      `UPDATE schools SET template_id = NULL WHERE id = $1`,
      [schoolId]
    );

    await client.query(`DELETE FROM schools WHERE id = $1`, [schoolId]);

    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: `School "${school.name}" deleted.`,
      schoolId: school.id,
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    next(error);
  } finally {
    client.release();
  }
}
