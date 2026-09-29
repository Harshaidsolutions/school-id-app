import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FormFieldConfig } from "../constants/formFields";
import { sortFormFields } from "../constants/formFields";
import {
  StudentBloodGroupField,
  StudentDobField,
  StudentGenderField,
} from "./StudentDemographicFields";
import type { AppColors } from "../theme/palettes";
import { resolveFieldKind, resolveFieldLabelKind } from "../utils/formFieldKinds";
import { isIdentityAliasLabel } from "../utils/identityFields";
import { resetFocusedInputScrollLock } from "../utils/scrollToFocusedInput";

function Field({
  label,
  colors,
  children,
  required,
}: {
  label: string;
  colors: AppColors;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 6 }} numberOfLines={1}>
        {label}
        {required ? " *" : ""}
      </Text>
      {children}
    </View>
  );
}

function lockedIdentityValue(
  key: string,
  extraValues: Record<string, string>,
  photoId: string
): string {
  const typed = extraValues[key]?.trim();
  return typed || photoId;
}

function visibleLockedIdentity(
  fields: FormFieldConfig[],
  extraValues: Record<string, string>,
  photoId: string
): FormFieldConfig[] {
  if (fields.length <= 1) return fields;
  const values = fields
    .map((field) => lockedIdentityValue(field.key, extraValues, photoId).trim())
    .filter(Boolean);
  const unique = new Set(values.map((value) => value.toLowerCase()));
  if (unique.size > 1) return fields;
  return [fields[0]];
}

export type DynamicStudentFieldListProps = {
  formFields: FormFieldConfig[];
  colors: AppColors;
  inputStyle: object[];
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  classSection: string;
  onClassSectionChange: (value: string) => void;
  onClassSectionPress?: () => void;
  classInputMode?: "picker" | "text";
  rollNo: string;
  onRollNoChange: (value: string) => void;
  dob: string;
  onDobChange: (value: string) => void;
  gender: string;
  onGenderChange: (value: string) => void;
  bloodGroup: string;
  onBloodGroupChange: (value: string) => void;
  parentName: string;
  onParentNameChange: (value: string) => void;
  parentPhone: string;
  onParentPhoneChange: (value: string) => void;
  address: string;
  onAddressChange: (value: string) => void;
  custom1: string;
  onCustom1Change: (value: string) => void;
  custom2: string;
  onCustom2Change: (value: string) => void;
  custom3: string;
  onCustom3Change: (value: string) => void;
  extraValues?: Record<string, string>;
  onExtraChange?: (key: string, value: string) => void;
  nameRequired?: boolean;
  classRequired?: boolean;
  /** Hide class/section field (institute members). */
  hideClassField?: boolean;
  /** When set, class field is read-only with this value. */
  lockedClassSection?: string;
  /** Edit flow: show class but do not allow changes (same input styling). */
  classSectionReadOnly?: boolean;
  /** Edit flow: parent phone required, numeric, max 10 digits. */
  parentPhoneTenDigits?: boolean;
  /** Edit flow: Photo ID and student name stay visible but cannot be changed. */
  lockIdentityFields?: boolean;
  photoId?: string;
  studentName?: string;
  onInputFocus?: (nativeTarget: number) => void;
};

function focusProps(onInputFocus?: (nativeTarget: number) => void) {
  return onInputFocus
    ? {
        onFocus: (e: { nativeEvent: { target: number } }) =>
          onInputFocus(e.nativeEvent.target),
        onBlur: resetFocusedInputScrollLock,
      }
    : {};
}

