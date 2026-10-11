import { Pressable, Text, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "../../theme/colors";
import { textStyles } from "../../theme/typography";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  linkTo?: string; // Route to navigate to when pressed
  suffix?: string;
}

export function MetricCard({ label, value, icon, linkTo, suffix }: MetricCardProps) {
  const navigation = useNavigation();

  const handlePress = () => {
    if (linkTo) {
      (navigation as any).navigate(linkTo);
    }
  };

  return (
    <Pressable onPress={handlePress} style={styles.card}>
      <View style={styles.iconContainer}>
        <Ionicons name={icon as any} size={24} color={colors.textSecondary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>
          {typeof value === "number" ? value.toLocaleString() : value}
          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    marginRight: spacing.sm,
  },
  content: {
    flexShrink: 1,
  },
  label: {
    ...textStyles.fieldLabel,
    color: colors.textSecondary,
  },
  value: {
    ...textStyles.input,
    color: colors.text,
  },
  suffix: {
    ...textStyles.input,
    color: colors.textSecondary,
    marginLeft: 4,
  },
});
