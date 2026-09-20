import type { FormFieldConfig } from "../constants/formFields";
import { isFieldKeyColumnIndex } from "./excelSchema";

export type FormFieldSource = "excel" | "manual";

export type FormFieldConfigWithSource = FormFieldConfig & {
  source?: FormFieldSource;
  colIndex?: number;
};

/** True when the field originated from an uploaded Excel column. */
export function isExcelFormField(field: FormFieldConfigWithSource): boolean {
  if (field.source === "manual") return false;
  if (field.source === "excel") return true;
  if (field.key.startsWith("dyn_")) return false;
  if (isFieldKeyColumnIndex(field.key)) return true;
  if (typeof field.colIndex === "number") return true;
  return false;
}

export function isManualFormField(field: FormFieldConfigWithSource): boolean {
  return !isExcelFormField(field);
}

export function withExcelSource(field: FormFieldConfigWithSource): FormFieldConfigWithSource {
  return { ...field, source: "excel" as const };
}

export function withManualSource(field: FormFieldConfigWithSource): FormFieldConfigWithSource {
  return { ...field, source: "manual" as const };
}

export function inferFieldSource(field: FormFieldConfigWithSource): FormFieldSource {
  return isExcelFormField(field) ? "excel" : "manual";
}
