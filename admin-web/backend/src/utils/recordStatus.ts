import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import type { FormFieldConfig } from "../constants/formFields";
import { loadFormConfigForOrg } from "../controllers/formConfigController";
import { getStudentFieldValue } from "./studentFieldAccess";

export function hasCapturedPhoto(photoUrl: string | null | undefined): boolean {
  return Boolean(photoUrl && photoUrl.trim());
}

/** Name is required. Schools also require class/section. Institutes do not. */
export function hasCompleteRequiredData(input: {
  studentName: string | null | undefined;
  classSection: string | null | undefined;
  institute: boolean;
}): boolean {
  if (!input.studentName || !input.studentName.trim()) return false;
  if (!input.institute && (!input.classSection || !input.classSection.trim())) {
    return false;
  }
  return true;
}

export type RequiredDataContext = {
  fields: FormFieldConfig[];
  visibility: Record<string, boolean>;
  institute: boolean;
};

function visibilityMap(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

/** Photo and photo identity are not "pending data". Every other enabled field is. */
export function isNonDataField(field: { key: string; label?: string }): boolean {
  if (field.key === "photo" || field.key === "photo_id" || field.key === "signature") {
    return true;
  }
  const n = (field.label ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!n || n === "signature") return n === "signature";
  return n.includes("photo") && !n.includes("url");
}

export function requiredDataFields(
  fields: FormFieldConfig[],
  _visibility?: Record<string, boolean> | null
): FormFieldConfig[] {
  return fields.filter((field) => field.enabled !== false && !isNonDataField(field));
}

export function hasAllRequiredFieldData(
  record: Record<string, unknown>,
  fields: FormFieldConfig[],
  visibility: Record<string, boolean> | null | undefined,
  institute: boolean
): boolean {
  const required = requiredDataFields(fields, visibility);
  if (required.length === 0) {
    return hasCompleteRequiredData({
      studentName: record.student_name == null ? "" : String(record.student_name),
      classSection: record.class_section == null ? "" : String(record.class_section),
      institute,
    });
  }
  for (const field of required) {
    const value = getStudentFieldValue(
      record as { extra_fields?: Record<string, string | null> | null },
      field.key,
      { fieldLabel: field.label }
    );
    if (!value.trim()) return false;
  }
  return true;
}

export async function loadRequiredDataContext(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined
): Promise<RequiredDataContext> {
  const institute = Boolean(instituteId) && !schoolId;
  const fields = await loadFormConfigForOrg({
    schoolId: schoolId ?? undefined,
    instituteId: instituteId ?? undefined,
  });
  let visibility: Record<string, boolean> = {};
  if (institute && instituteId) {
    const row = await pool.query<{ field_visibility: unknown }>(
      `SELECT COALESCE(field_visibility, '{}'::jsonb) AS field_visibility
       FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    visibility = visibilityMap(row.rows[0]?.field_visibility);
  } else if (schoolId) {
    const row = await pool.query<{ field_visibility: unknown }>(
      `SELECT COALESCE(field_visibility, '{}'::jsonb) AS field_visibility
       FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    visibility = visibilityMap(row.rows[0]?.field_visibility);
  }
  return { fields, visibility, institute };
}

export function matchesExportScope(
  row: Record<string, unknown>,
  scope: string,
  ctx: RequiredDataContext
): boolean {
  const photo = hasCapturedPhoto(row.photo_url == null ? "" : String(row.photo_url));
  const complete = hasAllRequiredFieldData(row, ctx.fields, ctx.visibility, ctx.institute);
  if (scope === "pending" || scope === "uncaptured") return !photo;
  if (scope === "captured") return photo;
  if (scope === "captured-pending-data") return photo && !complete;
  return true;
}

export async function withPendingFlags<
  T extends {
    school_id?: string | null;
    institute_id?: string | null;
    photo_url?: string | null;
  },
>(
  rows: T[]
): Promise<
  Array<T & { pending_photo: boolean; pending_data: boolean; fully_captured: boolean }>
> {
  const cache = new Map<string, RequiredDataContext>();
  const out: Array<
    T & { pending_photo: boolean; pending_data: boolean; fully_captured: boolean }
  > = [];
  for (const row of rows) {
    const schoolId = row.school_id ?? null;
    const instituteId = row.institute_id ?? null;
    const key = `${schoolId ?? ""}|${instituteId ?? ""}`;
    let ctx = cache.get(key);
    if (!ctx) {
      ctx = await loadRequiredDataContext(schoolId, instituteId);
      cache.set(key, ctx);
    }
    const institute = Boolean(instituteId) && !schoolId;
    const photo = hasCapturedPhoto(row.photo_url);
    const complete = hasAllRequiredFieldData(
      row as unknown as Record<string, unknown>,
      ctx.fields,
      ctx.visibility,
      institute
    );
    out.push({
      ...row,
      pending_photo: !photo,
      pending_data: !complete,
      fully_captured: photo && complete,
    });
  }
  return out;
}

export function excelScopeClause(scope: string, institute: boolean): string {
  const photo = `(photo_url IS NOT NULL AND btrim(photo_url) <> '')`;
  const name = `(student_name IS NOT NULL AND btrim(student_name) <> '')`;
  const klass = `(class_section IS NOT NULL AND btrim(class_section) <> '')`;
  const complete = institute ? name : `(${name} AND ${klass})`;
  if (scope === "pending") return ` AND (NOT ${photo} OR NOT ${complete})`;
  if (scope === "captured") return ` AND ${photo} AND ${complete}`;
  return "";
}

export function requestedIdentityChange(
  body: Record<string, unknown>,
  currentPhotoId: string | null | undefined
): boolean {
  const current = (currentPhotoId ?? "").trim();
  const keys = ["photo_id", "photoId"];
  for (const key of keys) {
    if (body[key] === undefined || body[key] === null) continue;
    if (String(body[key]).trim() !== current) return true;
  }
  const extra = body.extra_fields ?? body.extraFields;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    const rec = extra as Record<string, unknown>;
    for (const key of keys) {
      if (rec[key] === undefined || rec[key] === null) continue;
      if (String(rec[key]).trim() !== current) return true;
    }
  }
  return false;
}

export async function orgAllowsNumberEdit(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined
): Promise<boolean> {
  if (instituteId) {
    const row = await pool.query<{ allow: boolean }>(
      `SELECT COALESCE(allow_number_edit, true) AS allow
       FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    return row.rows[0]?.allow !== false;
  }
  if (schoolId) {
    const row = await pool.query<{ allow: boolean }>(
      `SELECT COALESCE(allow_number_edit, true) AS allow
       FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    return row.rows[0]?.allow !== false;
  }
  return true;
}

export async function orgAllowsRecordEdit(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined
): Promise<boolean> {
  if (instituteId) {
    const row = await pool.query<{ allow: boolean }>(
      `SELECT COALESCE(allow_record_edit, true) AS allow
       FROM institutes WHERE id = $1 LIMIT 1`,
      [instituteId]
    );
    return row.rows[0]?.allow !== false;
  }
  if (schoolId) {
    const row = await pool.query<{ allow: boolean }>(
      `SELECT COALESCE(allow_record_edit, true) AS allow
       FROM schools WHERE id = $1 LIMIT 1`,
      [schoolId]
    );
    return row.rows[0]?.allow !== false;
  }
  return true;
}

/** Block edits of records that already have the required data. Incomplete records stay editable. */
export async function assertRecordEditAllowed(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined,
  current: {
    studentName: string | null | undefined;
    classSection: string | null | undefined;
    institute: boolean;
    record?: Record<string, unknown>;
  }
): Promise<void> {
  const ctx = await loadRequiredDataContext(schoolId, instituteId);
  const record =
    current.record ?? {
      student_name: current.studentName,
      class_section: current.classSection,
    };
  if (!hasAllRequiredFieldData(record, ctx.fields, ctx.visibility, current.institute)) return;
  const allowed = await orgAllowsRecordEdit(schoolId, instituteId);
  if (!allowed) {
    throw new AppError("Editing is turned off for this organization", 403);
  }
}

export async function assertNumberEditAllowed(
  schoolId: string | null | undefined,
  instituteId: string | null | undefined,
  body: Record<string, unknown>,
  currentPhotoId: string | null | undefined
): Promise<void> {
  if (!requestedIdentityChange(body, currentPhotoId)) return;
  const allowed = await orgAllowsNumberEdit(schoolId, instituteId);
  if (!allowed) {
    throw new AppError("Student or member number editing is turned off", 403);
  }
}

export function sanitizeFieldVisibility(
  raw: unknown,
  _institute: boolean
): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("field_visibility must be an object", 400);
  }
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) continue;
    if (typeof value !== "boolean") {
      throw new AppError(`Visibility for ${key} must be true or false`, 400);
    }
    next[key] = value;
  }
  return next;
}
