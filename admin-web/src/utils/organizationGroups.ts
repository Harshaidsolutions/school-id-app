import { configuredCategoryFields, type ConfiguredCategoryField } from "./formFieldHelpers";

/** Same class / group / designation detection Schools and Institutes already use. */
export function organizationCategoryFields(
  fields: Array<{ id: string; field_name: string; field_type: string; enabled?: boolean }>
): ConfiguredCategoryField[] {
  return configuredCategoryFields(
    fields
      .filter((field) => field.enabled !== false && field.field_type === "text")
      .map((field) => ({ key: field.id, label: field.field_name, enabled: true }))
  );
}

export function isSignatureLabel(label: string): boolean {
  return /signature/i.test(label);
}

export function isPhotoNumberLabel(label: string): boolean {
  return /photo\s*(number|no\.?|id)\b/i.test(label);
}
