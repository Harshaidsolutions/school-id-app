import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius } from "../../theme/colors";
import { textStyles } from "../../theme/typography";

interface StatStatusPillProps {
  label: string;
  value: number;
  tone: string; // e.g., colors.success or colors.warning, etc.
}

export function StatStatusPill({ label, value, tone }: StatStatusPillProps) {
  return (
    <View style={[
      styles.pill,
      { backgroundColor: tone },
    ]}>
      <Text style={styles.value}>{value.toLocaleString()}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: "center",
  },
  value: {
    ...textStyles.input,
    fontWeight: "600",
    color: colors.white,
  },
  label: {
    ...textStyles.fieldLabel,
    color: colors.white,
    marginTop: 4,
  },
});
