import { ZoomTap } from "../components/ZoomTap";
import { GeneratedIdCard } from "../components/GeneratedIdCard";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { contentMaxStyle } from "../theme/responsive";
import { Pressable } from "../components/Pressable";
import { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import api from "../api/client";

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { Ionicons } from "@expo/vector-icons";

import { OrangeGradientHeader } from "../components/OrangeGradientHeader";

import { PhotoSourceSheet } from "../components/PhotoSourceSheet";

import { useStudentPhotoCapture } from "../hooks/useStudentPhotoCapture";

import type { RootStackParamList } from "../navigation/types";

import { radius, spacing } from "../theme/colors";

import { fonts, type as typeScale } from "../theme/typography";

import { useTheme } from "../theme/ThemeContext";

import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

import type { AppColors } from "../theme/palettes";

import { getVisibleStudentFields } from "../utils/studentFields";
import { formatCapturedAt, studentHasPhoto, studentHasSignature } from "../utils/recordStatus";
import { useFormConfig } from "../hooks/useFormConfig";



type Props = NativeStackScreenProps<RootStackParamList, "StudentDetail">;



function DetailRow({

  label,

  value,

  colors,

}: {

  label: string;

  value: string;

  colors: AppColors;

}) {
  const { scale } = useResponsiveLayout();

  return (

    <View style={[styles.detailRow, { borderBottomColor: colors.borderLight }]}>

      <Text style={[styles.detailLabel, { color: colors.textMuted }]} numberOfLines={2}>

        {label}

      </Text>

      <Text style={[styles.detailColon, { color: colors.textMuted }]}> : </Text>

      <Text style={[styles.detailValue, { color: colors.text }]}>

        {value}

      </Text>

    </View>

  );

}



export function StudentDetailScreen({ navigation, route }: Props) {

  const { colors } = useTheme();

  const { classSection } = route.params;
  const [student, setStudent] = useState(route.params.student);

  // Always show the latest server copy (photo, signature, generated card, fields).
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void api
        .get<{ student: typeof route.params.student }>(`/teacher/students/${route.params.student.id}`)
        .then((r) => { if (alive && r.data?.student) setStudent(r.data.student); })
        .catch(() => undefined);
      return () => { alive = false; };
    }, [route.params.student.id])
  );

  const hasPhoto = Boolean(student.photo_url);
  const { fields: formFields, allowNumberEdit, allowRecordEdit } = useFormConfig();

  const visibleFields = getVisibleStudentFields(student, classSection, formFields, {
    hideIdentity: !allowNumberEdit,
  });

  const photoCapture = useStudentPhotoCapture(navigation);
  const { scale } = useResponsiveLayout();
  const photoSize = scale(120);

  return (

    <View style={[styles.root, { backgroundColor: colors.background }]}><ScreenBackdrop />

      <OrangeGradientHeader

        title="Student Details"

        variant="green"

        onBack={() => navigation.goBack()}

      />



      <ScrollView

        style={styles.scroll}

        contentContainerStyle={[styles.scrollContent, contentMaxStyle]}

        showsVerticalScrollIndicator={false}

      >

        <View style={styles.photoSection}>

          {student.id_card_url ? (
            <ZoomTap images={[student.id_card_url, student.photo_url]} title={student.student_name ?? "ID card"}><GeneratedIdCard uri={student.id_card_url} maxWidth={scale(230)} maxHeight={scale(360)} /></ZoomTap>
          ) : (
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

            {hasPhoto && student.photo_url ? (
              <ZoomTap images={[student.photo_url]} title={student.student_name ?? "Photo"} style={styles.photo}><Image source={{ uri: student.photo_url }} style={styles.photo} resizeMode="cover" /></ZoomTap>
            ) : (

              <Ionicons name="person" size={48} color={colors.textSubtle} />

            )}

            <Pressable

              style={[

                styles.cameraBadge,

                {

                  backgroundColor: colors.brandGreen,

                  borderColor: "#FFFFFF",

                },

              ]}

              onPress={() => photoCapture.openPhotoSheet(student)}

            >

              <Ionicons name="camera" size={16} color="#FFFFFF" />

            </Pressable>

          </View>
          )}

          <View style={{ marginTop: 10, alignItems: "center", gap: 3 }}>
            {/* Photo status — shows "Captured" once a photo exists, else "Pending" (#25). */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 999,
                backgroundColor: studentHasPhoto(student) ? colors.greenSoft : colors.blueSoft,
              }}
            >
              <Ionicons
                name={studentHasPhoto(student) ? "checkmark-circle" : "time-outline"}
                size={15}
                color={studentHasPhoto(student) ? colors.brandGreen : colors.primaryOrange}
              />
              <Text
                style={{
                  color: studentHasPhoto(student) ? colors.brandGreen : colors.primaryOrange,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {studentHasPhoto(student) ? "Captured" : "Pending"}
              </Text>
            </View>
            {student.photo_id ? (
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>Photo No: {student.photo_id}</Text>
            ) : null}
            {formatCapturedAt(student.photo_captured_at) ? (
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
                Captured: {formatCapturedAt(student.photo_captured_at)}
              </Text>
            ) : null}
            {formatCapturedAt(student.created_at) ? (
              <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
                Created: {formatCapturedAt(student.created_at)}
              </Text>
            ) : null}
            {/* Signature status — number matches the photo number (#27). */}
            <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
              Signature: {studentHasSignature(student) ? `Uploaded${student.photo_id ? ` (No: ${student.photo_id})` : ""}` : "Not uploaded"}
            </Text>
          </View>
          {student.signature_url ? (
            <View style={{ marginTop: 12, alignItems: "center" }}>
              <Text style={{ color: colors.textMuted, marginBottom: 4 }}>Signature</Text>
              <Image
                source={{ uri: student.signature_url }}
                style={{ width: photoSize, height: 72 }}
                resizeMode="contain"
              />
            </View>
          ) : null}

          <Text style={[styles.studentName, { color: colors.text }]}>

            {student.student_name}

          </Text>

        </View>



        <View style={[styles.detailsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>

          {visibleFields.map((field) => (

            <DetailRow

              key={field.key}

              colors={colors}

              label={field.label}

              value={field.value}

            />

          ))}

        </View>



        <View style={styles.actions}>

          {allowRecordEdit ? (
          <Pressable

            style={[styles.editBtn, { borderColor: colors.primaryOrange, backgroundColor: colors.blueSoft }]}

            onPress={() => navigation.navigate("EditStudent", { student })}

          >

            <Ionicons name="create-outline" size={18} color={colors.primaryOrange} />

            <Text style={[styles.editBtnText, { color: colors.primaryOrange }]}>

              Edit Form

            </Text>

          </Pressable>
          ) : null}

          <Pressable

            style={[styles.submitBtn, { backgroundColor: colors.submitGreen }]}

          >

            <Ionicons name="send-outline" size={16} color="#FFFFFF" />

            <Text style={styles.submitBtnText}>Submit</Text>

          </Pressable>

        </View>

      </ScrollView>



      <PhotoSourceSheet

        visible={photoCapture.sheetVisible}

        student={photoCapture.sheetStudent}

        busy={photoCapture.sheetBusy}

        onSelect={(source) => void photoCapture.handleSourceSelect(source)}

        onClose={photoCapture.closePhotoSheet}

      />

    </View>

  );

}



const styles = StyleSheet.create({

  root: { flex: 1 },

  scroll: { flex: 1 },

  scrollContent: { paddingBottom: spacing.xxl },



  photoSection: { alignItems: "center", paddingVertical: spacing.lg },

  photoWrap: {

    borderRadius: radius.md,

    alignItems: "center",

    justifyContent: "center",

    overflow: "hidden",

    borderWidth: 3,

  },

  photo: { width: "100%", height: "100%" },

  cameraBadge: {

    position: "absolute",

    bottom: spacing.xxs,

    right: spacing.xxs,

    width: spacing.iconSm,

    height: spacing.iconSm,

    borderRadius: spacing.iconSm / 2,

    alignItems: "center",

    justifyContent: "center",

    borderWidth: 2,

  },

  studentName: {

    marginTop: spacing.sm,

    fontFamily: fonts.bold,

    fontSize: typeScale.title,

  },



  detailsCard: {

    marginHorizontal: spacing.md,

    paddingHorizontal: spacing.md,

    paddingVertical: spacing.xxs,

    borderRadius: radius.lg,

    borderWidth: 1,

    borderColor: "#E2E8F0",

    backgroundColor: "#FFFFFF",

  },

  detailRow: {

    flexDirection: "row",

    alignItems: "flex-start",

    paddingVertical: spacing.sm,

    borderBottomWidth: 1,

  },

  detailLabel: {

    fontFamily: fonts.medium,

    fontSize: typeScale.label,

    lineHeight: typeScale.label * 1.35,

    width: "38%",

  },

  detailColon: {

    fontFamily: fonts.medium,

    fontSize: typeScale.label,

    lineHeight: typeScale.label * 1.35,

  },

  detailValue: {

    flex: 1,

    fontFamily: fonts.semiBold,

    fontSize: typeScale.body,

    lineHeight: typeScale.body * 1.3,

  },



  actions: {

    flexDirection: "row",

    paddingHorizontal: spacing.lg,

    gap: spacing.cardGap,

    marginTop: spacing.lg,

  },

  editBtn: {

    flexGrow: 0,

    flexShrink: 0,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: spacing.xxs + 2,

    borderWidth: 1.5,

    borderRadius: radius.md,

    paddingVertical: spacing.sm,

    paddingHorizontal: spacing.md,

  },

  editBtnText: {

    fontFamily: fonts.semiBold,

    fontSize: typeScale.rowTitle,

  },

  submitBtn: {

    flex: 1.5,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: spacing.xxs + 2,

    borderRadius: radius.md,

    paddingVertical: spacing.sm + 2,

  },

  submitBtnText: {

    fontFamily: fonts.semiBold,

    fontSize: typeScale.rowTitle,

    color: "#FFFFFF",

  },

});

