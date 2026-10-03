import crypto from "crypto";
import bcrypt from "bcrypt";
import type { Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import {
  readBucketObject,
  STUDENT_PHOTOS_BUCKET,
  uploadBufferToBucket,
} from "../config/storage";
import { requireAdminScope, type AdminScope } from "../utils/adminScope";
import {
  allocateOwnerEmail,
  assertOwnerPasswordAvailable,
  ownerPasswordSelect,
  ownerUserLateralJoin,
  ownerUsernameSelect,
} from "../utils/ownerCredentials";
import { captureAllowedFromBody, parseBooleanField } from "../utils/parseBoolean";
import { requestAdminActionOtp, verifyAdminActionOtp } from "../utils/adminOtp";
import { routeParam } from "../utils/routeParams";

const SALT_ROUNDS = 10;

type FormField = {
  id: string;
  field_name: string;
  field_type: string;
  field_order: number;
  required: boolean;
};

type SubmissionValue = {
  submission_id: string;
  field_id: string;
  text_value: string | null;
  photo_url: string | null;
  created_at: string;
};

function syntheticOwnerEmail(username: string): string {
  const slug = username.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 64);
  return `${slug || "owner"}@organizations.local`;
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function publicOrigin(req: Request): string {
  const configured = process.env.PUBLIC_WEB_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

function ownerFilter(scope: AdminScope, values: unknown[]): string {
  values.push(scope.adminUserId);
  const param = values.length;
  return scope.isSuperAdmin
    ? `(o.owner_admin_id = $${param} OR o.owner_admin_id IS NULL)`
    : `o.owner_admin_id = $${param}`;
}

async function assertOrganizationOwned(scope: AdminScope, organizationId: string): Promise<void> {
  const values: unknown[] = [organizationId];
  const owner = ownerFilter(scope, values);
  const row = await pool.query(`SELECT id FROM organizations o WHERE o.id = $1 AND ${owner} LIMIT 1`, values);
  if (!row.rows[0]) throw new AppError("Organization not found", 404);
}

function photoPath(organizationId: string, submissionId: string, fieldId: string): string {
  return `organizations/${organizationId}/${submissionId}/${fieldId}.jpg`;
}

async function loadFields(formId: string): Promise<FormField[]> {
  const result = await pool.query<FormField>(
    `SELECT id, field_name, field_type, field_order, required
     FROM organization_form_fields
     WHERE form_id = $1
     ORDER BY field_order ASC, created_at ASC`,
    [formId]
  );
  return result.rows;
}

async function loadSubmissionRows(organizationId: string, formId: string) {
  const submissions = await pool.query<{ id: string; created_at: string }>(
    `SELECT id, created_at
     FROM organization_submissions
     WHERE organization_id = $1 AND form_id = $2
     ORDER BY created_at ASC`,
    [organizationId, formId]
  );
  if (submissions.rows.length === 0) return [];
  const values = await pool.query<SubmissionValue>(
    `SELECT v.submission_id, v.field_id, v.text_value, v.photo_url, s.created_at
     FROM organization_submission_values v
     JOIN organization_submissions s ON s.id = v.submission_id
     WHERE s.organization_id = $1 AND s.form_id = $2`,
    [organizationId, formId]
  );
  const bySubmission = new Map<string, SubmissionValue[]>();
  for (const value of values.rows) {
    const list = bySubmission.get(value.submission_id) ?? [];
    list.push(value);
    bySubmission.set(value.submission_id, list);
  }
  return submissions.rows.map((row, index) => ({
    id: row.id,
    serial: index + 1,
    createdAt: row.created_at,
    values: Object.fromEntries(
      (bySubmission.get(row.id) ?? []).map((value) => [
        value.field_id,
        {
          text: value.text_value,
          hasPhoto: Boolean(value.photo_url),
        },
      ])
    ),
  }));
}

export async function listOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const values: unknown[] = [];
    const owner = ownerFilter(scope, values);
    const result = await pool.query(
      `SELECT o.id, o.name, o.phone,
              COALESCE(o.is_active, true) AS is_active,
              COALESCE(o.allow_screenshot, true) AS allow_screenshot,
              COALESCE(o.allow_screen_recording, true) AS allow_screen_recording,
              o.created_at,
              ${ownerUsernameSelect("o.owner_username_plain")} AS username,
              ${ownerPasswordSelect("o.owner_password_plain")} AS password
       FROM organizations o
       ${ownerUserLateralJoin("o", "organization_id")}
       WHERE ${owner}
       ORDER BY o.created_at DESC`,
      values
    );
    res.json({ organizations: result.rows });
  } catch (error) {
    next(error);
  }
}

