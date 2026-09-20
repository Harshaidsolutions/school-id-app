import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { radius, spacing } from "../theme/colors";
import { textStyles } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  /** Smaller pill for full-screen viewer header. */
  compact?: boolean;
};

/** Canonical Submit CTA — matches Required Details screen gradient + pill shape. */
export function SubmitGradientButton({
  label = "Submit",
  onPress,
  disabled,
  loading,
  icon = "send",
  style,
  compact = false,
}: Props) {
  const { submitGradient } = useTheme();
  const inactive = disabled || loading;

  return (
    <Pressable
      style={[styles.wrap, inactive && styles.disabled, style]}
      onPress={onPress}
      disabled={inactive}
    >
      <LinearGradient
        colors={[...submitGradient]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.btn, compact && styles.btnCompact]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.row}>
            {icon ? (
              <Ionicons name={icon} size={16} color="#FFFFFF" />
            ) : null}
            <Text style={styles.text}>{label}</Text>
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.buttonPill,
    overflow: "hidden",
    elevation: 3,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing.buttonHeight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  btnCompact: {
    minHeight: 38,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  text: {
    ...textStyles.button,
  },
  disabled: { opacity: 0.6 },
});
