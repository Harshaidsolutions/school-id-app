import { Image, Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable } from "./AppPressable";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import type { AppColors } from "../theme/palettes";

type Props = {
  visible: boolean;
  studentName: string;
  photoUri: string | null;
  colors: AppColors;
  busy?: boolean;
  onRetake: () => void;
  onUse: () => void;
  onClose: () => void;
};

/** In-popup photo preview with Retake — stays in modal flow, no extra page. */
export function PendingPhotoPreviewSheet({
  visible,
  studentName,
  photoUri,
  colors,
  busy,
  onRetake,
  onUse,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <AppPressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <View
          style={[styles.card, { backgroundColor: colors.surface }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {studentName}
          </Text>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
          ) : null}
          <View style={styles.actions}>
            <AppPressable
              style={[styles.btn, { backgroundColor: colors.primaryOrange }]}
              onPress={onRetake}
              disabled={busy}
            >
              <Ionicons name="camera-reverse" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Retake Photo</Text>
            </AppPressable>
            <AppPressable
              style={[styles.btn, { backgroundColor: colors.brandGreen }]}
              onPress={onUse}
              disabled={busy || !photoUri}
            >
              <Ionicons name="checkmark" size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>{busy ? "Uploading…" : "Use Photo"}</Text>
            </AppPressable>
          </View>
          <AppPressable onPress={onClose} style={styles.cancelHit} disabled={busy}>
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
  preview: {
    width: "100%",
    height: spacing.avatarLg * 2.2,
    borderRadius: radius.md,
    backgroundColor: "#F3F4F6",
  },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
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