export async function createOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const scope = await requireAdminScope(req);
    const name = String(req.body.name ?? "").trim();
    const username = String(req.body.username ?? req.body.ownerName ?? "").trim();
    const password = String(req.body.password ?? "");
    const confirmPassword = req.body.confirmPassword !== undefined ? String(req.body.confirmPassword) : undefined;
    const phone = String(req.body.phone ?? req.body.phoneNumber ?? "").trim();
    if (!name) throw new AppError("Organization name is required", 400);
    if (!phone) throw new AppError("Phone number is required", 400);
    if (!username) throw new AppError("Username is required", 400);
    if (!password) throw new AppError("Password is required", 400);
    if (confirmPassword !== undefined && password !== confirmPassword) {
      throw new AppError("Passwords do not match", 400);
    }
    const preferredEmail = looksLikeEmail(username) ? username.toLowerCase() : syntheticOwnerEmail(username);
    await client.query("BEGIN");
    await assertOwnerPasswordAvailable(client, username, password);
    const email = await allocateOwnerEmail(client, preferredEmail);
    const created = await client.query(
      `INSERT INTO organizations (name, phone, owner_admin_id, owner_username_plain, owner_password_plain)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, phone, is_active, created_at, owner_username_plain AS username`,
      [name, phone, scope.adminUserId, username, password]
    );
    const organization = created.rows[0];
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await client.query(
      `INSERT INTO users (email, username, password_hash, password_plain, role, organization_id, is_owner)
       VALUES ($1, $2, $3, $4, 'organization_staff', $5, true)`,
      [email, username, passwordHash, password, organization.id]
    );
    await client.query("COMMIT");
    res.status(201).json({ organization });
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

export async function getOrganizationWorkspaceAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const org = await pool.query(
      `SELECT id, name, phone, is_active, created_at, owner_username_plain AS username
       FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    const form = await pool.query(
      `SELECT id, public_token, is_active, created_at
       FROM organization_forms
       WHERE organization_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [organizationId]
    );
    const current = form.rows[0];
    const fields = current ? await loadFields(current.id) : [];
    const submissions = current ? await loadSubmissionRows(organizationId, current.id) : [];
    res.json({
      organization: org.rows[0],
      form: current
        ? {
            id: current.id,
            isActive: current.is_active,
            link: `${publicOrigin(req)}/org-form/${current.public_token}`,
            fields,
          }
        : null,
      submissions,
    });
  } catch (error) {
    next(error);
  }
}

