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

export function findClassField(fields: FormFieldConfig[]): FormFieldConfig | undefined {
  return fields.find((f) => {
    const n = normalizeLabel(f.label);
    return (
      f.key === "class_section" ||
      n === "class" ||
      n.includes("classsection") ||
      n.includes("section") ||
      n.includes("grade")
    );
  });
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
