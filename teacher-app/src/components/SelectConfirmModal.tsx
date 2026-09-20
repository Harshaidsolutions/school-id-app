import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { AppColors } from "../theme/palettes";
import { radius, spacing, submitGradient } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";

type Props = {
  visible: boolean;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
  colors: AppColors;
  loading?: boolean;
};

/** Confirmation before selecting a template, model, or tag. */
export function SelectConfirmModal({
  visible,
  message = "Are you sure you want to select this?",
  onCancel,
  onConfirm,
  colors,
  loading = false,
}: Props) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>Confirm selection</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.cancelBtn, { backgroundColor: colors.graySoft }]}
              onPress={onCancel}
              disabled={loading}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmWrap, loading && styles.confirmDisabled]}
              onPress={onConfirm}
              disabled={loading}
            >
              <LinearGradient
                colors={[...submitGradient]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.confirmBtn}
              >
                <Text style={styles.confirmText}>{loading ? "…" : "Confirm"}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    ...textStyles.h3,
  },
  body: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.45,
  },
  actions: {
    marginTop: spacing.lg,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
  },
  confirmWrap: {
    flex: 1,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  confirmDisabled: {
    opacity: 0.6,
  },
  confirmBtn: {
    paddingVertical: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmText: {
    color: "#FFFFFF",
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
  },
});
