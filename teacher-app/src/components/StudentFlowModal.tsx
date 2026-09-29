import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PhotoSourceSheet } from "./PhotoSourceSheet";
import { useStudentPhotoCapture } from "../hooks/useStudentPhotoCapture";
import type { RootStackParamList } from "../navigation/types";
import type { TeacherStudent } from "../types";
import { getVisibleStudentFields } from "../utils/studentFields";
import { formatCapturedAt } from "../utils/recordStatus";
import { useFormConfig } from "../hooks/useFormConfig";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { moderateScale, wp } from "../theme/responsive";

type Props = {
  visible: boolean;
  students: TeacherStudent[];
  initialIndex: number;
  classSection: string;
  photoCaptureEnabled?: boolean;
  onClose: () => void;
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

function hasPhoto(student: TeacherStudent): boolean {
  return Boolean(student.photo_url);
}

export function StudentFlowModal({
  visible,
  students,
  initialIndex,
  classSection,
  photoCaptureEnabled = false,
  onClose,
  navigation,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const photoSize = Math.min(wp(84, screenW), moderateScale(340, screenW));
  const [index, setIndex] = useState(initialIndex);
  const indexRef = useRef(index);
  const [fullscreenPhoto, setFullscreenPhoto] = useState(false);

  const photoSwipeClose = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) =>
        Math.abs(gesture.dx) > 14 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
      onPanResponderRelease: (_evt, gesture) => {
        if (Math.abs(gesture.dx) >= 72 && Math.abs(gesture.dy) < 64) {
          setFullscreenPhoto(false);
        }
      },
    })
  ).current;

  const photoCapture = useStudentPhotoCapture(navigation, {
    fromModal: true,
    onBeforeNavigate: onClose,
  });
  const { fields: formFields, fieldVisibility, allowNumberEdit, allowRecordEdit } = useFormConfig();

  useEffect(() => {
    if (visible) {
      const clamped = Math.min(initialIndex, Math.max(0, students.length - 1));
      setIndex(clamped);
      indexRef.current = clamped;
    }
  }, [visible, initialIndex, students.length]);

  const goPrev = useCallback(() => {
    if (indexRef.current > 0) {
      const next = indexRef.current - 1;
      indexRef.current = next;
      setIndex(next);
    }
  }, []);

  const goNext = useCallback(() => {
    if (indexRef.current < students.length - 1) {
      const next = indexRef.current + 1;
      indexRef.current = next;
      setIndex(next);
    }
  }, [students.length]);

  const handleEdit = useCallback(() => {
    const current = students[indexRef.current];
    if (!current) return;
    onClose();
    navigation.navigate("EditStudent", {
      student: current,
      returnToFlow: { classSection },
    });
  }, [classSection, navigation, onClose, students]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 50) goPrev();
        else if (g.dx < -50) goNext();
      },
    })
  ).current;

  const student = students[index];
  if (!student) return null;

  const photoExists = hasPhoto(student);
  const canPrev = index > 0;
  const canNext = index < students.length - 1;
  const detailFields = getVisibleStudentFields(student, classSection, formFields, {
    visibility: fieldVisibility,
    hideIdentity: !allowNumberEdit,
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.text} />
          </Pressable>
          <Text style={[styles.counter, { color: colors.textMuted }]}>
            {index + 1} / {students.length}
          </Text>
          <View style={styles.topSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.photoCenter}>
            <Pressable
              style={[
                styles.photoWrap,
                {
                  width: photoSize,
                  height: photoSize,
                  backgroundColor: colors.graySoft,
                  borderColor: photoExists ? colors.brandGreen : colors.border,
                },
              ]}
              onPress={() => {
                if (photoExists) setFullscreenPhoto(true);
                else if (photoCaptureEnabled) photoCapture.openPhotoSheet(student);
              }}
              disabled={!photoExists && !photoCaptureEnabled}
            >
              {photoExists && student.photo_url ? (
                <Image
                  source={{ uri: student.photo_url }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.emptyPhoto}>
                  <Ionicons name="person" size={48} color={colors.textSubtle} />
                  {photoCaptureEnabled ? (
                    <Text style={[styles.tapHint, { color: colors.textMuted }]}>
                      Tap to add photo
                    </Text>
                  ) : (
                    <Text style={[styles.tapHint, { color: colors.textMuted }]}>
                      No photo on file
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
            {formatCapturedAt(student.photo_captured_at) ? (
              <Text style={[styles.tapHint, { color: colors.textMuted, marginTop: 6 }]}>
                Captured: {formatCapturedAt(student.photo_captured_at)}
              </Text>
            ) : null}
            {student.signature_url ? (
              <View style={{ marginTop: 8, alignItems: "center" }}>
                <Text style={[styles.tapHint, { color: colors.textMuted }]}>Signature</Text>
                <Image
                  source={{ uri: student.signature_url }}
                  style={{ width: photoSize * 0.7, height: 64, marginTop: 4 }}
                  resizeMode="contain"
                />
              </View>
            ) : null}
          </View>

          <Text style={[styles.name, { color: colors.text }]}>
            {student.student_name}
          </Text>

          <View
            style={[
              styles.detailsBox,
              { backgroundColor: colors.surface, borderColor: colors.borderLight },
            ]}
          >
            {detailFields.length === 0 ? (
              <Text style={[styles.detailLine, { color: colors.textMuted }]}>
                No additional details on file.
              </Text>
            ) : (
              detailFields.map((field) => (
                <View key={field.key} style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: colors.textMuted }]}>
                    {field.label}
                  </Text>
                  <Text style={[styles.detailValue, { color: colors.textBody }]}>
                    {field.value}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.borderLight,
              paddingBottom: insets.bottom + spacing.sm,
            },
          ]}
        >
          <Pressable
            style={[
              styles.navBtn,
              { borderColor: colors.border, backgroundColor: colors.surface },
              !canPrev && styles.navBtnDisabled,
            ]}
            onPress={goPrev}
            disabled={!canPrev}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
            <Text style={[styles.navBtnText, { color: colors.text }]}>Back</Text>
          </Pressable>

          {allowRecordEdit ? (
          <Pressable
            style={[
              styles.navBtn,
              { borderColor: colors.brandGreen, backgroundColor: colors.surface },
            ]}
            onPress={handleEdit}
          >
            <Ionicons name="create-outline" size={20} color={colors.brandGreen} />
            <Text style={[styles.navBtnText, { color: colors.brandGreen }]}>
              Edit
            </Text>
          </Pressable>
          ) : null}

          <Pressable
            style={[
              styles.navBtn,
              {
                backgroundColor: colors.brandGreen,
                borderColor: colors.brandGreen,
              },
              !canNext && styles.navBtnDisabled,
            ]}
            onPress={goNext}
            disabled={!canNext}
          >
            <Text style={[styles.navBtnText, { color: "#FFFFFF" }]}>Next</Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <Modal visible={fullscreenPhoto} transparent animationType="fade">
        <View style={styles.fullscreenBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFullscreenPhoto(false)}
          />
          {student.photo_url ? (
            <View style={styles.fullscreenPhotoWrap} {...photoSwipeClose.panHandlers}>
              <Image
                source={{ uri: student.photo_url }}
                style={styles.fullscreenPhoto}
                resizeMode="contain"
              />
            </View>
          ) : null}
          <Pressable
            style={[styles.fullscreenClose, { top: insets.top + spacing.sm }]}
            onPress={() => setFullscreenPhoto(false)}
            hitSlop={12}
          >
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </Modal>

      {photoCaptureEnabled ? (
        <PhotoSourceSheet
          visible={photoCapture.sheetVisible}
          student={photoCapture.sheetStudent}
          busy={photoCapture.sheetBusy}
          onSelect={(source) => void photoCapture.handleSourceSelect(source)}
          onClose={photoCapture.closePhotoSheet}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  topSpacer: { width: 28 },
  counter: {
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    alignItems: "center",
  },
  name: {
    textAlign: "center",
    fontFamily: fonts.bold,
    fontSize: typeScale.xl,
    marginBottom: spacing.md,
    width: "100%",
  },
  photoCenter: {
    width: "100%",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  photoWrap: {
    borderRadius: radius.md,
    borderWidth: 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  emptyPhoto: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  tapHint: {
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
    textAlign: "center",
  },
  detailsBox: {
    width: "100%",
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  detailRow: {
    gap: spacing.xxs / 2,
  },
  detailLabel: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.xs,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  detailValue: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.45,
  },
  detailLine: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.45,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  navBtn: {
    flex: 1,
    flexBasis: 0,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  navBtnDisabled: {
    opacity: 0.45,
  },
  navBtnText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.md,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  fullscreenPhotoWrap: {
    width: "100%",
    height: "85%",
    zIndex: 2,
  },
  fullscreenPhoto: {
    width: "100%",
    height: "100%",
  },
  fullscreenClose: {
    position: "absolute",
    right: spacing.md,
    zIndex: 3,
    padding: spacing.xs,
  },
});
