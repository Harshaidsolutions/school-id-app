import type { FormFieldConfig } from "../constants/formFields";
import { sortFormFields } from "../constants/formFields";
import type { TeacherStudent } from "../types";
import { resolveFieldKind, resolveFieldLabelKind } from "./formFieldKinds";
import { isIdentityAliasLabel } from "./identityFields";
import { studentFieldValueForForm } from "./studentFields";

function isNameLabel(label: string): boolean {
  const n = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    n === "name" ||
    n.includes("studentname") ||
    n.includes("membername") ||
    n.includes("fullname")
  );
}

function resolveStudentName(formFields: FormFieldConfig[], state: StudentFormState): string {
  const fromParts = [state.firstName.trim(), state.lastName.trim()].filter(Boolean).join(" ");
  if (fromParts) return fromParts;
  for (const field of sortFormFields(formFields)) {
    if (!field.enabled) continue;
    if (resolveFieldKind(field) === "student_name") {
      return fromParts;
    }
    if (resolveFieldKind(field) === "generic" && isNameLabel(field.label)) {
      return state.extraValues[field.key]?.trim() ?? "";
    }
  }
  return "";
}

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

export type StudentFormState = {
  firstName: string;
  lastName: string;
  classSection: string;
  rollNo: string;
  dob: string;
  gender: string;
  bloodGroup: string;
  parentName: string;
  parentPhone: string;
  address: string;
  custom1: string;
  custom2: string;
  custom3: string;
  extraValues: Record<string, string>;
};

export function initialExtraValuesFromStudent(
  student: TeacherStudent,
  formFields: FormFieldConfig[]
): Record<string, string> {
  const merged = {
    ...parseExtraFields(student.extra_fields),
    ...parseExtraFields(student.dynamic_fields),
  };
  const out: Record<string, string> = {};
  for (const field of sortFormFields(formFields)) {
    if (!field.enabled) continue;
    if (resolveFieldKind(field) === "photo" && !isIdentityAliasLabel(field.label)) continue;
    if (/^fld_\d+$/.test(field.key) || field.key.startsWith("dyn_")) {
      const v = studentFieldValueForForm(student, field, student.class_section ?? undefined);
      if (v.trim()) out[field.key] = v.trim();
      continue;
    }
    const direct = merged[field.key];
    if (direct != null && String(direct).trim()) {
      out[field.key] = String(direct).trim();
    }
  }
  return out;
}

/** Build teacher create/update payload from dynamic form state. */
export function buildTeacherStudentPayload(
  formFields: FormFieldConfig[],
  state: StudentFormState
): Record<string, unknown> {
  const extraFields: Record<string, string | null> = { ...state.extraValues };
  let studentName = resolveStudentName(formFields, state);

  for (const field of sortFormFields(formFields)) {
    if (!field.enabled) continue;
    const kind = resolveFieldKind(field);
    if (kind === "photo") {
      if (isIdentityAliasLabel(field.label)) {
        const value = state.extraValues[field.key]?.trim() ?? "";
        extraFields[field.key] = value || null;
      }
      continue;
    }

    if (kind === "generic") {
      const value = state.extraValues[field.key]?.trim() ?? "";
      extraFields[field.key] = value || null;
      continue;
    }

    if (kind === "student_name" && !studentName) {
      const v = state.extraValues[field.key]?.trim();
      if (v) studentName = v;
    }
  }

  let classSection = state.classSection.trim();
  if (!classSection) {
    for (const field of sortFormFields(formFields)) {
      if (!field.enabled) continue;
      if (resolveFieldLabelKind(field) === "class_section") {
        const v = state.extraValues[field.key]?.trim();
        if (v) {
          classSection = v;
          break;
        }
      }
    }
  }

  const payload: Record<string, unknown> = {
    student_name: studentName,
    class_section: classSection,
    roll_no: state.rollNo.trim() || null,
    dob: state.dob.trim() || null,
    gender: state.gender.trim() || null,
    blood_group: state.bloodGroup.trim() || null,
    parent_name: state.parentName.trim() || null,
    parent_phone: state.parentPhone.trim() || null,
    address: state.address.trim() || null,
    custom_1: state.custom1.trim() || null,
    custom_2: state.custom2.trim() || null,
    custom_3: state.custom3.trim() || null,
    extra_fields: extraFields,
  };

  for (const field of sortFormFields(formFields)) {
    if (!field.enabled) continue;
    const kind = resolveFieldKind(field);
    if (kind === "generic" || kind === "photo") continue;
    const key = field.key;
    if (/^fld_\d+$/.test(key) || key.startsWith("dyn_")) continue;

    switch (kind) {
      case "student_name": {
        const name = [state.firstName.trim(), state.lastName.trim()].filter(Boolean).join(" ");
        if (name) extraFields[key] = name;
        break;
      }
      case "class_section":
        if (state.classSection.trim()) extraFields[key] = state.classSection.trim();
        break;
      case "roll_no":
        if (state.rollNo.trim()) extraFields[key] = state.rollNo.trim();
        break;
      case "dob":
        if (state.dob.trim()) extraFields[key] = state.dob.trim();
        break;
      case "gender":
        if (state.gender.trim()) extraFields[key] = state.gender.trim();
        break;
      case "blood_group":
        if (state.bloodGroup.trim()) extraFields[key] = state.bloodGroup.trim();
        break;
      case "parent_name":
        if (state.parentName.trim()) extraFields[key] = state.parentName.trim();
        break;
      case "parent_phone":
        if (state.parentPhone.trim()) extraFields[key] = state.parentPhone.trim();
        break;
      case "address":
        if (state.address.trim()) extraFields[key] = state.address.trim();
        break;
      case "custom_1":
        if (state.custom1.trim()) extraFields[key] = state.custom1.trim();
        break;
      case "custom_2":
        if (state.custom2.trim()) extraFields[key] = state.custom2.trim();
        break;
      case "custom_3":
        if (state.custom3.trim()) extraFields[key] = state.custom3.trim();
        break;
      default:
        break;
    }
  }

  let identityPhoto: string | null = null;
  for (const field of sortFormFields(formFields)) {
    if (!field.enabled || !isIdentityAliasLabel(field.label)) continue;
    const value = state.extraValues[field.key]?.trim();
    if (value && !identityPhoto) identityPhoto = value;
  }
  if (identityPhoto) payload.photo_id = identityPhoto;

  payload.extra_fields = extraFields;
  return payload;
}
