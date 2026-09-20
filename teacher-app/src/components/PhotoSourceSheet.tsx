import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { TeacherStudent } from "../types";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import type { PhotoSource } from "../utils/studentPhotoPicker";

type Props = {
  visible: boolean;
  student: TeacherStudent | null;
  busy?: boolean;
  onSelect: (source: PhotoSource) => void;
  onClose: () => void;
};

/** Reusable photo-source popup — student name + Take Photo / Gallery / Cancel. */
export function PhotoSourceSheet({
  visible,
  student,
  busy = false,
  onSelect,
  onClose,
}: Props) {
  const { colors } = useTheme();
  if (!student) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: colors.surface }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.name, { color: colors.text }]}>
            {student.student_name}
          </Text>
          {student.roll_no ? (
            <Text style={[styles.roll, { color: colors.textMuted }]}>
              Roll {student.roll_no}
            </Text>
          ) : null}

          {busy ? (
            <ActivityIndicator
              size="large"
              color={colors.brandGreen}
              style={styles.spinner}
            />
          ) : (
            <>
              <Pressable
                style={[styles.option, { borderColor: colors.border }]}
                onPress={() => onSelect("camera")}
              >
                <Ionicons name="camera" size={22} color={colors.brandGreen} />
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Take Photo
                </Text>
              </Pressable>
              <Pressable
                style={[styles.option, { borderColor: colors.border }]}
                onPress={() => onSelect("gallery")}
              >
                <Ionicons name="images" size={22} color={colors.brandGreen} />
                <Text style={[styles.optionText, { color: colors.text }]}>
                  Choose from Gallery
                </Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={onClose}>
                <Text style={[styles.cancelText, { color: colors.textMuted }]}>
                  Cancel
                </Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  name: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    textAlign: "center",
  },
  roll: {
    fontFamily: fonts.regular,
    fontSize: typeScale.subtitle,
    textAlign: "center",
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  spinner: { marginVertical: spacing.lg },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  optionText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.md,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xxs,
  },
  cancelText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.md,
  },
});
