import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFocusEffect } from "@react-navigation/native";

import {

  ActivityIndicator,

  Image,

  KeyboardAvoidingView,

  Platform,

  Pressable,

  ScrollView,

  StyleSheet,

  Text,

  TextInput,

  View,

} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Ionicons } from "@expo/vector-icons";

import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { useToast } from "../components/Toast";

import api, { getErrorMessage } from "../api/client";

import type { RootStackParamList } from "../navigation/types";

import type { TeacherStudent } from "../types";

import { radius, spacing } from "../theme/colors";

import type { AppColors } from "../theme/palettes";

import { fonts, type as typeScale } from "../theme/typography";

import { useTheme } from "../theme/ThemeContext";

import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

import { DynamicStudentFieldList } from "../components/DynamicStudentFieldList";
import { useFormConfig } from "../hooks/useFormConfig";
import {
  buildTeacherStudentPayload,
  initialExtraValuesFromStudent,
} from "../utils/studentFieldForm";
import { pickStudentPhotoFromCamera } from "../utils/studentPhotoPicker";



type Props = NativeStackScreenProps<RootStackParamList, "EditStudent">;



function splitName(full: string | null | undefined): {

  first: string;

  last: string;

} {

  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return { first: "", last: "" };

  if (parts.length === 1) return { first: parts[0], last: "" };

  return { first: parts[0], last: parts.slice(1).join(" ") };

}



