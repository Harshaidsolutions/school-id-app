import { Pressable } from "./Pressable";
import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable as RNPressable, Text, TextInput, View } from "react-native";
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
import { InlineDropdown } from "./InlineDropdown";

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

function ImageFieldPicker({
  uri,
  busy,
  colors,
  onPick,
}: {
  uri: string;
  busy: boolean;
  colors: AppColors;
  onPick: () => void;
}) {
  const hasImage = Boolean(uri);
  return (
    <RNPressable
      onPress={onPick}
      disabled={busy}
      style={{
        minHeight: 110,
        borderRadius: 14,
        borderWidth: 1.5,
        borderStyle: hasImage ? "solid" : "dashed",
        borderColor: colors.border,
        backgroundColor: colors.inputBg ?? "#F6F7FC",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        padding: 10,
      }}
    >
      {busy ? (
        <ActivityIndicator color={colors.primaryOrange} />
      ) : hasImage ? (
        <View style={{ alignItems: "center", gap: 8 }}>
          <Image source={{ uri }} style={{ width: 120, height: 120, borderRadius: 10 }} resizeMode="cover" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="camera-outline" size={16} color={colors.primaryOrange} />
            <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.primaryOrange }}>Change image</Text>
          </View>
        </View>
      ) : (
        <View style={{ alignItems: "center", gap: 6 }}>
          <Ionicons name="cloud-upload-outline" size={30} color={colors.primaryOrange} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>Upload or capture image</Text>
          <Text style={{ fontSize: 11.5, color: colors.textMuted }}>Tap to choose camera or gallery</Text>
        </View>
      )}
    </RNPressable>
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
  /** When number editing is off, do not show the number field at all. */
  hideNumberField?: boolean;
  photoId?: string;
  studentName?: string;
  onInputFocus?: (nativeTarget: number) => void;
  /** Current image URL (or local uri) for each "Image/Photo"-typed field, by key. */
  fieldImages?: Record<string, string>;
  /** Called when the user taps an image field to capture/upload a picture. */
  onFieldImagePick?: (key: string) => void;
  /** Key of the image field currently uploading (shows a spinner). */
  fieldImageBusyKey?: string | null;
};

const SINGLETON_KINDS = new Set([
  "student_name",
  "class_section",
  "roll_no",
  "dob",
  "gender",
  "blood_group",
  "parent_phone",
  "address",
  "custom_1",
  "custom_2",
  "custom_3",
  "photo",
]);

