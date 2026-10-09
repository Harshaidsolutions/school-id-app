import { Pressable } from "../components/Pressable";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useToast } from "../components/Toast";
import api, { getErrorMessage } from "../api/client";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import type { RootStackParamList } from "../navigation/types";
import { radius, spacing } from "../theme/colors";
import type { AppColors } from "../theme/palettes";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { returnToClassList } from "../navigation/returnToClass";
import { DynamicStudentFieldList } from "../components/DynamicStudentFieldList";
import { useFormConfig } from "../hooks/useFormConfig";
import {
  buildTeacherStudentPayload,
  initialExtraValuesFromStudent,
} from "../utils/studentFieldForm";

type Props = NativeStackScreenProps<RootStackParamList, "AddDetails">;

function splitName(full: string | null | undefined): {
  first: string;
  last: string;
} {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/**
 * Screen 7 — Add Details
 * Photo thumbnail + First Name, Last Name, Class/Section,
 * Parent Name, Parent Phone, Address — Cancel / Save
 */
export function AddDetailsScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { scale } = useResponsiveLayout();
  const photoSize = scale(120);
  const { showToast } = useToast();
  const { fields: formFields } = useFormConfig();
  const displayFields = formFields.filter((field) => field.enabled !== false);
  const { student, photoUri } = route.params;
  const initial = useMemo(
    () => splitName(student.student_name),
    [student.student_name]
  );

  const [firstName, setFirstName] = useState(initial.first);
  const [lastName, setLastName] = useState(initial.last);
  const [classSection, setClassSection] = useState(
    student.class_section ?? ""
  );
  const [parentName, setParentName] = useState(student.parent_name ?? "");
  const [parentPhone, setParentPhone] = useState(student.parent_phone ?? "");
  const [address, setAddress] = useState(student.address ?? "");
  const [rollNo, setRollNo] = useState(student.roll_no ?? "");
  const [dob, setDob] = useState(student.dob ?? "");
  const [gender, setGender] = useState(student.gender ?? "");
  const [bloodGroup, setBloodGroup] = useState(student.blood_group ?? "");
  const [custom1, setCustom1] = useState(student.custom_1 ?? "");
  const [custom2, setCustom2] = useState(student.custom_2 ?? "");
  const [custom3, setCustom3] = useState(student.custom_3 ?? "");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (formFields.length > 0) {
      setExtraValues(initialExtraValuesFromStudent(student, formFields));
    }
  }, [student, formFields]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const payload = buildTeacherStudentPayload(formFields, {
      firstName,
      lastName,
      classSection,
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

    const student_name = String(payload.student_name ?? "").trim();
    if (!student_name) {
      setError("First name is required.");
      return;
    }
    if (!classSection.trim()) {
      setError("Class / Section is required.");
      return;
    }
    const phone = String(payload.parent_phone ?? parentPhone).trim();
    if (phone && !/^\d+$/.test(phone)) {
      setError("Parent phone number must be numeric.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("photo", {
        uri: photoUri,
        name: `${student.id}.jpg`,
        type: "image/jpeg",
      } as unknown as Blob);

      await api.post(`/teacher/students/${student.id}/photo`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        transformRequest: (data) => data,
      });

      await api.put(`/teacher/students/${student.id}`, payload);

      showToast("Submitted successfully.");
      returnToClassList(
        navigation,
        classSection.trim() || student.class_section
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save student details."));
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["bottom"]}
    >
      <OrangeGradientHeader
        title="Add Details"
        variant="green"
        onBack={() => navigation.goBack()}
      />
      <KeyboardDismissView style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.photoWrap,
              {
                width: photoSize,
                height: photoSize,
                borderColor: colors.brandGreen,
                backgroundColor: colors.greenSoft,
              },
            ]}
          >
            <Image
              source={{ uri: photoUri }}
              style={styles.photo}
              resizeMode="cover"
            />
          </View>

          <DynamicStudentFieldList
            formFields={displayFields}
            colors={colors}
            inputStyle={inputStyle}
            firstName={firstName}
            lastName={lastName}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            classSection={classSection}
            onClassSectionChange={setClassSection}
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
            classRequired
          />

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              style={[
                styles.btn,
                {
                  backgroundColor: colors.surface,
                  borderWidth: 1.5,
                  borderColor: colors.brandGreen,
                },
              ]}
              onPress={() =>
                returnToClassList(
                  navigation,
                  classSection.trim() || student.class_section
                )
              }
              disabled={saving}
            >
              <Text style={[styles.btnCancelText, { color: colors.brandGreen }]}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                { backgroundColor: colors.brandGreen },
                saving && styles.btnDisabled,
              ]}
              onPress={() => void handleSave()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.btnSaveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      </KeyboardDismissView>
    </SafeAreaView>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: AppColors;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  photoWrap: {
    alignSelf: "center",
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.lg,
    borderWidth: 3,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  field: {
    marginBottom: spacing.md,
  },
  label: {
    marginBottom: spacing.xxs + 2,
    fontSize: typeScale.rowTitle,
    fontFamily: fonts.semiBold,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? spacing.sm + 1 : spacing.sm - 2,
    fontSize: typeScale.rowTitle,
    fontFamily: fonts.regular,
  },
  error: {
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
    marginBottom: spacing.sm - 2,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.cardGap,
    marginTop: spacing.xs,
  },
  btn: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing.buttonHeight - 4,
  },
  btnCancelText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.rowTitle,
  },
  btnSaveText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.rowTitle,
  },
  btnDisabled: {
    opacity: 0.65,
  },
});
