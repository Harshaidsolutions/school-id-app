import { Modal, StyleSheet, Text, View } from "react-native";
import { AppPressable } from "./AppPressable";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import type { AppColors } from "../theme/palettes";
import type { PhotoSource } from "../utils/studentPhotoPicker";

type Props = {
  visible: boolean;
  studentName: string;
  colors: AppColors;
  onClose: () => void;
  onPick: (source: PhotoSource) => void;
};

/** Popup for pending students — Take Photo / Gallery without leaving the grid. */
export function PendingPhotoSheet({
  visible,
  studentName,
  colors,
  onClose,
  onPick,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <AppPressable style={styles.backdrop} onPress={onClose}>
        <View
          style={[styles.card, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {studentName}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            Add a student photo
          </Text>
          <AppPressable
            style={[styles.btn, { backgroundColor: colors.primaryOrange }]}
            onPress={() => onPick("camera")}
          >
            <Ionicons name="camera" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Take Photo</Text>
          </AppPressable>
          <AppPressable
            style={[styles.btn, { backgroundColor: colors.brandGreen }]}
            onPress={() => onPick("gallery")}
          >
            <Ionicons name="images" size={20} color="#FFFFFF" />
            <Text style={styles.btnText}>Choose from Gallery</Text>
          </AppPressable>
          <AppPressable onPress={onClose} style={styles.cancelHit}>
            <Text style={[styles.cancel, { color: colors.textMuted }]}>Cancel</Text>
          </AppPressable>
        </View>
      </AppPressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "stretch",
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    textAlign: "center",
  },
  sub: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.buttonPill,
    paddingVertical: spacing.sm + 2,
  },
  btnText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.body,
    color: "#FFFFFF",
  },
  cancelHit: { alignItems: "center", paddingTop: spacing.xs },
  cancel: {
    fontFamily: fonts.medium,
    fontSize: typeScale.body,
  },
});
