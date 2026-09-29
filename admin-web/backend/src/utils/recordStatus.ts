import { pool } from "../config/database";
import { AppError } from "../middleware/errorHandler";

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

const LOCKED_SCHOOL_FIELDS = new Set(["student_name", "class_section"]);
const LOCKED_INSTITUTE_FIELDS = new Set(["student_name"]);

export function sanitizeFieldVisibility(
  raw: unknown,
  institute: boolean
): Record<string, boolean> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("field_visibility must be an object", 400);
  }
  const locked = institute ? LOCKED_INSTITUTE_FIELDS : LOCKED_SCHOOL_FIELDS;
  const next: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,64}$/.test(key)) continue;
    if (typeof value !== "boolean") {
      throw new AppError(`Visibility for ${key} must be true or false`, 400);
    }
    if (locked.has(key) && value === false) {
      throw new AppError("Required fields cannot be hidden", 400);
    }
    next[key] = value;
  }
  for (const key of locked) next[key] = true;
  return next;
}
