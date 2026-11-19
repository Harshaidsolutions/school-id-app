import { configuredCategoryFields, type ConfiguredCategoryField } from "./formFieldHelpers";

/** Same class / group / designation detection Schools and Institutes already use. */
export function organizationCategoryFields(
  fields: Array<{ id: string; field_name: string; field_type: string; enabled?: boolean; is_group?: boolean }>
): ConfiguredCategoryField[] {
  // If the admin marked one field as the group field, group/filter by that field only.
  const group = fields.find((field) => field.enabled !== false && field.is_group === true);
  if (group) return [{ kind: "group", key: group.id, label: group.field_name }];
  // Otherwise fall back to detecting category-like text fields by name.
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
