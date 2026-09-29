import type { FormFieldConfig } from "../constants/formFields";

export function isFieldVisible(
  key: string,
  visibility: Record<string, boolean> | undefined
): boolean {
  if (!visibility) return true;
  return visibility[key] !== false;
}

export function applyFieldVisibility(
  fields: FormFieldConfig[],
  visibility: Record<string, boolean> | undefined
): FormFieldConfig[] {
  return fields.filter((field) => isFieldVisible(field.key, visibility));
}