export function EditStudentScreen({ navigation, route }: Props) {

  const { colors } = useTheme();
  const { showToast } = useToast();
  const { fields: formFields } = useFormConfig();

  const insets = useSafeAreaInsets();
  const { scale } = useResponsiveLayout();
  const photoSize = scale(120);

  const { student, returnToFlow } = route.params;

  const [currentStudent, setCurrentStudent] = useState(student);

  useFocusEffect(
    useCallback(() => {
      setCurrentStudent(route.params.student);
    }, [route.params.student])
  );

  const initial = useMemo(

    () => splitName(currentStudent.student_name),

    [currentStudent.student_name]

  );



  const [firstName, setFirstName] = useState(initial.first);

  const [lastName, setLastName] = useState(initial.last);

  const [classSection, setClassSection] = useState(currentStudent.class_section ?? "");

  const [rollNo, setRollNo] = useState(student.roll_no ?? "");

  const [dob, setDob] = useState(student.dob ?? "");

  const [gender, setGender] = useState(student.gender ?? "");

  const [bloodGroup, setBloodGroup] = useState(student.blood_group ?? "");

  const [fatherName, setFatherName] = useState(student.father_name ?? student.parent_name ?? "");

  const [parentPhone, setParentPhone] = useState(student.parent_phone ?? "");
  const [custom1, setCustom1] = useState(student.custom_1 ?? "");
  const [custom2, setCustom2] = useState(student.custom_2 ?? "");
  const [custom3, setCustom3] = useState(student.custom_3 ?? "");

  const [address, setAddress] = useState(student.address ?? "");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedStudent, setSavedStudent] = useState<TeacherStudent | null>(null);

  useEffect(() => {
    if (formFields.length > 0) {
      setExtraValues(initialExtraValuesFromStudent(currentStudent, formFields));
    }
  }, [currentStudent, formFields]);

  async function handleRetakePhoto() {
    const photoUri = await pickStudentPhotoFromCamera();
    if (!photoUri) return;
    navigation.navigate("Preview", {
      student: currentStudent,
      photoUri,
      photoOnly: true,
      photoSource: "camera",
      returnToEdit: true,
      returnToFlow,
    });
  }

  async function handleSave() {
    const payload = buildTeacherStudentPayload(formFields, {
      firstName,
      lastName,
      classSection,
      rollNo,
      dob,
      gender,
      bloodGroup,
      parentName: fatherName,
      parentPhone,
      address,
      custom1,
      custom2,
      custom3,
      extraValues,
    });

    const student_name = String(payload.student_name ?? "").trim();
    if (!student_name) {
      setError("Student name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put<{ student: TeacherStudent }>(
        `/teacher/students/${currentStudent.id}`,
        payload
      );

      const updated: TeacherStudent = {
        ...currentStudent,
        ...data.student,
        student_name,
        class_section: classSection.trim(),
        roll_no: rollNo.trim() || null,
        dob: dob.trim() || null,
        gender: gender.trim() || null,
        blood_group: bloodGroup.trim() || null,
        parent_name: fatherName.trim() || null,
        parent_phone: parentPhone.trim() || null,
        address: address.trim() || null,
        father_name: fatherName.trim() || null,
        custom_1: custom1.trim() || null,
        custom_2: custom2.trim() || null,
        custom_3: custom3.trim() || null,
      };

      setSavedStudent(updated);
      setCurrentStudent(updated);
      showToast("Changes updated.");

      if (returnToFlow) {
        navigation.navigate("StudentList", {
          classSection: returnToFlow.classSection,
          openStudentId: updated.id,
        });
        return;
      }
      navigation.navigate({
        name: "StudentDetail",
        params: { student: updated },
        merge: true,
      });

    } catch (err) {

      setError(getErrorMessage(err, "Failed to save student."));

    } finally {

      setSaving(false);

    }

  }



  const inputStyle = [

    styles.input,

    {

      borderColor: colors.border,

      color: colors.text,

      backgroundColor: colors.surfaceMuted,

    },

  ];



  return (

    <View style={[styles.root, { backgroundColor: colors.background }]}>

      <OrangeGradientHeader

        title="Edit Student"

        variant="green"

        onBack={() => navigation.goBack()}

      />



      <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: insets.bottom + spacing.xxl + spacing.lg },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
          >

            <View style={styles.photoRow}>

              <View

                style={[

                  styles.photoWrap,

                  {
                    width: photoSize,
                    height: photoSize,
                    backgroundColor: colors.graySoft,

                    borderColor: colors.brandGreen,

                  },

                ]}

              >

                {currentStudent.photo_url ? (

                  <Image

                    source={{ uri: currentStudent.photo_url }}

                    style={styles.photoImg}

                  />

                ) : (

                  <Ionicons name="person" size={36} color={colors.textSubtle} />

                )}

              </View>

            </View>



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
              rollNo={rollNo}
              onRollNoChange={setRollNo}
              dob={dob}
              onDobChange={setDob}
              gender={gender}
              onGenderChange={setGender}
              bloodGroup={bloodGroup}
              onBloodGroupChange={setBloodGroup}
              parentName={fatherName}
              onParentNameChange={setFatherName}
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
              classSectionReadOnly
            />



            {error ? (

              <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>

            ) : null}

            <View style={styles.actions}>
              {currentStudent.photo_url ? (
                <Pressable
                  style={[
                    styles.retakeBtn,
                    {
                      borderColor: colors.primaryOrange,
                      backgroundColor: colors.orangeSoft,
                    },
                  ]}
                  onPress={() => void handleRetakePhoto()}
                  disabled={saving}
                >
                  <Ionicons
                    name="camera-outline"
                    size={18}
                    color={colors.primaryOrange}
                  />
                  <Text
                    style={[styles.retakeBtnText, { color: colors.primaryOrange }]}
                  >
                    Retake Photo
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[
                  styles.saveBtn,
                  { backgroundColor: colors.brandGreen },
                  saving && { opacity: 0.6 },
                ]}
                onPress={() => void handleSave()}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Submit"
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    Submit
                  </Text>
                )}
              </Pressable>
            </View>

          </ScrollView>

        </KeyboardAvoidingView>



    </View>

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

  root: { flex: 1 },

  flex: { flex: 1 },

  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },



  photoRow: { alignItems: "center", marginBottom: spacing.md },

  photoWrap: {

    borderRadius: radius.md,

    alignItems: "center",

    justifyContent: "center",

    overflow: "hidden",

    borderWidth: 2,

  },

  photoImg: { width: "100%", height: "100%" },



  field: { marginBottom: spacing.sm + 2 },

  label: {

    marginBottom: spacing.xxs + 2,

    fontSize: typeScale.rowTitle,

    fontFamily: fonts.semiBold,

  },

  input: {

    borderWidth: 1,

    borderRadius: radius.md,

    paddingHorizontal: spacing.sm + 2,

    paddingVertical: spacing.sm,

    fontSize: typeScale.rowTitle,

    fontFamily: fonts.regular,

  },

  error: {

    marginBottom: spacing.sm,

    fontFamily: fonts.medium,

    fontSize: typeScale.rowTitle,

  },



  actions: {
    flexDirection: "column",
    gap: spacing.sm,
    alignItems: "stretch",
    width: "100%",
    marginTop: spacing.md,
  },

  retakeBtn: {

    width: "100%",

    minWidth: 0,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: spacing.xxs + 2,

    borderWidth: 1.5,

    borderRadius: radius.md,

    paddingVertical: spacing.sm + 2,

    paddingHorizontal: spacing.xxs,

  },

  retakeBtnText: {

    fontFamily: fonts.semiBold,

    fontSize: typeScale.sm,

  },

  saveBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs + 2,
    borderRadius: radius.md,
    minHeight: 48,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },

  saveBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
  },

});

