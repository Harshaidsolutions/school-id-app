import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import { uploadBufferToBucket, SCHOOL_ASSETS_BUCKET } from "../config/storage";
import {
  requestAdminActionOtp,
  verifyAdminActionOtp,
} from "../utils/adminOtp";
import { routeParam } from "../utils/routeParams";
import { parseBooleanField } from "../utils/parseBoolean";
import {
  assertInstituteOwnedByAdmin,
  adminSeesAllOrganizations,
  requireAdminScope,
} from "../utils/adminScope";
import {
  findOwnerUserSql,
  ownerPasswordSelect,
  ownerUserLateralJoin,
  ownerUsernameSelect,
} from "../utils/ownerCredentials";
import type { InstituteRow } from "../types/admin";

const SALT_ROUNDS = 10;

function defaultAcademicYear(): string {
  return String(new Date().getFullYear());
}

function yearFilterClause(column: string, year: string): { clause: string; values: unknown[] } {
  if (!year) return { clause: "", values: [] };
  return {
    clause: `WHERE (${column} = $1 OR ${column} IS NULL)`,
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

function syntheticOwnerEmail(username: string): string {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64);
  return `${slug || "owner"}@institutes.local`;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function uploadInstituteAsset(
  instituteId: string,
  kind: "logo" | "signature",
  file: Express.Multer.File
): Promise<string> {
  const ext = file.mimetype === "image/png" ? "png" : "jpg";
  return uploadBufferToBucket(
    SCHOOL_ASSETS_BUCKET,
    `institutes/${instituteId}/${kind}.${ext}`,
    file.buffer,
    file.mimetype
  );
}

export async function createInstitute(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new AppError("Institute name is required", 400);

    const year = String(req.body.year ?? "").trim() || null;
    const phone = String(req.body.phone ?? "").trim() || null;
    const instituteCode =
      String(req.body.institute_code ?? req.body.instituteCode ?? "").trim() ||
      null;
    const address = String(req.body.address ?? "").trim() || null;
    const instructions = String(req.body.instructions ?? "").trim() || null;

    const inserted = await pool.query<InstituteRow>(
      `INSERT INTO institutes (name, year, phone, institute_code, address, instructions, owner_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, year, phone, instituteCode, address, instructions, scope.adminUserId]
    );

    const institute = inserted.rows[0];
    if (!institute) throw new AppError("Failed to create institute", 500);

    const { logo, signature } = filesMap(req);
    let logoUrl = institute.logo_url;
    let signatureUrl = institute.signature_url;

    if (logo) {
      logoUrl = await uploadInstituteAsset(institute.id, "logo", logo);
    }
    if (signature) {
      signatureUrl = await uploadInstituteAsset(
        institute.id,
        "signature",
        signature
      );
    }

    if (logo || signature) {
      const updated = await pool.query<InstituteRow>(
        `UPDATE institutes SET logo_url = $1, signature_url = $2 WHERE id = $3 RETURNING *`,
        [logoUrl, signatureUrl, institute.id]
      );
      res.status(201).json({ status: "ok", institute: updated.rows[0] });
      return;
    }

    res.status(201).json({ status: "ok", institute });
  } catch (error) {
    next(error);
  }
}

export async function createInstituteWithOwner(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    const scope = await requireAdminScope(req);
    const instituteName = String(
      req.body.instituteName ?? req.body.name ?? ""
    ).trim();
    const ownerName = String(req.body.ownerName ?? "").trim();
    const password = String(req.body.password ?? "");
    const confirmPassword =
      req.body.confirmPassword !== undefined
        ? String(req.body.confirmPassword)
        : undefined;
    const phoneNumber =
      String(req.body.phoneNumber ?? req.body.phone ?? "").trim() || null;

    if (!instituteName) throw new AppError("Institute name is required", 400);
    if (!ownerName) throw new AppError("Owner name is required", 400);
    if (!password) throw new AppError("Password is required", 400);
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }

    const username = ownerName;
    const email = looksLikeEmail(ownerName)
      ? ownerName.toLowerCase()
      : syntheticOwnerEmail(ownerName);

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

    const instituteResult = await client.query<InstituteRow>(
      `INSERT INTO institutes (name, phone, year, owner_username_plain, owner_password_plain, owner_admin_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        instituteName,
        phoneNumber,
        defaultAcademicYear(),
        username,
        password,
        scope.adminUserId,
      ]
    );
    const institute = instituteResult.rows[0];
    if (!institute) throw new AppError("Failed to create institute", 500);

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      `INSERT INTO users (email, username, password_hash, password_plain, role, institute_id, is_owner)
       VALUES ($1, $2, $3, $4, 'institute_staff', $5, true)`,
      [email, username, passwordHash, password, institute.id]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      institute,
      staffUsername: username,
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

export async function listInstitutes(
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
      filters.push(`i.year = $${values.length + 1}`);
      values.push(year);
    }
    if (!(await adminSeesAllOrganizations(scope, req))) {
      filters.push(`i.owner_admin_id = $${values.length + 1}`);
      values.push(scope.adminUserId);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const result = await pool.query<InstituteRow>(
      `SELECT
         i.*,
         COALESCE(i.is_active, true) AS is_active,
         owner.id AS owner_user_id,
         ${ownerUsernameSelect("i.owner_username_plain")} AS owner_username,
         ${ownerPasswordSelect("i.owner_password_plain")} AS owner_password
       FROM institutes i
       ${ownerUserLateralJoin("i", "institute_id")}
       ${where}
       ORDER BY i.created_at DESC NULLS LAST, i.name ASC`,
      values
    );

    res.status(200).json({
      status: "ok",
      count: result.rows.length,
      institutes: result.rows,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateInstitute(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = routeParam(req.params.id);
    if (!id) throw new AppError("Institute id is required", 400);

    const existing = await pool.query<InstituteRow>(
      `SELECT * FROM institutes WHERE id = $1 LIMIT 1`,
      [id]
    );
    const institute = existing.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);
    const scope = await requireAdminScope(req);
    await assertInstituteOwnedByAdmin(scope, id);

    const name =
      req.body.name !== undefined
        ? String(req.body.name).trim()
        : institute.name;
    if (!name) throw new AppError("Institute name is required", 400);

    const year =
      req.body.year !== undefined
        ? String(req.body.year).trim() || null
        : institute.year;
    const phone =
      req.body.phone !== undefined
        ? String(req.body.phone).trim() || null
        : institute.phone;
    const instituteCode =
      req.body.institute_code !== undefined ||
      req.body.instituteCode !== undefined
        ? String(req.body.institute_code ?? req.body.instituteCode).trim() ||
          null
        : institute.institute_code;
    const address =
      req.body.address !== undefined
        ? String(req.body.address).trim() || null
        : institute.address;
    const instructions =
      req.body.instructions !== undefined
        ? String(req.body.instructions).trim() || null
        : institute.instructions;
    const isActive =
      req.body.is_active !== undefined
        ? parseBooleanField(req.body.is_active, institute.is_active ?? true)
        : institute.is_active ?? true;

    const { logo, signature } = filesMap(req);
    let logoUrl = institute.logo_url;
    let signatureUrl = institute.signature_url;

    if (logo) {
      logoUrl = await uploadInstituteAsset(institute.id, "logo", logo);
    }
    if (signature) {
      signatureUrl = await uploadInstituteAsset(
        institute.id,
        "signature",
        signature
      );
    }

    const updated = await pool.query<InstituteRow>(
      `UPDATE institutes
       SET name = $1, year = $2, phone = $3, institute_code = $4, address = $5,
           instructions = $6, logo_url = $7, signature_url = $8, is_active = $9
       WHERE id = $10
       RETURNING *`,
      [
        name,
        year,
        phone,
        instituteCode,
        address,
        instructions,
        logoUrl,
        signatureUrl,
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
          `UPDATE institutes SET owner_password_plain = $1 WHERE id = $2`,
          [ownerPassword, id]
        );
      }

      if (ownerUsername !== undefined) {
        await pool.query(
          `UPDATE institutes SET owner_username_plain = $1 WHERE id = $2`,
          [ownerUsername, id]
        );
      }

      const ownerResult = await pool.query<{ id: string }>(
        findOwnerUserSql("institute_id"),
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

    res.status(200).json({ status: "ok", institute: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

/** PATCH /admin/institutes/:id/active — toggle teacher login without multipart upload middleware. */
export async function setInstituteActive(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) throw new AppError("Institute id is required", 400);

    if (req.body.is_active === undefined && req.body.isActive === undefined) {
      throw new AppError("is_active is required", 400);
    }

    const isActive = parseBooleanField(
      req.body.is_active ?? req.body.isActive,
      true
    );

    const updated = await pool.query<InstituteRow>(
      `UPDATE institutes
       SET is_active = $1
       WHERE id = $2::uuid
       RETURNING *`,
      [isActive, id]
    );

    const institute = updated.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    res.status(200).json({ status: "ok", institute });
  } catch (error) {
    next(error);
  }
}

async function getAdminEmail(adminUserId: string): Promise<string> {
  const adminResult = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
    [adminUserId]
  );
  const email = adminResult.rows[0]?.email?.trim();
  if (!email) {
    throw new AppError("Admin account email is required to send OTP", 400);
  }
  return email;
}

/** POST /admin/institutes/:id/request-delete-otp */
export async function requestInstituteDeleteOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.id);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const instituteResult = await pool.query<{ name: string }>(
      `SELECT name FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    const institute = instituteResult.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    const adminEmail = await getAdminEmail(req.user.userId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail,
      actionType: "delete_institute",
      resourceId: instituteId,
      emailSubject: `Delete institute confirmation: ${institute.name}`,
      emailIntro: `Confirm permanent deletion of institute "${institute.name}" and all related data.`,
      logPrefix: "[institute-delete]",
    });

    res.status(200).json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

/** DELETE /admin/institutes/:id — body: { otp } */
export async function deleteInstitute(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);

    const instituteId = routeParam(req.params.id);
    if (!instituteId) throw new AppError("Institute id is required", 400);

    const otp = String(req.body?.otp ?? "").trim();
    await client.query("BEGIN");

    const instituteResult = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM institutes WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [instituteId]
    );
    const institute = instituteResult.rows[0];
    if (!institute) throw new AppError("Institute not found", 404);

    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_institute",
      resourceId: instituteId,
      otp,
    });

    await client.query(`DELETE FROM users WHERE institute_id = $1`, [instituteId]);
    await client.query(`DELETE FROM institutes WHERE id = $1`, [instituteId]);
    await client.query("COMMIT");

    res.status(200).json({
      status: "ok",
      message: `Institute "${institute.name}" deleted.`,
      deleted: true,
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
