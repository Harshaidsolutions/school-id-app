export type FormFieldSource = "excel" | "manual";

export interface FormFieldConfig {
  key: string;
  label: string;
  enabled: boolean;
  source?: FormFieldSource;
  colIndex?: number;
  displayOrder?: number;
}

export function isExcelFormField(field: FormFieldConfig): boolean {
  if (field.source === "manual") return false;
  if (field.source === "excel") return true;
  if (field.key.startsWith("dyn_")) return false;
  if (/^fld_\d+$/.test(field.key)) return true;
  if (typeof field.colIndex === "number") return true;
  return false;
}

export function isManualFormField(field: FormFieldConfig): boolean {
  return !isExcelFormField(field);
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

export function sortFormFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  return [...fields]
    .map((field, index) => ({
      ...field,
      displayOrder: orderValue(field, index),
    }))
    .sort((a, b) => {
      const diff = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      if (diff !== 0) return diff;
      return a.key.localeCompare(b.key);
    });
}

export function withSequentialDisplayOrder(fields: FormFieldConfig[]): FormFieldConfig[] {
  return fields.map((field, index) => ({ ...field, displayOrder: index }));
}

/** Stable drag/edit identity — avoids collisions when multiple fields share a key. */
export function formFieldRowId(field: FormFieldConfig, index: number): string {
  if (typeof field.colIndex === "number") {
    return `excel:${field.colIndex}:${field.key}`;
  }
  if (field.key.startsWith("dyn_")) {
    return field.key;
  }
  return `field:${field.key}:order:${field.displayOrder ?? index}`;
}



type StudentFieldSource = {

  photo_id?: string | null;

  class_section?: string | null;

  student_name?: string | null;

  parent_name?: string | null;

  parent_phone?: string | null;

  address?: string | null;

  roll_no?: string | null;

  dob?: string | null;

  gender?: string | null;

  blood_group?: string | null;

  custom_1?: string | null;

  custom_2?: string | null;

  custom_3?: string | null;

  extra_fields?: Record<string, string | null> | null | string;

  field_labels?: Record<string, string> | null;

};



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



function displayValue(raw: string | null | undefined): string {

  if (raw == null || String(raw).trim() === "") return "—";

  return String(raw);

}



function isExcelColumnKey(key: string): boolean {
  return key.startsWith("fld_") || key.startsWith("dyn_");
}

function normalizeHeaderForMatch(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function canonicalKeyForLabel(label: string): keyof StudentFieldSource | null {
  const n = normalizeHeaderForMatch(label);
  if (!n) return null;
  if (n.includes("photo") && !n.includes("url")) return "photo_id";
  if (
    n === "class" ||
    n.includes("classsection") ||
    n.includes("section") ||
    n.includes("grade") ||
    n.includes("standard") ||
    n.includes("batch") ||
    n.includes("division")
  ) {
    return "class_section";
  }
  if (
    n.includes("parent") ||
    n.includes("father") ||
    n.includes("mother") ||
    n.includes("guardian")
  ) {
    return "parent_name";
  }
  if (
    n.includes("phone") ||
    n.includes("mobile") ||
    n.includes("tel") ||
    n.includes("whatsapp")
  ) {
    return "parent_phone";
  }
  if (
    n === "name" ||
    n.includes("studentname") ||
    n.includes("fullname") ||
    n.includes("membername") ||
    (n.includes("name") && !n.includes("username") && !n.includes("filename"))
  ) {
    return "student_name";
  }
  if (n.includes("address") || n.includes("locality")) return "address";
  if (
    n.includes("roll") ||
    n.includes("admission") ||
    n.includes("enrollment") ||
    n.includes("regno") ||
    n.includes("register")
  ) {
    if (!n.includes("pen") && !n.includes("aadhaar") && !n.includes("aadhar")) {
      return "roll_no";
    }
  }
  if (
    n === "dob" ||
    n.includes("dateofbirth") ||
    n.includes("birthdate") ||
    n.includes("birthday")
  ) {
    return "dob";
  }
  if (n === "gender" || n === "sex") return "gender";
  if (n.includes("blood")) return "blood_group";
  return null;
}

function canonicalValueForField(
  student: StudentFieldSource,
  label: string
): string | null {
  const key = canonicalKeyForLabel(label);
  if (!key) return null;
  const raw = student[key];
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw);
}

export function isPhotoExcelField(field: { label: string; key?: string }): boolean {
  if (field.key === "photo_id") return true;
  const n = field.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return n.includes("photo") && !n.includes("url");
}

export function studentFieldDisplay(
  student: StudentFieldSource,
  key: string,
  fieldLabel?: string
): string {
  const extra = parseExtraFields(student.extra_fields);
  const labels =
    student.field_labels && typeof student.field_labels === "object"
      ? student.field_labels
      : {};

  if (isExcelColumnKey(key)) {
    const direct = extra[key] ?? null;
    if (direct != null && String(direct).trim() !== "") {
      return displayValue(direct);
    }
    const label = fieldLabel?.trim() || labels[key];
    if (label) {
      return displayValue(canonicalValueForField(student, label));
    }
    return displayValue(null);
  }

  if (extra[key] != null && String(extra[key]).trim() !== "") {
    return displayValue(extra[key]);
  }

  switch (key) {

    case "photo_id":

      return displayValue(student.photo_id);

    case "class_section":

      return displayValue(student.class_section);

    case "student_name":

      return displayValue(student.student_name);

    case "parent_name":

      return displayValue(student.parent_name);

    case "parent_phone":

      return displayValue(student.parent_phone);

    case "address":

      return displayValue(student.address);

    case "roll_no":

      return displayValue(student.roll_no);

    case "dob":

      return displayValue(student.dob);

    case "gender":

      return displayValue(student.gender);

    case "blood_group":

      return displayValue(student.blood_group);

    case "custom_1":

      return displayValue(student.custom_1);

    case "custom_2":

      return displayValue(student.custom_2);

    case "custom_3":

      return displayValue(student.custom_3);

    default:

      return "—";

  }

}


