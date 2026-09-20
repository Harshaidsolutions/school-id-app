import { Modal, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SubmitGradientButton } from "./SubmitGradientButton";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  visible: boolean;
  title?: string;
  message: string;
  onDismiss: () => void;
};

/** Standard success confirmation used after saves/submits/uploads. */
export function SuccessModal({
  visible,
  title = "Success",
  message,
  onDismiss,
}: Props) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Ionicons name="checkmark-circle" size={48} color={colors.brandGreen} />
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textMuted }]}>
            {message}
          </Text>
          <SubmitGradientButton label="OK" onPress={onDismiss} />
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
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: typeScale.xl,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.45,
    textAlign: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
