import type { FormFieldConfig } from "../constants/formFields";
import { sortFormFields } from "../constants/formFields";

/** Fields configured for this org (from Excel / Form Setup), in saved order. */
export function activeFormFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  return sortFormFields(fields).filter((f) => f.enabled);
}

export function hasFormField(fields: FormFieldConfig[], key: string): boolean {
  return fields.some((f) => f.key === key && f.enabled);
}

export function formFieldLabel(
  fields: FormFieldConfig[],
  key: string,
  fallback: string
): string {
  return fields.find((f) => f.key === key)?.label ?? fallback;
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function findStudentNameField(fields: FormFieldConfig[]): FormFieldConfig | undefined {
  return fields.find((f) => {
    const n = normalizeLabel(f.label);
    return (
      f.key === "student_name" ||
      n === "name" ||
      n.includes("studentname") ||
      n.includes("fullname")
    );
  });
}

export type ConfiguredCategoryField = {
  kind: "class" | "group" | "designation";
  key: string;
  label: string;
};

/** Class, group, or designation fields that this organization actually configured. */
export function configuredCategoryFields(fields: FormFieldConfig[]): ConfiguredCategoryField[] {
  const out: ConfiguredCategoryField[] = [];
  for (const field of fields) {
    if (field.enabled === false) continue;
    const n = normalizeLabel(field.label);
    if (field.key === "signature_upload" || n.includes("signature") || n.includes("photo")) continue;
    if (n.includes("designation")) {
      out.push({ kind: "designation", key: field.key, label: field.label });
    } else if (n.includes("group")) {
      out.push({ kind: "group", key: field.key, label: field.label });
    } else if (
      field.key === "class_section" ||
      n === "class" ||
      n.includes("classsection") ||
      n.includes("section") ||
      n.includes("grade")
    ) {
      out.push({ kind: "class", key: field.key, label: field.label });
    }
  }
  return out;
}

export function wiseActionLabel(
  action: "DOWNLOAD" | "DELETE",
  label: string,
  kind?: "Photos" | "Data"
): string {
  const verb = action === "DELETE" ? "Delete" : "Download";
  const base = `${verb} ${label.trim()}-wise`;
  return kind ? `${base} ${kind}` : base;
}

export function allValuesLabel(label: string): string {
  const trimmed = label.trim();
  if (/^class$/i.test(trimmed)) return "All Classes";
  if (/^group$/i.test(trimmed)) return "All Groups";
  if (/^designation$/i.test(trimmed)) return "All Designations";
  return `All ${trimmed}`;
}

/** Class only. Section, group, and designation stay separate fields. */
export function isClassCategoryField(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  if (n.includes("designation") || n.includes("group") || n.includes("photo") || n.includes("signature")) {
    return false;
  }
  if (n.includes("section") && !n.includes("class")) return false;
  return (
    n === "class" ||
    n.includes("class") ||
    n.includes("grade") ||
    n.includes("standard") ||
    n.includes("batch") ||
    n.includes("division") ||
    (field.key === "class_section" && (n === "" || n === "classsection"))
  );
}

export function findClassField(fields: FormFieldConfig[]): FormFieldConfig | undefined {
  return fields.find((field) => isClassCategoryField(field));
}

/** The picture prompt. Photo number / photo id stays a text field. */
export function isPlainPhotoPrompt(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  const photoField =
    field.key === "photo_id" || (n.includes("photo") && !n.includes("url") && !n.includes("capture"));
  if (!photoField) return false;
  if (n.includes("id") || n.includes("number") || n.endsWith("no")) return false;
  return true;
}

export function isGenderField(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  return field.key === "gender" || n === "gender" || n === "sex";
}

export function isBloodGroupField(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  return field.key === "blood_group" || n.includes("blood");
}

export function isDobField(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  return field.key === "dob" || n.includes("dob") || n.includes("dateofbirth");
}

export function isAddressField(field: FormFieldConfig): boolean {
  const n = normalizeLabel(field.label);
  return field.key === "address" || n.includes("address");
}
