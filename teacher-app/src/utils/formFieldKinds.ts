import type { FormFieldConfig } from "../constants/formFields";

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type ResolvedFieldKind =
  | "student_name"
  | "class_section"
  | "roll_no"
  | "dob"
  | "gender"
  | "blood_group"
  | "parent_name"
  | "parent_phone"
  | "address"
  | "custom_1"
  | "custom_2"
  | "custom_3"
  | "photo"
  | "generic";

/** Label-only kind — used to pre-fill dynamic Excel columns (fld_*). */
export function resolveFieldLabelKind(field: FormFieldConfig): ResolvedFieldKind {
  const key = field.key;
  const n = normalizeLabel(field.label);
  if (key === "photo_id" || (n.includes("photo") && !n.includes("url"))) return "photo";
  if (key === "student_name" || n === "name" || n.includes("studentname") || n.includes("membername")) {
    return "student_name";
  }
  if (
    key === "class_section" ||
    n === "class" ||
    n.includes("classsection") ||
    (n.includes("section") && !n.includes("classsection")) ||
    n.includes("grade") ||
    n.includes("batch")
  ) {
    return "class_section";
  }
  if (key === "roll_no" || n.includes("roll") || n.includes("admission") || n.includes("pen")) {
    return "roll_no";
  }
  if (key === "dob" || n.includes("dob") || n.includes("dateofbirth") || n.includes("birthdate")) {
    return "dob";
  }
  if (key === "gender" || n === "gender" || n === "sex") return "gender";
  if (key === "blood_group" || n.includes("blood")) return "blood_group";
  if (
    key === "parent_name" ||
    (n.includes("parent") && !/phone|mobile|whatsapp|contact/.test(n)) ||
    n.includes("father") ||
    n.includes("mother") ||
    n.includes("guardian")
  ) {
    return "parent_name";
  }
  if (key === "parent_phone" || n.includes("phone") || n.includes("mobile") || n.includes("whatsapp")) {
    return "parent_phone";
  }
  if (key === "address" || n.includes("address") || n.includes("locality")) return "address";
  if (key === "custom_1") return "custom_1";
  if (key === "custom_2") return "custom_2";
  if (key === "custom_3") return "custom_3";
  return "generic";
}

export function resolveFieldKind(field: FormFieldConfig): ResolvedFieldKind {
  const key = field.key;
  if (/^fld_\d+$/.test(key) || key.startsWith("dyn_")) {
    return resolveFieldLabelKind(field) === "photo" ? "photo" : "generic";
  }
  const n = normalizeLabel(field.label);

  if (key === "photo_id" || (n.includes("photo") && !n.includes("url"))) return "photo";
  if (key === "student_name" || n === "name" || n.includes("studentname") || n.includes("membername")) {
    return "student_name";
  }
  if (
    key === "class_section" ||
    n === "class" ||
    n.includes("classsection") ||
    n.includes("section") ||
    n.includes("grade") ||
    n.includes("batch")
  ) {
    return "class_section";
  }
  if (key === "roll_no" || n.includes("roll") || n.includes("admission") || n.includes("pen")) {
    return "roll_no";
  }
  if (key === "dob" || n.includes("dob") || n.includes("dateofbirth") || n.includes("birthdate")) {
    return "dob";
  }
  if (key === "gender" || n === "gender" || n === "sex") return "gender";
  if (key === "blood_group" || n.includes("blood")) return "blood_group";
  if (
    key === "parent_name" ||
    (n.includes("parent") && !/phone|mobile|whatsapp|contact/.test(n)) ||
    n.includes("father") ||
    n.includes("mother") ||
    n.includes("guardian")
  ) {
    return "parent_name";
  }
  if (key === "parent_phone" || n.includes("phone") || n.includes("mobile") || n.includes("whatsapp")) {
    return "parent_phone";
  }
  if (key === "address" || n.includes("address") || n.includes("locality")) return "address";
  if (key === "custom_1") return "custom_1";
  if (key === "custom_2") return "custom_2";
  if (key === "custom_3") return "custom_3";
  return "generic";
}
