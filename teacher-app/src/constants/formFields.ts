export interface FormFieldConfig {
  key: string;
  label: string;
  enabled: boolean;
  colIndex?: number;
  displayOrder?: number;
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
  { key: "custom_1", label: "Custom 1", enabled: false },
  { key: "custom_2", label: "Custom 2", enabled: false },
  { key: "custom_3", label: "Custom 3", enabled: false },
];

export function fieldLabel(
  fields: FormFieldConfig[],
  key: string,
  fallback: string
): string {
  return fields.find((f) => f.key === key)?.label ?? fallback;
}

export function isFieldEnabled(fields: FormFieldConfig[], key: string): boolean {
  const hit = fields.find((f) => f.key === key);
  return hit ? hit.enabled : false;
}