export async function createOrganizationForm(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const rawFields = Array.isArray(req.body.fields) ? req.body.fields : [];
    const fields = rawFields
      .map((field: { fieldName?: string; fieldType?: string; name?: string; type?: string }, index: number) => ({
        name: String(field.fieldName ?? field.name ?? "").trim(),
        type: String(field.fieldType ?? field.type ?? "").trim().toLowerCase(),
        order: index,
      }))
      .filter((field: { name: string; type: string }) => field.name);
    if (fields.length === 0) throw new AppError("Add at least one field", 400);
    for (const field of fields) {
      if (field.type !== "text" && field.type !== "photo") {
        throw new AppError("Field type must be Text/Data or Image/Photo", 400);
      }
    }
    const token = crypto.randomBytes(18).toString("base64url");
    await client.query("BEGIN");
    await client.query(
      `UPDATE organization_forms SET is_active = false, updated_at = NOW() WHERE organization_id = $1`,
      [organizationId]
    );
    const inserted = await client.query(
      `INSERT INTO organization_forms (organization_id, public_token)
       VALUES ($1, $2)
       RETURNING id, public_token, is_active`,
      [organizationId, token]
    );
    const form = inserted.rows[0];
    for (const field of fields) {
      await client.query(
        `INSERT INTO organization_form_fields (form_id, field_name, field_type, field_order, required)
         VALUES ($1, $2, $3, $4, true)`,
        [form.id, field.name, field.type, field.order]
      );
    }
    await client.query("COMMIT");
    const savedFields = await loadFields(form.id);
    res.status(201).json({
      form: {
        id: form.id,
        isActive: form.is_active,
        link: `${publicOrigin(req)}/org-form/${form.public_token}`,
        fields: savedFields,
      },
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

export async function getPublicOrganizationForm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = routeParam(req.params.token);
    if (!token) throw new AppError("Form link is required", 400);
    const form = await pool.query(
      `SELECT f.id, f.is_active, o.name AS organization_name, o.is_active AS organization_active
       FROM organization_forms f
       JOIN organizations o ON o.id = f.organization_id
       WHERE f.public_token = $1
       LIMIT 1`,
      [token]
    );
    const row = form.rows[0];
    if (!row || row.is_active !== true || row.organization_active === false) {
      throw new AppError("This form is not available", 404);
    }
    const fields = await loadFields(row.id);
    res.json({
      organizationName: row.organization_name,
      fields: fields.map((field) => ({
        id: field.id,
        fieldName: field.field_name,
        fieldType: field.field_type,
        required: field.required,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function submitPublicOrganizationForm(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  const storedPaths: string[] = [];
  try {
    const token = routeParam(req.params.token);
    if (!token) throw new AppError("Form link is required", 400);
    const form = await pool.query<{ id: string; organization_id: string; is_active: boolean; organization_active: boolean }>(
      `SELECT f.id, f.organization_id, f.is_active, o.is_active AS organization_active
       FROM organization_forms f
       JOIN organizations o ON o.id = f.organization_id
       WHERE f.public_token = $1
       LIMIT 1`,
      [token]
    );
    const row = form.rows[0];
    if (!row || row.is_active !== true || row.organization_active === false) {
      throw new AppError("This form is not available", 404);
    }
    const fields = await loadFields(row.id);
    const files = Array.isArray(req.files) ? req.files : [];
    const fileByField = new Map(files.map((file) => [file.fieldname, file]));
    const body = req.body as Record<string, unknown>;
    for (const field of fields) {
      if (!field.required) continue;
      if (field.field_type === "photo") {
        const file = fileByField.get(field.id);
        if (!file) throw new AppError(`${field.field_name} is required`, 400);
      } else if (!String(body[field.id] ?? "").trim()) {
        throw new AppError(`${field.field_name} is required`, 400);
      }
    }
    const known = new Set(fields.map((field) => field.id));
    for (const file of files) {
      if (!known.has(file.fieldname)) throw new AppError("Unknown photo field", 400);
    }
    const submissionId = crypto.randomUUID();
    const photoValues = new Map<string, string>();
    for (const field of fields) {
      if (field.field_type !== "photo") continue;
      const file = fileByField.get(field.id);
      if (!file) continue;
      const path = photoPath(row.organization_id, submissionId, field.id);
      await uploadBufferToBucket(STUDENT_PHOTOS_BUCKET, path, file.buffer, file.mimetype || "image/jpeg");
      storedPaths.push(path);
      photoValues.set(field.id, path);
    }
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO organization_submissions (id, form_id, organization_id) VALUES ($1, $2, $3)`,
      [submissionId, row.id, row.organization_id]
    );
    for (const field of fields) {
      await client.query(
        `INSERT INTO organization_submission_values (submission_id, field_id, text_value, photo_url)
         VALUES ($1, $2, $3, $4)`,
        [
          submissionId,
          field.id,
          field.field_type === "photo" ? null : String(body[field.id] ?? "").trim() || null,
          photoValues.get(field.id) ?? null,
        ]
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ status: "ok", submissionId });
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

async function sendSubmissionPhoto(
  organizationId: string,
  submissionId: string,
  fieldId: string,
  res: Response
): Promise<void> {
  const value = await pool.query<{ photo_url: string | null }>(
    `SELECT v.photo_url
     FROM organization_submission_values v
     JOIN organization_submissions s ON s.id = v.submission_id
     WHERE s.id = $1 AND s.organization_id = $2 AND v.field_id = $3
     LIMIT 1`,
    [submissionId, organizationId, fieldId]
  );
  const path = value.rows[0]?.photo_url;
  if (!path) throw new AppError("Photo not found", 404);
  const object = await readBucketObject(STUDENT_PHOTOS_BUCKET, path);
  if (!object?.bytes?.length) throw new AppError("Photo not found", 404);
  res.setHeader("Content-Type", object.contentType || "image/jpeg");
  res.setHeader("Cache-Control", "private, no-cache");
  res.status(200).send(object.bytes);
}

export async function downloadOrganizationSubmissionPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    const submissionId = routeParam(req.params.submissionId);
    const fieldId = routeParam(req.params.fieldId);
    if (!organizationId || !submissionId || !fieldId) throw new AppError("Photo is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    await sendSubmissionPhoto(organizationId, submissionId, fieldId, res);
  } catch (error) {
    next(error);
  }
}

export async function getOrganizationAppWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) throw new AppError("Organization login is required", 403);
    const org = await pool.query(
      `SELECT id, name, is_active FROM organizations WHERE id = $1 LIMIT 1`,
      [organizationId]
    );
    const organization = org.rows[0];
    if (!organization || organization.is_active === false) throw new AppError("Organization not found", 404);
    const form = await pool.query(
      `SELECT id, public_token, is_active FROM organization_forms
       WHERE organization_id = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [organizationId]
    );
    const current = form.rows[0];
    const fields = current ? await loadFields(current.id) : [];
    const submissions = current ? await loadSubmissionRows(organizationId, current.id) : [];
    res.json({
      organizationName: organization.name,
      link: current ? `${publicOrigin(req)}/org-form/${current.public_token}` : null,
      fields,
      submissions,
    });
  } catch (error) {
    next(error);
  }
}

function isLockedPhotoNumber(name: string): boolean {
  return /photo\s*(number|no\.?|id)\b/i.test(name);
}

export async function updateOrganizationAppSubmission(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const organizationId = req.user?.organizationId;
    const submissionId = routeParam(req.params.submissionId);
    if (!organizationId || !submissionId) throw new AppError("Record is required", 400);
    const owned = await pool.query<{ form_id: string }>(
      `SELECT form_id FROM organization_submissions WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [submissionId, organizationId]
    );
    const submission = owned.rows[0];
    if (!submission) throw new AppError("Record not found", 404);
    const fields = await loadFields(submission.form_id);
    const incoming = req.body?.values;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new AppError("Updated fields are required", 400);
    }
    const values = incoming as Record<string, unknown>;
    await client.query("BEGIN");
    for (const field of fields) {
      if (field.field_type !== "text") continue;
      if (isLockedPhotoNumber(field.field_name)) continue;
      if (!Object.prototype.hasOwnProperty.call(values, field.id)) continue;
      const text = String(values[field.id] ?? "").trim();
      if (field.required && !text) throw new AppError(`${field.field_name} is required`, 400);
      await client.query(
        `UPDATE organization_submission_values
         SET text_value = $1
         WHERE submission_id = $2 AND field_id = $3`,
        [text || null, submissionId, field.id]
      );
    }
    await client.query(
      `UPDATE organization_submissions SET updated_at = NOW() WHERE id = $1 AND organization_id = $2`,
      [submissionId, organizationId]
    );
    await client.query("COMMIT");
    res.json({ status: "ok" });
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

async function adminEmail(adminUserId: string): Promise<string> {
  const result = await pool.query<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
    [adminUserId]
  );
  const email = result.rows[0]?.email?.trim();
  if (!email) throw new AppError("Admin account email is required to send OTP", 400);
  return email;
}

export async function setOrganizationActive(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    if (req.body.is_active === undefined && req.body.isActive === undefined) {
      throw new AppError("is_active is required", 400);
    }
    const isActive = parseBooleanField(req.body.is_active ?? req.body.isActive, true);
    const updated = await pool.query(
      `UPDATE organizations SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING id, is_active`,
      [isActive, organizationId]
    );
    res.json({ status: "ok", organization: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function setOrganizationCapturePolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const allowCapture = captureAllowedFromBody(req.body);
    const updated = await pool.query(
      `UPDATE organizations
       SET allow_screenshot = $1, allow_screen_recording = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, allow_screenshot, allow_screen_recording`,
      [allowCapture, organizationId]
    );
    res.json({ status: "ok", organization: updated.rows[0] });
  } catch (error) {
    next(error);
  }
}

export async function updateOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const name = String(req.body.name ?? "").trim();
    const phone = String(req.body.phone ?? "").trim();
    const username = String(req.body.username ?? "").trim();
    const password = String(req.body.password ?? "");
    if (!name) throw new AppError("Organization name is required", 400);
    if (!phone) throw new AppError("Phone number is required", 400);
    if (!username) throw new AppError("Username is required", 400);
    if (!password) throw new AppError("Password is required", 400);
    await client.query("BEGIN");
    const owner = await client.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE organization_id = $1 AND role = 'organization_staff'
       ORDER BY COALESCE(is_owner, false) DESC, created_at ASC NULLS LAST
       LIMIT 1`,
      [organizationId]
    );
    await assertOwnerPasswordAvailable(client, username, password, {
      organizationId,
      userId: owner.rows[0]?.id,
    });
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const updated = await client.query(
      `UPDATE organizations
       SET name = $1, phone = $2, owner_username_plain = $3, owner_password_plain = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING id, name, phone, is_active, created_at, owner_username_plain AS username, owner_password_plain AS password`,
      [name, phone, username, password, organizationId]
    );
    if (owner.rows[0]) {
      await client.query(
        `UPDATE users
         SET username = $1, password_hash = $2, password_plain = $3
         WHERE id = $4`,
        [username, passwordHash, password, owner.rows[0].id]
      );
    } else {
      const preferredEmail = looksLikeEmail(username) ? username.toLowerCase() : syntheticOwnerEmail(username);
      const email = await allocateOwnerEmail(client, preferredEmail);
      await client.query(
        `INSERT INTO users (email, username, password_hash, password_plain, role, organization_id, is_owner)
         VALUES ($1, $2, $3, $4, 'organization_staff', $5, true)`,
        [email, username, passwordHash, password, organizationId]
      );
    }
    await client.query("COMMIT");
    res.json({ organization: updated.rows[0] });
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

export async function requestOrganizationDeleteOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const organization = await pool.query<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [organizationId]
    );
    if (!organization.rows[0]) throw new AppError("Organization not found", 404);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail: await adminEmail(req.user.userId),
      actionType: "delete_organization",
      resourceId: organizationId,
      emailSubject: `Delete organization confirmation: ${organization.rows[0].name}`,
      emailIntro: `Confirm permanent deletion of organization "${organization.rows[0].name}" and its forms.`,
      logPrefix: "[organization-delete]",
    });
    res.json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const otp = String(req.body?.otp ?? "").trim();
    await client.query("BEGIN");
    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_organization",
      resourceId: organizationId,
      otp,
    });
    await client.query(`DELETE FROM users WHERE organization_id = $1`, [organizationId]);
    await client.query(`DELETE FROM organizations WHERE id = $1`, [organizationId]);
    await client.query("COMMIT");
    res.json({ status: "ok", deleted: true });
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

export async function requestOrganizationSubmissionDeleteOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const otpResult = await requestAdminActionOtp({
      adminUserId: req.user.userId,
      adminEmail: await adminEmail(req.user.userId),
      actionType: "delete_organization_submissions",
      resourceId: organizationId,
      emailSubject: "Delete organization records confirmation",
      emailIntro: "Confirm deletion of the selected organization records.",
      logPrefix: "[organization-submissions-delete]",
    });
    res.json({ status: "ok", ...otpResult });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrganizationSubmissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  const client = await pool.connect();
  try {
    if (!req.user) throw new AppError("Authentication required", 401);
    const scope = await requireAdminScope(req);
    const organizationId = routeParam(req.params.id);
    if (!organizationId) throw new AppError("Organization id is required", 400);
    await assertOrganizationOwned(scope, organizationId);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)) : [];
    if (ids.length === 0) throw new AppError("Select at least one record", 400);
    const otp = String(req.body?.otp ?? "").trim();
    await client.query("BEGIN");
    await verifyAdminActionOtp({
      adminUserId: req.user.userId,
      actionType: "delete_organization_submissions",
      resourceId: organizationId,
      otp,
    });
    const deleted = await client.query(
      `DELETE FROM organization_submissions
       WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
      [organizationId, ids]
    );
    await client.query("COMMIT");
    res.json({ status: "ok", deleted: deleted.rowCount ?? 0 });
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

export async function downloadOrganizationAppPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const organizationId = req.user?.organizationId;
    const submissionId = routeParam(req.params.submissionId);
    const fieldId = routeParam(req.params.fieldId);
    if (!organizationId || !submissionId || !fieldId) throw new AppError("Photo is required", 400);
    await sendSubmissionPhoto(organizationId, submissionId, fieldId, res);
  } catch (error) {
    next(error);
  }
}
