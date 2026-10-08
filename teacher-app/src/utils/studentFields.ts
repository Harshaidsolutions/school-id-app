import type { FormFieldConfig } from "../constants/formFields";
import { fieldLabel, isFieldEnabled, sortFormFields } from "../constants/formFields";
import type { TeacherStudent } from "../types";
import {
  collapseSameIdentityFields,
  collapseSameNameFields,
  isIdentityAliasLabel,
} from "./identityFields";

type FieldKey = keyof TeacherStudent | "class_section";

export interface StudentFieldDef {
  key: FieldKey;
  label: string;
  getValue?: (
    student: TeacherStudent,
    classSection?: string
  ) => string | null | undefined;
}

const INTERNAL_KEYS = new Set([
  "id",
  "student_name",
  "photo_url",
  "status",
  "photo_id",
  "extra_fields",
  "dynamic_fields",
  "field_labels",
  "father_name",
  "mother_name",
]);

function parseExtraFields(raw: unknown): Record<string, string | null> {
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
    out[key] = value == null ? null : String(value).trim() || null;
  }
  return out;
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

function normalizeHeaderForMatch(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isExcelColumnKey(key: string): boolean {
  return /^fld_\d+$/.test(key) || key.startsWith("dyn_");
}

function extraValueByLabel(
  extra: Record<string, string | null>,
  labels: Record<string, string>,
  targetLabel: string
): string | null {
  const target = normalizeHeaderForMatch(targetLabel);
  if (!target) return null;
  for (const [key, value] of Object.entries(extra)) {
    if (value == null || !String(value).trim()) continue;
    const label = labels[key];
    if (label && normalizeHeaderForMatch(label) === target) {
      return String(value).trim();
    }
  }
  return null;
}

function canonicalValueForLabel(
  student: TeacherStudent,
  label: string,
  classSection?: string
): string | null {
  const n = normalizeHeaderForMatch(label);
  if (!n) return null;
  if (n === "id" || n === "photoid" || (n.includes("photo") && !n.includes("url"))) {
    return student.photo_id ?? null;
  }
  if (
    n === "class" ||
    n.includes("classsection") ||
    n.includes("section") ||
    n.includes("grade") ||
    n.includes("standard") ||
    n.includes("batch") ||
    n.includes("division")
  ) {
    return student.class_section ?? classSection ?? null;
  }
  if (
    (n.includes("parent") && !/phone|mobile|whatsapp|contact/.test(n)) ||
    n.includes("father") ||
    n.includes("mother") ||
    n.includes("guardian")
  ) {
    return student.parent_name ?? student.father_name ?? null;
  }
  if (
    n.includes("phone") ||
    n.includes("mobile") ||
    n.includes("tel") ||
    n.includes("whatsapp")
  ) {
    return student.parent_phone ?? null;
  }
  if (
    n === "name" ||
    n.includes("studentname") ||
    n.includes("fullname") ||
    n.includes("membername") ||
    (n.includes("name") && !n.includes("username") && !n.includes("filename"))
  ) {
    return student.student_name ?? null;
  }
  if (n.includes("address") || n.includes("locality")) return student.address ?? null;
  if (
    n.includes("roll") ||
    n.includes("admission") ||
    n.includes("enrollment") ||
    n.includes("regno") ||
    n.includes("register")
  ) {
    if (!n.includes("pen") && !n.includes("aadhaar") && !n.includes("aadhar")) {
      return student.roll_no ?? null;
    }
  }
  if (
    n === "dob" ||
    n.includes("dateofbirth") ||
    n.includes("birthdate") ||
    n.includes("birthday")
  ) {
    return student.dob ?? null;
  }
  if (n === "gender" || n === "sex") return student.gender ?? null;
  if (n.includes("blood")) return student.blood_group ?? null;
  if (n === "custom1" || n.includes("custom1")) return student.custom_1 ?? null;
  if (n === "custom2" || n.includes("custom2")) return student.custom_2 ?? null;
  if (n === "custom3" || n.includes("custom3")) return student.custom_3 ?? null;
  return null;
}

function readFieldValue(
  student: TeacherStudent,
  key: string,
  classSection?: string,
  configLabel?: string
): string | null {
  const extra = {
    ...parseExtraFields(student.extra_fields),
    ...parseExtraFields(student.dynamic_fields),
  };
  const labels = parseFieldLabels(student.field_labels);
  const label = configLabel?.trim() || labels[key] || "";

  if (key === "photo_id" || isIdentityAliasLabel(label)) {
    const generated = /^(?:ADD_\d+|IMP-\d+|ROW-\d+)$/i;
    const stored = String(student.photo_id ?? "").trim();
    const fromExtra = extra[key] != null ? String(extra[key]).trim() : "";
    if (stored && !generated.test(stored)) return stored;
    if (fromExtra && !generated.test(fromExtra)) return fromExtra;
    return stored || fromExtra || null;
  }

  if (extra[key] != null && String(extra[key]).trim() !== "") {
    return String(extra[key]).trim();
  }

  if (isExcelColumnKey(key)) {
    if (label) {
      const byLabel = extraValueByLabel(extra, labels, label);
      if (byLabel) return byLabel;
      const canonical = canonicalValueForLabel(student, label, classSection);
      if (canonical != null && String(canonical).trim() !== "") {
        return String(canonical).trim();
      }
    }
    return null;
  }

  switch (key) {
    case "class_section":
      return student.class_section ?? classSection ?? null;
    case "student_name":
      return student.student_name ?? null;
    case "roll_no":
      return student.roll_no ?? null;
    case "dob":
      return student.dob ?? null;
    case "gender":
      return student.gender ?? null;
    case "blood_group":
      return student.blood_group ?? null;
    case "parent_name":
      return student.parent_name ?? student.father_name ?? null;
    case "parent_phone":
      return student.parent_phone ?? null;
    case "address":
      return student.address ?? null;
    case "photo_id":
      return student.photo_id ?? null;
    case "custom_1":
      return student.custom_1 ?? null;
    case "custom_2":
      return student.custom_2 ?? null;
    case "custom_3":
      return student.custom_3 ?? null;
    default: {
      if (label) {
        const byLabel = extraValueByLabel(extra, labels, label);
        if (byLabel) return byLabel;
      }
      return null;
    }
  }
}

export const STUDENT_DETAIL_FIELDS: StudentFieldDef[] = [
  {
    key: "class_section",
    label: "Class",
    getValue: (s, classSection) => s.class_section ?? classSection ?? null,
  },
  { key: "photo_id", label: "PHOTO" },
  { key: "roll_no", label: "Roll No." },
  { key: "dob", label: "DOB" },
  { key: "gender", label: "Gender" },
  { key: "blood_group", label: "Blood Group" },
  {
    key: "father_name",
    label: "Father Name",
    getValue: (s) => s.father_name ?? s.parent_name ?? null,
  },
  { key: "mother_name", label: "Mother Name" },
  { key: "parent_phone", label: "Phone" },
  { key: "address", label: "Address" },
];

function fieldValue(
  field: StudentFieldDef,
  student: TeacherStudent,
  classSection?: string
): string | null | undefined {
  if (field.getValue) return field.getValue(student, classSection);
  return readFieldValue(student, String(field.key), classSection);
}

function humanizeKey(key: string): string {
  return key
    .replace(/^dyn_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function dynamicEntries(
  student: TeacherStudent
): { key: string; label: string; value: string }[] {
  const rows: { key: string; label: string; value: string }[] = [];
  const seen = new Set<string>();

  const bags = [student.extra_fields, student.dynamic_fields];
  for (const bag of bags) {
    const extra = parseExtraFields(bag);
    for (const [key, value] of Object.entries(extra)) {
      if (value == null || String(value).trim() === "" || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        key,
        label: student.field_labels?.[key] ?? humanizeKey(key),
        value: String(value),
      });
    }
  }

  return rows;
}

function withGeneratedIdentity(
  rows: { key: string; label: string; value: string }[],
  student: TeacherStudent,
  formFields?: FormFieldConfig[]
): { key: string; label: string; value: string }[] {
  const generated = String(student.photo_id ?? "").trim();
  if (!/^ADD_\d+$/i.test(generated)) return rows;
  const hasAlias = (formFields ?? []).some(
    (field) => field.enabled && isIdentityAliasLabel(field.label)
  );
  if (hasAlias || rows.some((row) => isIdentityAliasLabel(row.label) || row.key === "photo_id")) {
    return rows;
  }
  return [...rows, { key: "photo_id", label: "ID", value: generated }];
}

export function getVisibleStudentFields(
  student: TeacherStudent,
  classSection?: string,
  formFields?: FormFieldConfig[],
  options?: {
    visibility?: Record<string, boolean>;
    hideIdentity?: boolean;
  }
): { key: string; label: string; value: string }[] {
  if (formFields?.length) {
    const rows: { key: string; label: string; value: string }[] = [];
    const seenKeys = new Set<string>();
    for (const field of sortFormFields(formFields)) {
      if (!field.enabled || field.key === "photo_id") continue;
      if (seenKeys.has(field.key)) continue;
      const value = readFieldValue(student, field.key, classSection, field.label);
      seenKeys.add(field.key);
      rows.push({
        key: field.key,
        label: fieldLabel(formFields, field.key, field.label),
        value:
          value != null && String(value).trim() !== ""
            ? String(value).trim()
            : "-",
      });
    }
    return filterDisplayedRows(
      collapseSameNameFields(
        withGeneratedIdentity(collapseSameIdentityFields(rows), student, formFields)
      ),
      options
    );
  }

  const standard = STUDENT_DETAIL_FIELDS.map((field) => {
    const raw = fieldValue(field, student, classSection);
    return {
      key: String(field.key),
      label: field.label,
      value: raw != null && String(raw).trim() !== "" ? String(raw).trim() : "-",
    };
  });

  const dynamic = dynamicEntries(student);
  const dynamicWithEmpty = dynamic.length
    ? dynamic
    : [];
  return filterDisplayedRows(
    collapseSameNameFields(
      withGeneratedIdentity(
        collapseSameIdentityFields([...standard, ...dynamicWithEmpty]),
        student,
        formFields
      )
    ),
    options
  );
}

function filterDisplayedRows(
  rows: { key: string; label: string; value: string }[],
  options?: {
    visibility?: Record<string, boolean>;
    hideIdentity?: boolean;
  }
): { key: string; label: string; value: string }[] {
  return rows.filter((row) => {
    if (
      options?.hideIdentity &&
      (row.key === "photo_id" || isIdentityAliasLabel(row.label))
    ) {
      return false;
    }
    return true;
  });
}

/** Populate edit/add forms — same resolution as student details. */
export function studentFieldValueForForm(
  student: TeacherStudent,
  field: FormFieldConfig,
  classSection?: string
): string {
  return readFieldValue(student, field.key, classSection, field.label) ?? "";
}

export function enabledFormFieldKeys(formFields: FormFieldConfig[]): Set<string> {
  return new Set(
    formFields.filter((f) => f.enabled).map((f) => f.key)
  );
}

export { isFieldEnabled, fieldLabel };
