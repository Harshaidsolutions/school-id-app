import { StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";

export function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "pending").toLowerCase();
  const captured = value === "captured" || value === "printed";
  const pending = value === "pending";

  return (
    <View
      style={[
        styles.badge,
        captured ? styles.captured : pending ? styles.pending : styles.inactive,
      ]}
    >
      <Text
        style={[
          styles.text,
          captured
            ? styles.capturedText
            : pending
              ? styles.pendingText
              : styles.inactiveText,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderWidth: 1,
  },
  pending: {
    backgroundColor: colors.orangeSoft,
    borderColor: colors.primaryOrange,
  },
  captured: {
    backgroundColor: colors.greenSoft,
    borderColor: colors.royalGreen,
  },
  inactive: {
    backgroundColor: colors.graySoft,
    borderColor: colors.textMuted,
  },
  text: {
    fontSize: typeScale.subtitle,
    fontFamily: fonts.bold,
    textTransform: "capitalize",
  },
  pendingText: {
    color: colors.primaryOrange,
  },
  capturedText: {
    color: colors.royalGreen,
  },
  inactiveText: {
    color: colors.textMuted,
  },
});
