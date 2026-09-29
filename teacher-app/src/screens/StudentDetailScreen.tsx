import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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
import { formatCapturedAt } from "../utils/recordStatus";
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

    <View style={styles.detailRow}>

      <Text style={[styles.detailLabel, { color: colors.textMuted, maxWidth: scale(120) }]}>

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

  const { student, classSection } = route.params;

  const hasPhoto = Boolean(student.photo_url);
  const { fields: formFields, fieldVisibility, allowNumberEdit, allowRecordEdit } = useFormConfig();

  const visibleFields = getVisibleStudentFields(student, classSection, formFields, {
    visibility: fieldVisibility,
    hideIdentity: !allowNumberEdit,
  });

  const photoCapture = useStudentPhotoCapture(navigation);
  const { scale } = useResponsiveLayout();
  const photoSize = scale(120);

  return (

    <View style={[styles.root, { backgroundColor: colors.background }]}>

      <OrangeGradientHeader

        title="Student Details"

        variant="green"

        onBack={() => navigation.goBack()}

      />



      <ScrollView

        style={styles.scroll}

        contentContainerStyle={styles.scrollContent}

        showsVerticalScrollIndicator={false}

      >

        <View style={styles.photoSection}>

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

              <Image

                source={{ uri: student.photo_url }}

                style={styles.photo}

                resizeMode="cover"

              />

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

          {formatCapturedAt(student.photo_captured_at) ? (
            <Text style={{ marginTop: 8, color: colors.textMuted, textAlign: "center" }}>
              Captured: {formatCapturedAt(student.photo_captured_at)}
            </Text>
          ) : null}
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



        <View style={styles.detailsCard}>

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

            style={[styles.editBtn, { borderColor: colors.danger }]}

            onPress={() => navigation.navigate("EditStudent", { student })}

          >

            <Ionicons name="create-outline" size={18} color={colors.danger} />

            <Text style={[styles.editBtnText, { color: colors.danger }]}>

              Edit

            </Text>

          </Pressable>
          ) : null}

          <Pressable

            style={[styles.submitBtn, { backgroundColor: colors.danger }]}

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

    paddingHorizontal: spacing.lg,

    gap: spacing.cardGap,

    paddingVertical: spacing.xxs,

  },

  detailRow: {

    flexDirection: "row",

    alignItems: "flex-start",

  },

  detailLabel: {

    fontFamily: fonts.medium,

    fontSize: typeScale.rowTitle,

    width: "32%",

  },

  detailColon: {

    fontFamily: fonts.medium,

    fontSize: typeScale.rowTitle,

  },

  detailValue: {

    flex: 1,

    fontFamily: fonts.semiBold,

    fontSize: typeScale.rowTitle,

  },



  actions: {

    flexDirection: "row",

    paddingHorizontal: spacing.lg,

    gap: spacing.cardGap,

    marginTop: spacing.lg,

  },

  editBtn: {

    flex: 1,

    flexDirection: "row",

    alignItems: "center",

    justifyContent: "center",

    gap: spacing.xxs + 2,

    borderWidth: 1.5,

    borderRadius: radius.md,

    paddingVertical: spacing.sm + 2,

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

