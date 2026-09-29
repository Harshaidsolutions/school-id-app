import type { FormFieldConfig } from "../constants/formFields";

/** Legacy canonical DB columns — used only when deriving DB row fields, not as form keys. */
export const CANONICAL_FIELD_KEYS = [
  "photo_id",
  "class_section",
  "student_name",
  "parent_name",
  "parent_phone",
  "address",
  "roll_no",
  "dob",
  "gender",
  "blood_group",
  "custom_1",
  "custom_2",
  "custom_3",
] as const;

export type CanonicalFieldKey = (typeof CANONICAL_FIELD_KEYS)[number];

export interface ExcelColumnDef {
  /** Original header text from Excel (display label). */
  label: string;
  /** Stable key: fld_0, fld_1, … tied to sheet column index. */
  key: string;
  /** Zero-based sheet column index. */
  colIndex: number;
}

export interface FormFieldConfigWithIndex extends FormFieldConfig {
  colIndex?: number;
}

/** Normalize header for flexible internal matching (not for display). */
export function normalizeHeaderForMatch(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Excel headers that are the same identity column: ID or PHOTO_ID. */
export function isIdentityAliasHeader(normalized: string): boolean {
  return normalized === "id" || normalized === "photoid";
}

function isPhotoHeader(normalized: string): boolean {
  if (!normalized.includes("photo")) return false;
  if (normalized.includes("url")) return false;
  return true;
}

function isParentNameHeader(normalized: string): boolean {
  return (
    normalized.includes("parent") ||
    normalized.includes("father") ||
    normalized.includes("mother") ||
    normalized.includes("guardian")
  );
}

function isStudentNameHeader(normalized: string): boolean {
  if (isParentNameHeader(normalized)) return false;
  if (normalized.includes("schoolname") || normalized.includes("institutename")) {
    return false;
  }
  return (
    normalized === "name" ||
    normalized.includes("studentname") ||
    normalized.includes("fullname") ||
    normalized.includes("membername") ||
    (normalized.includes("name") &&
      !normalized.includes("username") &&
      !normalized.includes("filename"))
  );
}

function isClassHeader(normalized: string): boolean {
  return (
    normalized === "class" ||
    normalized.includes("classsection") ||
    normalized.includes("section") ||
    normalized.includes("grade") ||
    normalized.includes("standard") ||
    normalized.includes("batch") ||
    normalized.includes("division")
  );
}

function isPhoneHeader(normalized: string): boolean {
  if (normalized.includes("contact") && !normalized.includes("phone")) {
    return false;
  }
  return (
    normalized.includes("phone") ||
    normalized.includes("mobile") ||
    normalized.includes("tel") ||
    normalized.includes("whatsapp")
  );
}

function isAddressHeader(normalized: string): boolean {
  return normalized.includes("address") || normalized.includes("locality");
}

function isCustomIdentifierHeader(normalized: string): boolean {
  return (
    normalized.includes("pen") ||
    normalized.includes("aadhaar") ||
    normalized.includes("aadhar") ||
    normalized.includes("uid")
  );
}

function isRollHeader(normalized: string): boolean {
  if (isCustomIdentifierHeader(normalized)) return false;
  return (
    normalized.includes("roll") ||
    normalized.includes("admission") ||
    normalized.includes("enrollment") ||
    normalized.includes("regno") ||
    normalized.includes("register")
  );
}

export function isDobHeader(normalized: string): boolean {
  if (!normalized) return false;
  if (
    normalized === "dob" ||
    normalized === "dateofbirth" ||
    normalized === "birthdate" ||
    normalized === "birthday"
  ) {
    return true;
  }
  if (normalized.includes("dateofbirth")) return true;
  if (normalized.includes("birthdate")) return true;
  if (normalized.includes("birthday")) return true;
  // Require "dob" as its own token — avoids accidental substring matches.
  return /(?:^|[^a-z])dob(?:[^a-z]|$)/.test(normalized);
}

function isGenderHeader(normalized: string): boolean {
  return normalized === "gender" || normalized === "sex";
}

function isBloodGroupHeader(normalized: string): boolean {
  return normalized.includes("blood");
}

/** Infer which canonical DB column a header maps to (internal only — not used as form field key). */
export function inferSemanticKey(normalized: string): CanonicalFieldKey | null {
  if (isIdentityAliasHeader(normalized)) return "photo_id";
  if (isPhotoHeader(normalized)) return "photo_id";
  if (isClassHeader(normalized)) return "class_section";
  if (isStudentNameHeader(normalized)) return "student_name";
  if (isParentNameHeader(normalized)) return "parent_name";
  if (isPhoneHeader(normalized)) return "parent_phone";
  if (isAddressHeader(normalized)) return "address";
  if (isRollHeader(normalized)) return "roll_no";
  if (isDobHeader(normalized)) return "dob";
  if (isGenderHeader(normalized)) return "gender";
  if (isBloodGroupHeader(normalized)) return "blood_group";
  return null;
}

export function fieldKeyForColumnIndex(colIndex: number): string {
  return `fld_${colIndex}`;
}

export function isFieldKeyColumnIndex(key: string): boolean {
  return /^fld_\d+$/.test(key);
}

/**
 * Build one schema entry per non-empty Excel header.
 * Uses stable fld_N keys tied to actual sheet column indices.
 */
export function buildExcelColumnSchema(rawHeaders: string[]): ExcelColumnDef[] {
  const columns: ExcelColumnDef[] = [];

  rawHeaders.forEach((raw, colIndex) => {
    const label = raw.trim();
    if (!label) return;

    columns.push({
      label,
      key: fieldKeyForColumnIndex(colIndex),
      colIndex,
    });
  });

  return columns;
}

/** Form field config from Excel headers — one enabled field per column. */
export function inferFormFieldsFromExcelHeaders(
  rawHeaders: string[]
): FormFieldConfigWithIndex[] {
  return buildExcelColumnSchema(rawHeaders).map((col) => ({
    key: col.key,
    label: col.label,
    enabled: true,
    colIndex: col.colIndex,
    displayOrder: col.colIndex,
    source: "excel" as const,
  }));
}

export function inferFormFieldsFromExcelHeadersWithFallback(
  rawHeaders: string[]
): FormFieldConfigWithIndex[] {
  return inferFormFieldsFromExcelHeaders(rawHeaders);
}

export function isDynamicFieldKey(key: string): boolean {
  return key.startsWith("dyn_") || isFieldKeyColumnIndex(key);
}

export function isKnownFieldKey(key: string): boolean {
  return (
    (CANONICAL_FIELD_KEYS as readonly string[]).includes(key) ||
    isDynamicFieldKey(key)
  );
}

/** Derive canonical DB column values from fld_N extra_fields + column labels. */
export function deriveCanonicalValuesFromExtraFields(
  columns: ExcelColumnDef[],
  extraFields: Record<string, string | null>
): Partial<Record<CanonicalFieldKey, string | null>> {
  const out: Partial<Record<CanonicalFieldKey, string | null>> = {};
  const used = new Set<string>();

  for (const col of columns) {
    const value = extraFields[col.key];
    if (value == null || String(value).trim() === "") continue;

    const semantic = inferSemanticKey(normalizeHeaderForMatch(col.label));
    if (!semantic || used.has(semantic)) continue;

    out[semantic] = String(value).trim();
    used.add(semantic);
  }

  return out;
}
