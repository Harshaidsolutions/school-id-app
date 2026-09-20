export type FormFieldSource = "excel" | "manual";

export interface FormFieldConfig {
  key: string;
  label: string;
  enabled: boolean;
  /** excel = from uploaded Excel column; manual = added in Form Setup */
  source?: FormFieldSource;
  colIndex?: number;
  /** Admin-defined display order (Form Setup drag-and-drop). */
  displayOrder?: number;
}

/** Legacy defaults — only used when no Excel has been uploaded yet. */
export const DEFAULT_FORM_FIELDS: FormFieldConfig[] = [
  { key: "photo_id", label: "PHOTO", enabled: true },
  { key: "class_section", label: "CLASS", enabled: true },
  { key: "student_name", label: "NAME", enabled: true },
  { key: "parent_name", label: "PARENT", enabled: true },
  { key: "address", label: "ADDRESS", enabled: true },
  { key: "parent_phone", label: "PHONE", enabled: true },
  { key: "roll_no", label: "ROLL NO", enabled: true },
  { key: "dob", label: "DOB", enabled: true },
  { key: "gender", label: "Gender", enabled: true },
  { key: "blood_group", label: "Blood Group", enabled: true },
];

export const FORM_FIELD_KEYS = DEFAULT_FORM_FIELDS.map((f) => f.key);

export {
  inferFormFieldsFromExcelHeaders,
  inferFormFieldsFromExcelHeadersWithFallback,
  isKnownFieldKey,
} from "../utils/excelSchema";

import {
  CANONICAL_FIELD_KEYS,
  inferFormFieldsFromExcelHeaders as inferFromExcel,
} from "../utils/excelSchema";

/** Saved config is authoritative — do not strip unknown/dynamic keys. */
export function mergeFormFields(saved: FormFieldConfig[]): FormFieldConfig[] {
  if (!saved.length) return [];
  return saved.map((f) => ({
    key: f.key,
    label: f.label?.trim() || f.key,
    enabled: f.enabled !== false,
  }));
}

function orderValue(field: FormFieldConfig, fallbackIndex: number): number {
  if (typeof field.displayOrder === "number") return field.displayOrder;
  if (typeof field.colIndex === "number") return field.colIndex;
  return fallbackIndex;
}

/** Assign displayOrder when missing (legacy configs). */
export function assignDisplayOrders(fields: FormFieldConfig[]): FormFieldConfig[] {
  return fields.map((field, index) => ({
    ...field,
    displayOrder: orderValue(field, index),
  }));
}

/** Sort by displayOrder — single source of truth for field order everywhere. */
export function sortFormFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  const withOrder = assignDisplayOrders(fields);
  return [...withOrder].sort((a, b) => {
    const diff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
    if (diff !== 0) return diff;
    return a.key.localeCompare(b.key);
  });
}

/** Re-index displayOrder from current array sequence (after drag-and-drop). */
export function withSequentialDisplayOrder(fields: FormFieldConfig[]): FormFieldConfig[] {
  return fields.map((field, index) => ({ ...field, displayOrder: index }));
}

const STUDENT_COLUMN_KEYS: { key: string; column: string; defaultLabel: string }[] =
  CANONICAL_FIELD_KEYS.map((key) => ({
    key,
    column: key,
    defaultLabel: key.replace(/_/g, " "),
  }));

/** Infer enabled form fields from existing imported student rows (no re-upload needed). */
export function inferFormFieldsFromStudentRows(
  rows: Array<Record<string, string | null | undefined>>
): FormFieldConfig[] {
  if (rows.length === 0) return [];

  const enabledKeys = new Set<string>();
  for (const row of rows) {
    for (const { key, column } of STUDENT_COLUMN_KEYS) {
      const raw = row[column];
      if (raw != null && String(raw).trim() !== "") {
        enabledKeys.add(key);
      }
    }
    const extra = row.extra_fields;
    if (extra && typeof extra === "object") {
      for (const [key, value] of Object.entries(extra)) {
        if (value != null && String(value).trim() !== "") {
          enabledKeys.add(key);
        }
      }
    }
  }

  return sortFormFields(
    STUDENT_COLUMN_KEYS.filter((f) => enabledKeys.has(f.key)).map((f) => ({
      key: f.key,
      label: f.defaultLabel,
      enabled: true,
    }))
  );
}

/** Infer enabled fields from aggregate non-empty column counts (all student rows). */
export function inferFormFieldsFromColumnCounts(
  counts: Record<string, number>,
  totalStudents: number
): FormFieldConfig[] {
  if (totalStudents <= 0) return [];

  const enabledKeys = new Set<string>();
  for (const { key, column } of STUDENT_COLUMN_KEYS) {
    if ((counts[column] ?? 0) > 0) {
      enabledKeys.add(key);
    }
  }
  for (const [key, count] of Object.entries(counts)) {
    if ((key.startsWith("dyn_") || key.startsWith("fld_")) && count > 0) {
      enabledKeys.add(key);
    }
  }

  return sortFormFields(
    [...enabledKeys].map((key) => {
      const hit = STUDENT_COLUMN_KEYS.find((f) => f.key === key);
      return {
        key,
        label: hit?.defaultLabel ?? key.replace(/^dyn_/, "").replace(/_/g, " "),
        enabled: true,
      };
    })
  );
}

/** Re-export for callers that import from constants only. */
export function inferFormFieldsFromExcelHeadersLegacy(
  rawHeaders: string[]
): FormFieldConfig[] {
  return inferFromExcel(rawHeaders);
}
