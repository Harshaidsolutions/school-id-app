import type { Student } from "../types/student";
import type { StudentRowInput } from "../types/student";
import {
  inferSemanticKey,
  isDynamicFieldKey,
  isFieldKeyColumnIndex,
  normalizeHeaderForMatch,
} from "./excelSchema";

type StudentLike = Record<string, unknown> & {
  extra_fields?: Record<string, string | null> | null;
};

const COLUMN_MAP: Record<string, keyof Student> = {
  photo_id: "photo_id",
  class_section: "class_section",
  student_name: "student_name",
  parent_name: "parent_name",
  parent_phone: "parent_phone",
  address: "address",
  roll_no: "roll_no",
  dob: "dob",
  gender: "gender",
  blood_group: "blood_group",
  custom_1: "custom_1",
  custom_2: "custom_2",
  custom_3: "custom_3",
};

export function parseExtraFields(raw: unknown): Record<string, string | null> {
  if (typeof raw === "string") {
    try {
      return parseExtraFields(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value == null) {
      out[key] = null;
    } else {
      const s = String(value).trim();
      out[key] = s || null;
    }
  }
  return out;
}

export function normalizeStudentRow(row: StudentLike): StudentLike {
  const extra = parseExtraFields(row.extra_fields);
  return { ...row, extra_fields: extra };
}

function parseFieldLabels(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try {
      return parseFieldLabels(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value != null && String(value).trim()) out[key] = String(value).trim();
  }
  return out;
}

function canonicalValueForLabel(student: StudentLike, label: string): string {
  const semantic = inferSemanticKey(normalizeHeaderForMatch(label));
  if (!semantic) return "";
  const col = COLUMN_MAP[semantic];
  if (!col) return "";
  const raw = student[col];
  if (raw == null) return "";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return String(raw).trim();
}

export function getStudentFieldValue(
  student: StudentLike,
  key: string,
  options?: {
    fieldLabels?: Record<string, string> | null;
    /** Form-config label for this column (preferred over stored field_labels). */
    fieldLabel?: string;
  }
): string {
  const extra = parseExtraFields(student.extra_fields);
  const labels = options?.fieldLabels ?? parseFieldLabels(student.field_labels);

  if (extra[key] != null && String(extra[key]).trim() !== "") {
    return String(extra[key]).trim();
  }

  if (isFieldKeyColumnIndex(key)) {
    const label = options?.fieldLabel?.trim() || labels[key];
    if (label) {
      const fromCanonical = canonicalValueForLabel(student, label);
      if (fromCanonical) return fromCanonical;
    }
    return "";
  }

  if (isDynamicFieldKey(key)) {
    return "";
  }

  const col = COLUMN_MAP[key];
  if (col) {
    const raw = student[col];
    if (raw == null) return "";
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    return String(raw).trim();
  }

  const direct = student[key];
  if (direct == null) return "";
  return String(direct).trim();
}

export function setCanonicalFieldOnRow(
  target: Partial<StudentRowInput>,
  key: string,
  value: string | null
): void {
  switch (key) {
    case "photo_id":
      target.photoId = value ?? "";
      break;
    case "class_section":
      target.classSection = value ?? "";
      break;
    case "student_name":
      target.studentName = value ?? "";
      break;
    case "parent_name":
      target.parentName = value ?? "";
      break;
    case "parent_phone":
      target.parentPhone = value ?? "";
      break;
    case "address":
      target.address = value;
      break;
    case "roll_no":
      target.rollNo = value;
      break;
    case "dob":
      target.dob = value;
      break;
    case "gender":
      target.gender = value;
      break;
    case "blood_group":
      target.bloodGroup = value;
      break;
    case "custom_1":
      target.custom1 = value;
      break;
    case "custom_2":
      target.custom2 = value;
      break;
    case "custom_3":
      target.custom3 = value;
      break;
    default:
      break;
  }
}

export function rowToInsertParams(
  row: StudentRowInput,
  options?: { bulkImport?: boolean }
): {
  photoId: string;
  classSection: string;
  studentName: string;
  parentName: string | null;
  parentPhone: string | null;
  address: string | null;
  rollNo: string | null;
  dob: string | null;
  gender: string | null;
  bloodGroup: string | null;
  custom1: string | null;
  custom2: string | null;
  custom3: string | null;
  extraFields: Record<string, string | null>;
} {
  const extraFields = { ...(row.extraFields ?? {}) };

  if (options?.bulkImport) {
    return {
      photoId: row.photoId || extraFields.photo_id || `IMP-${row.excelRow}`,
      classSection: row.classSection || extraFields.class_section || "UNKNOWN",
      studentName: row.studentName || extraFields.student_name || "UNKNOWN",
      parentName: row.parentName || extraFields.parent_name || null,
      parentPhone: row.parentPhone || extraFields.parent_phone || null,
      address: null,
      rollNo: null,
      dob: null,
      gender: null,
      bloodGroup: null,
      custom1: null,
      custom2: null,
      custom3: null,
      extraFields,
    };
  }

  return {
    photoId: row.photoId || extraFields.photo_id || `IMP-${row.excelRow}`,
    classSection: row.classSection || extraFields.class_section || "UNKNOWN",
    studentName: row.studentName || extraFields.student_name || "UNKNOWN",
    parentName: row.parentName || extraFields.parent_name || null,
    parentPhone: row.parentPhone || extraFields.parent_phone || null,
    address: row.address ?? extraFields.address ?? null,
    rollNo: row.rollNo ?? extraFields.roll_no ?? null,
    dob: row.dob ?? extraFields.dob ?? null,
    gender: row.gender ?? extraFields.gender ?? null,
    bloodGroup: row.bloodGroup ?? extraFields.blood_group ?? null,
    custom1: row.custom1 ?? extraFields.custom_1 ?? null,
    custom2: row.custom2 ?? extraFields.custom_2 ?? null,
    custom3: row.custom3 ?? extraFields.custom_3 ?? null,
    extraFields,
  };
}

export function mergeExtraFieldsForSave(
  formFields: Array<{ key: string; enabled: boolean }>,
  existing: Record<string, string | null>,
  values: Record<string, string | null | undefined>
): Record<string, string | null> {
  const merged: Record<string, string | null> = { ...existing };
  for (const field of formFields) {
    if (!field.enabled) continue;
    if (values[field.key] !== undefined) {
      merged[field.key] =
        values[field.key] == null ? null : String(values[field.key]).trim() || null;
    }
  }
  return merged;
}

export function buildFieldLabelsFromConfig(
  fields: Array<{ key: string; label: string }>
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const f of fields) {
    if (f.key && f.label) labels[f.key] = f.label;
  }
  return labels;
}

export function studentToApiJson(student: Student): Record<string, unknown> {
  const extra = parseExtraFields(student.extra_fields);
  return {
    ...student,
    extra_fields: Object.keys(extra).length ? extra : null,
    field_labels: student.field_labels ?? null,
  };
}