export function DynamicStudentFieldList({
  formFields,
  colors,
  inputStyle,
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  classSection,
  onClassSectionChange,
  onClassSectionPress,
  classInputMode = "text",
  rollNo,
  onRollNoChange,
  dob,
  onDobChange,
  gender,
  onGenderChange,
  bloodGroup,
  onBloodGroupChange,
  parentName,
  onParentNameChange,
  parentPhone,
  onParentPhoneChange,
  address,
  onAddressChange,
  custom1,
  onCustom1Change,
  custom2,
  onCustom2Change,
  custom3,
  onCustom3Change,
  extraValues = {},
  onExtraChange,
  nameRequired = false,
  classRequired = false,
  hideClassField = false,
  lockedClassSection,
  classSectionReadOnly = false,
  parentPhoneTenDigits = false,
  lockIdentityFields = false,
  photoId = "",
  studentName = "",
  onInputFocus,
}: DynamicStudentFieldListProps) {
  const focus = focusProps(onInputFocus);
  const ordered = sortFormFields(formFields).filter((f) => f.enabled);
  const identityFields = ordered.filter((field) => isIdentityAliasLabel(field.label));
  const lockedIdentity = lockIdentityFields ? visibleLockedIdentity(identityFields, extraValues, photoId) : [];

  return (
    <>
      {lockIdentityFields ? (
        <>
          {lockedIdentity.length > 0 ? (
            lockedIdentity.map((field) => (
              <Field key={field.key} label={field.label} colors={colors}>
                <TextInput
                  style={inputStyle}
                  value={lockedIdentityValue(field.key, extraValues, photoId)}
                  editable={false}
                  showSoftInputOnFocus={false}
                  caretHidden
                  placeholderTextColor={colors.textSubtle}
                />
              </Field>
            ))
          ) : (
            <Field label={/^ADD_\d+$/i.test(photoId.trim()) ? "ID" : "Photo ID"} colors={colors}>
              <TextInput
                style={inputStyle}
                value={photoId}
                editable={false}
                showSoftInputOnFocus={false}
                caretHidden
                placeholderTextColor={colors.textSubtle}
              />
            </Field>
          )}
          <Field label="Name" colors={colors}>
            <TextInput
              style={inputStyle}
              value={studentName}
              editable={false}
              showSoftInputOnFocus={false}
              caretHidden
              placeholderTextColor={colors.textSubtle}
            />
          </Field>
        </>
      ) : null}
      {ordered.map((field) => {
        const kind = resolveFieldKind(field);
        const labelKind = resolveFieldLabelKind(field);
        if (
          (kind === "photo" || labelKind === "photo") &&
          !isIdentityAliasLabel(field.label)
        ) {
          return null;
        }
        if (lockIdentityFields && isIdentityAliasLabel(field.label)) {
          return null;
        }

        if (kind === "student_name") {
          if (lockIdentityFields) return null;
          return (
            <View key={field.key}>
              <Field label="First Name" colors={colors} required={nameRequired && !lockIdentityFields}>
                <TextInput
                  style={inputStyle}
                  value={firstName}
                  onChangeText={lockIdentityFields ? undefined : onFirstNameChange}
                  editable={!lockIdentityFields}
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="words"
                  {...(lockIdentityFields ? {} : focus)}
                />
              </Field>
              <Field label="Last Name" colors={colors}>
                <TextInput
                  style={inputStyle}
                  value={lastName}
                  onChangeText={lockIdentityFields ? undefined : onLastNameChange}
                  editable={!lockIdentityFields}
                  placeholderTextColor={colors.textSubtle}
                  autoCapitalize="words"
                  {...(lockIdentityFields ? {} : focus)}
                />
              </Field>
            </View>
          );
        }

        if (kind === "class_section" || labelKind === "class_section") {
          if (hideClassField) return null;
          const locked = lockedClassSection?.trim();
          if (locked) {
            return (
              <Field key={field.key} label={field.label} colors={colors} required={classRequired}>
                <View style={[inputStyle, { justifyContent: "center" }]}>
                  <Text style={{ color: colors.text }} numberOfLines={1}>
                    {locked}
                  </Text>
                </View>
              </Field>
            );
          }
          if (classInputMode === "picker" && onClassSectionPress) {
            return (
              <Field key={field.key} label={field.label} colors={colors} required={classRequired}>
                <Pressable
                  style={[inputStyle, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
                  onPress={onClassSectionPress}
                >
                  <Text
                    style={{ flex: 1, color: classSection ? colors.text : colors.textSubtle }}
                    numberOfLines={1}
                  >
                    {classSection || "Select class / section"}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                </Pressable>
              </Field>
            );
          }
          return (
            <Field key={field.key} label={field.label} colors={colors} required={classRequired}>
              <TextInput
                style={inputStyle}
                value={classSection}
                onChangeText={onClassSectionChange}
                placeholderTextColor={colors.textSubtle}
                placeholder='e.g. "5th A"'
                editable={!classSectionReadOnly}
                showSoftInputOnFocus={!classSectionReadOnly}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "roll_no") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={rollNo}
                onChangeText={onRollNoChange}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "dob") {
          return (
            <StudentDobField
              key={field.key}
              label={field.label}
              colors={colors}
              inputStyle={inputStyle}
              value={dob}
              onChange={onDobChange}
            />
          );
        }

        if (kind === "gender") {
          return (
            <StudentGenderField
              key={field.key}
              label={field.label}
              colors={colors}
              inputStyle={inputStyle}
              value={gender}
              onChange={onGenderChange}
            />
          );
        }

        if (kind === "blood_group") {
          return (
            <StudentBloodGroupField
              key={field.key}
              label={field.label}
              colors={colors}
              inputStyle={inputStyle}
              value={bloodGroup}
              onChange={onBloodGroupChange}
            />
          );
        }

        if (kind === "parent_name") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={parentName}
                onChangeText={onParentNameChange}
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="words"
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "parent_phone") {
          return (
            <Field
              key={field.key}
              label={field.label}
              colors={colors}
              required={parentPhoneTenDigits}
            >
              <TextInput
                style={inputStyle}
                value={parentPhone}
                onChangeText={(text) => {
                  if (parentPhoneTenDigits) {
                    onParentPhoneChange(text.replace(/\D/g, "").slice(0, 10));
                    return;
                  }
                  onParentPhoneChange(text);
                }}
                keyboardType="phone-pad"
                maxLength={parentPhoneTenDigits ? 10 : undefined}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "address") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={[inputStyle, { minHeight: 72, textAlignVertical: "top" }]}
                value={address}
                onChangeText={onAddressChange}
                placeholderTextColor={colors.textSubtle}
                multiline
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "custom_1") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={custom1}
                onChangeText={onCustom1Change}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "custom_2") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={custom2}
                onChangeText={onCustom2Change}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "custom_3") {
          return (
            <Field key={field.key} label={field.label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={custom3}
                onChangeText={onCustom3Change}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        return (
          <Field key={field.key} label={field.label} colors={colors}>
            <TextInput
              style={inputStyle}
              value={extraValues[field.key] ?? ""}
              onChangeText={(value) => onExtraChange?.(field.key, value)}
              placeholderTextColor={colors.textSubtle}
              {...focus}
            />
          </Field>
        );
      })}
    </>
  );
}
