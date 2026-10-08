import { Pressable } from "./Pressable";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";

interface ErrorRetryProps {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
}

export function ErrorRetry({
  message,
  onRetry,
  retryLabel = "Retry",
}: ErrorRetryProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.message}>{message}</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>{retryLabel}</Text>
      </Pressable>
    </View>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.parrotGreen} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  message: {
    textAlign: "center",
    color: colors.danger,
    fontSize: typeScale.md,
    lineHeight: typeScale.md * 1.4,
    fontFamily: fonts.regular,
  },
  button: {
    backgroundColor: colors.primaryOrange,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typeScale.md,
  },
  loadingLabel: {
    marginTop: spacing.xs,
    color: colors.textMuted,
    fontSize: typeScale.md,
    fontFamily: fonts.regular,
  },
});