function normalizedLabel(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function effectiveKind(field: FormFieldConfig) {
  if (/^fld_\d+$/.test(field.key) || field.key.startsWith("dyn_")) {
    const byLabel = resolveFieldLabelKind(field);
    if (byLabel !== "generic") return byLabel;
  }
  return resolveFieldKind(field);
}

function shownLabel(field: FormFieldConfig): string {
  return field.label;
}

/** One control per configured field. Excel and default copies of the same field collapse. */
function dedupeFormFields(fields: FormFieldConfig[]): FormFieldConfig[] {
  const seenKeys = new Set<string>();
  const seenLabels = new Set<string>();
  const seenKinds = new Set<string>();
  const out: FormFieldConfig[] = [];
  for (const field of sortFormFields(fields).filter((item) => item.enabled)) {
    if (seenKeys.has(field.key)) continue;
    const label = normalizedLabel(field.label);
    if (label && seenLabels.has(label)) continue;
    const kind = effectiveKind(field);
    if (SINGLETON_KINDS.has(kind)) {
      if (seenKinds.has(kind)) continue;
      seenKinds.add(kind);
    }
    seenKeys.add(field.key);
    if (label) seenLabels.add(label);
    out.push(field);
  }
  return out;
}

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
  hideNumberField = false,
  photoId = "",
  studentName = "",
  onInputFocus,
  fieldImages = {},
  onFieldImagePick,
  fieldImageBusyKey = null,
}: DynamicStudentFieldListProps) {
  const focus = focusProps(onInputFocus);
  const ordered = dedupeFormFields(formFields);
  const configuredIdentityLabel =
    ordered.find((field) => field.key === "photo_id" || isIdentityAliasLabel(field.label))?.label ||
    "Photo Number";
  const configuredNameLabel =
    ordered.find((field) => effectiveKind(field) === "student_name")?.label || "Name";
  const primaryParentKey = ordered.find((field) => effectiveKind(field) === "parent_name")?.key;
  const identityFields = ordered.filter((field) => isIdentityAliasLabel(field.label));
  const lockedIdentity = lockIdentityFields ? visibleLockedIdentity(identityFields, extraValues, photoId) : [];

  return (
    <>
      {lockIdentityFields && !hideNumberField ? (
        <>
          {lockedIdentity.length > 0 ? (
            lockedIdentity.map((field) => (
              <Field key={field.key} label={shownLabel(field)} colors={colors}>
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
            <Field label={configuredIdentityLabel} colors={colors}>
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
        </>
      ) : null}
      {lockIdentityFields ? (
        <Field label={configuredNameLabel} colors={colors} required>
          <TextInput
            style={inputStyle}
            value={[firstName, lastName].filter(Boolean).join(" ") || studentName}
            onChangeText={(value) => {
              onFirstNameChange(value);
              onLastNameChange("");
            }}
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="words"
            {...focus}
          />
        </Field>
      ) : null}
      {ordered.map((field) => {
        const kind = effectiveKind(field);
        const labelKind = resolveFieldLabelKind(field);
        const label = shownLabel(field);
        // Image field ONLY when the admin explicitly set this field to Image/Photo
        // in Form Setup. A field merely NAMED "photo" (e.g. the Excel photo-number
        // column) stays Text/Data and must not become an image box (rule: the
        // configured type wins over the field name).
        if (
          field.fieldType === "photo" &&
          field.key !== "photo_id" &&
          field.key !== "signature_upload" &&
          !isIdentityAliasLabel(field.label)
        ) {
          return (
            <Field key={field.key} label={label} colors={colors} required={field.required !== false}>
              <ImageFieldPicker
                uri={fieldImages[field.key] || ""}
                busy={fieldImageBusyKey === field.key}
                colors={colors}
                onPick={() => onFieldImagePick?.(field.key)}
              />
            </Field>
          );
        }
        // A field that only looks like a photo column (label "PHOTO") but is NOT an
        // image type duplicates the locked Photo Number, so keep it hidden.
        if (
          (kind === "photo" || labelKind === "photo") &&
          field.key !== "photo_id" &&
          !isIdentityAliasLabel(field.label)
        ) {
          return null;
        }
        if (lockIdentityFields && isIdentityAliasLabel(field.label)) {
          return null;
        }

        if (
          field.fieldType === "dropdown" &&
          (field.options?.length ?? 0) > 0 &&
          kind !== "student_name" &&
          kind !== "class_section"
        ) {
          const current = extraValues[field.key] ?? "";
          return (
            <Field key={field.key} label={label} colors={colors}>
              <InlineDropdown
                value={current}
                options={field.options ?? []}
                onChange={(next) => onExtraChange?.(field.key, next)}
                colors={colors}
              />
            </Field>
          );
        }

        if (kind === "student_name") {
          if (lockIdentityFields) return null;
          // One "Name" field that follows the configured label (single NAME column),
          // instead of separate First/Last inputs.
          return (
            <Field key={field.key} label={label} colors={colors} required={field.required !== false}>
              <TextInput
                style={inputStyle}
                value={[firstName, lastName].filter(Boolean).join(" ")}
                onChangeText={(value) => {
                  onFirstNameChange(value);
                  onLastNameChange("");
                }}
                placeholderTextColor={colors.textSubtle}
                autoCapitalize="words"
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "class_section" || labelKind === "class_section") {
          if (hideClassField) return null;
          const locked = lockedClassSection?.trim();
          if (locked) {
            return (
              <Field key={field.key} label={label} colors={colors} required={field.required !== false}>
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
              <Field key={field.key} label={label} colors={colors} required={field.required !== false}>
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
            <Field key={field.key} label={label} colors={colors} required={field.required !== false}>
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
            <Field key={field.key} label={label} colors={colors}>
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
              label={label}
              colors={colors}
              inputStyle={inputStyle}
              value={dob}
              onChange={onDobChange}
            />
          );
        }

        if (kind === "gender") {
          if (field.fieldType === "dropdown") {
            return (
              <StudentGenderField
                key={field.key}
                label={label}
                colors={colors}
                inputStyle={inputStyle}
                value={gender}
                onChange={onGenderChange}
              />
            );
          }
          return (
            <Field key={field.key} label={label} colors={colors}>
              <TextInput style={inputStyle} value={gender} onChangeText={onGenderChange} placeholderTextColor={colors.textSubtle} {...focus} />
            </Field>
          );
        }

        if (kind === "blood_group") {
          if (field.fieldType === "dropdown") {
            return (
              <StudentBloodGroupField
                key={field.key}
                label={label}
                colors={colors}
                inputStyle={inputStyle}
                value={bloodGroup}
                onChange={onBloodGroupChange}
              />
            );
          }
          return (
            <Field key={field.key} label={label} colors={colors}>
              <TextInput style={inputStyle} value={bloodGroup} onChangeText={onBloodGroupChange} placeholderTextColor={colors.textSubtle} {...focus} />
            </Field>
          );
        }

        if (kind === "parent_name") {
          const primary = field.key === primaryParentKey;
          return (
            <Field key={field.key} label={label} colors={colors}>
              <TextInput
                style={inputStyle}
                value={primary ? parentName : (extraValues[field.key] ?? "")}
                onChangeText={
                  primary
                    ? onParentNameChange
                    : (value) => onExtraChange?.(field.key, value)
                }
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
              label={label}
              colors={colors}
              required={parentPhoneTenDigits}
            >
              <TextInput
                style={inputStyle}
                value={parentPhone}
                onChangeText={(text) => {
                  // Digits only; if a country code / +91 is included, keep the last 10.
                  const d = text.replace(/\D/g, "");
                  onParentPhoneChange(d.length > 10 ? d.slice(-10) : d);
                }}
                keyboardType="phone-pad"
                maxLength={13}
                placeholderTextColor={colors.textSubtle}
                {...focus}
              />
            </Field>
          );
        }

        if (kind === "address") {
          return (
            <Field key={field.key} label={label} colors={colors}>
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
            <Field key={field.key} label={label} colors={colors}>
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
            <Field key={field.key} label={label} colors={colors}>
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
            <Field key={field.key} label={label} colors={colors}>
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
          <Field key={field.key} label={label} colors={colors}>
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
