import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { SubmitGradientButton } from "./SubmitGradientButton";
import { PendingPhotoSheet } from "./PendingPhotoSheet";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { setLastClassSection } from "../navigation/captureContext";
import { DynamicStudentFieldList } from "./DynamicStudentFieldList";
import type { TeacherHomeResponse, TeacherStudent } from "../types";
import { radius, spacing } from "../theme/colors";
import type { AppColors } from "../theme/palettes";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { getAssignedClassSection } from "../utils/teacherScope";
import { sortClassSections } from "../utils/classSort";
import {
  pickStudentPhotoForFormUpload,
  type PhotoSource,
} from "../utils/studentPhotoPicker";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useFormConfig } from "../hooks/useFormConfig";
import { buildTeacherStudentPayload } from "../utils/studentFieldForm";
import { resolveFieldLabelKind } from "../utils/formFieldKinds";

type Props = {
  classSection?: string;
  onSuccess: (student: TeacherStudent) => void;
  showHeading?: boolean;
  showPhotoCapture?: boolean;
  instituteMode?: boolean;
  onInputFocus?: (nativeTarget: number) => void;
};

export function AddStudentForm({
  classSection: initialClass,
  onSuccess,
  showHeading = true,
  showPhotoCapture = false,
  instituteMode = false,
  onInputFocus,
}: Props) {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { scale, hp } = useResponsiveLayout();
  const photoSize = scale(140);
  const pickerMaxHeight = hp(38);
  const { fields: formFields } = useFormConfig();
  const defaultClass =
    initialClass ?? getAssignedClassSection(user) ?? "";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classSection, setClassSection] = useState(defaultClass);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [rollNo, setRollNo] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [address, setAddress] = useState("");
  const [custom1, setCustom1] = useState("");
  const [custom2, setCustom2] = useState("");
  const [custom3, setCustom3] = useState("");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    const preset = initialClass?.trim();
    if (!preset) return;
    setClassSection(preset);
    setExtraValues((prev) => {
      const next = { ...prev };
      for (const field of formFields) {
        if (resolveFieldLabelKind(field) === "class_section") {
          next[field.key] = preset;
        }
      }
      return next;
    });
  }, [initialClass, formFields]);

  const loadClasses = useCallback(async () => {
    try {
      const { data } = await api.get<TeacherHomeResponse>("/teacher/home");
      const sections = sortClassSections(
        data.classes ?? [],
        (c) => c.class_section,
        "asc"
      ).map((c) => c.class_section);
      setClassOptions(sections);
      const preset = initialClass?.trim();
      if (preset) {
        setClassSection(preset);
      } else {
        setClassSection((prev) => prev || sections[0] || "");
      }
    } catch {
      /* keep current value */
    }
  }, [initialClass]);

  useFocusEffect(
    useCallback(() => {
      if (!instituteMode) {
        void loadClasses();
      }
    }, [instituteMode, loadClasses])
  );

  const studentName = useMemo(
    () => [firstName.trim(), lastName.trim()].filter(Boolean).join(" "),
    [firstName, lastName]
  );

  async function handlePhotoPick(source: PhotoSource) {
    setPhotoBusy(true);
    try {
      const uri = await pickStudentPhotoForFormUpload(source);
      if (uri) setPhotoUri(uri);
    } finally {
      setPhotoBusy(false);
      setPhotoSheetOpen(false);
    }
  }

  async function handleSubmit() {
    const effectiveClass = instituteMode
      ? classSection.trim() || "ALL"
      : classSection;
    const payload = buildTeacherStudentPayload(formFields, {
      firstName,
      lastName,
      classSection: effectiveClass,
      rollNo,
      dob,
      gender,
      bloodGroup,
      parentName,
      parentPhone,
      address,
      custom1,
      custom2,
      custom3,
      extraValues,
    });

    if (!String(payload.student_name ?? "").trim()) {
      setError("Name is required.");
      return;
    }
    if (!instituteMode && !classSection.trim()) {
      setError("Class / Section is required.");
      return;
    }
    const phone = String(payload.parent_phone ?? parentPhone).trim();
    if (phone && !/^\d+$/.test(phone)) {
      setError("Parent phone must be numeric.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post<{ student: TeacherStudent }>(
        "/teacher/students",
        payload
      );

      if (photoUri) {
        const formData = new FormData();
        formData.append("photo", {
          uri: photoUri,
          name: `${data.student.id}.jpg`,
          type: "image/jpeg",
        } as unknown as Blob);
        await api.post(`/teacher/students/${data.student.id}/photo`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          transformRequest: (body) => body,
        });
      }

      setLastClassSection(classSection.trim());
      onSuccess(data.student);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create student."));
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = [
    styles.input,
    {
      borderColor: colors.border,
      color: colors.text,
      backgroundColor: colors.inputBg,
    },
  ];

  return (
    <View>
      {showHeading ? (
        <>
          <Text style={[styles.heading, { color: colors.text }]}>
            {instituteMode ? "Add Member" : "Add Student"}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {instituteMode
              ? "Enter member details below."
              : "Enter student details below."}
          </Text>
        </>
      ) : null}

      {showPhotoCapture ? (
        <View style={styles.photoSection}>
          <Text style={[styles.label, { color: colors.text }]}>Student Photo</Text>
          <Pressable
            style={[
              styles.photoArea,
              {
                width: photoSize,
                height: photoSize,
                borderColor: colors.border,
                backgroundColor: colors.inputBg,
              },
            ]}
            onPress={() => setPhotoSheetOpen(true)}
            disabled={photoBusy || saving}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={32} color={colors.textMuted} />
                <Text style={[styles.photoHint, { color: colors.textMuted }]}>
                  Tap to capture or choose photo
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      ) : null}

      <DynamicStudentFieldList
        formFields={formFields}
        colors={colors}
        inputStyle={inputStyle}
        firstName={firstName}
        lastName={lastName}
        onFirstNameChange={setFirstName}
        onLastNameChange={setLastName}
        classSection={classSection}
        onClassSectionChange={setClassSection}
        onClassSectionPress={() => setClassPickerOpen(true)}
        classInputMode="picker"
        hideClassField={instituteMode}
        lockedClassSection={
          !instituteMode && initialClass?.trim() ? initialClass.trim() : undefined
        }
        rollNo={rollNo}
        onRollNoChange={setRollNo}
        dob={dob}
        onDobChange={setDob}
        gender={gender}
        onGenderChange={setGender}
        bloodGroup={bloodGroup}
        onBloodGroupChange={setBloodGroup}
        parentName={parentName}
        onParentNameChange={setParentName}
        parentPhone={parentPhone}
        onParentPhoneChange={setParentPhone}
        address={address}
        onAddressChange={setAddress}
        custom1={custom1}
        onCustom1Change={setCustom1}
        custom2={custom2}
        onCustom2Change={setCustom2}
        custom3={custom3}
        onCustom3Change={setCustom3}
        extraValues={extraValues}
        onExtraChange={(key, value) =>
          setExtraValues((prev) => ({ ...prev, [key]: value }))
        }
        nameRequired
        classRequired={!instituteMode}
        onInputFocus={onInputFocus}
      />

      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
      ) : null}

      <SubmitGradientButton
        label={instituteMode ? "Add Member" : "Add Student"}
        icon={undefined}
        onPress={() => void handleSubmit()}
        disabled={saving}
        loading={saving}
        style={{ marginTop: spacing.xs }}
      />

      <Modal visible={classPickerOpen} transparent animationType="fade">
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setClassPickerOpen(false)}
        >
          <View
            style={[styles.pickerCard, { backgroundColor: colors.surface }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.pickerTitle, { color: colors.text }]}>
              Select Class / Section
            </Text>
            {classOptions.length === 0 ? (
              <Text style={[styles.pickerEmpty, { color: colors.textMuted }]}>
                No classes found for this school.
              </Text>
            ) : (
              <FlatList
                data={classOptions}
                keyExtractor={(item) => item}
                style={[styles.pickerList, { maxHeight: pickerMaxHeight }]}
                renderItem={({ item }) => {
                  const selected = item === classSection;
                  return (
                    <Pressable
                      style={[
                        styles.pickerRow,
                        {
                          backgroundColor: selected
                            ? colors.orangeSoft
                            : colors.surface,
                          borderColor: colors.border,
                        },
                      ]}
                      onPress={() => {
                        setClassSection(item);
                        setClassPickerOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerRowText,
                          {
                            color: selected
                              ? colors.primaryOrange
                              : colors.text,
                          },
                        ]}
                        numberOfLines={1}
                      >
                        {item}
                      </Text>
                      {selected ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.primaryOrange}
                        />
                      ) : null}
                    </Pressable>
                  );
                }}
              />
            )}
            <Pressable
              style={[styles.pickerClose, { backgroundColor: colors.graySoft }]}
              onPress={() => setClassPickerOpen(false)}
            >
              <Text style={[styles.pickerCloseText, { color: colors.text }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <PendingPhotoSheet
        visible={photoSheetOpen}
        studentName={studentName || "New student"}
        colors={colors}
        onClose={() => {
          if (photoBusy) return;
          setPhotoSheetOpen(false);
        }}
        onPick={(source) => void handlePhotoPick(source)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: typeScale.screenTitle,
    fontFamily: fonts.bold,
  },
  sub: {
    marginTop: spacing.xxs + 2,
    marginBottom: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
    lineHeight: typeScale.rowTitle * 0.95,
  },
  field: { marginBottom: spacing.sm + 2 },
  photoSection: { marginBottom: spacing.md },
  photoArea: {
    alignSelf: "center",
    borderWidth: 1.5,
    borderRadius: radius.md,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photoPreview: {
    width: "100%",
    height: "100%",
  },
  photoPlaceholder: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  photoHint: {
    fontFamily: fonts.regular,
    fontSize: typeScale.xs,
    textAlign: "center",
  },
  label: {
    marginBottom: spacing.xxs + 2,
    fontSize: typeScale.rowTitle,
    fontFamily: fonts.semiBold,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 1 : spacing.sm - 2,
    fontSize: typeScale.rowTitle,
    fontFamily: fonts.regular,
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
  },
  inputMultiline: { minHeight: spacing.avatarMd - 8, textAlignVertical: "top" },
  error: {
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
    marginBottom: spacing.sm - 2,
  },
  ctaWrap: { marginTop: spacing.xs, borderRadius: radius.lg, overflow: "hidden" },
  cta: {
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing.buttonHeight - 2,
  },
  ctaText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
  },
  disabled: { opacity: 0.65 },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    justifyContent: "flex-end",
  },
  pickerCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.md,
    maxHeight: "70%",
  },
  pickerTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  pickerEmpty: {
    textAlign: "center",
    paddingVertical: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
  },
  pickerList: {},
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.xs,
  },
  pickerRowText: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
  },
  pickerClose: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  pickerCloseText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.body,
  },
});
