import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Pressable } from "./Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  colors,
  radius,
  spacing,
  orangeButtonGradient,
  submitGradient,
} from "../theme/colors";
import { textStyles } from "../theme/typography";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "green" | "sunset" | "orange" | "orangeOutline" | "submit";
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
};

export function GradientButton({
  label,
  onPress,
  disabled,
  variant = "orange",
  icon,
  style,
}: Props) {
  if (variant === "orangeOutline") {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        style={[styles.outlineWrap, disabled && styles.disabled, style]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={colors.primaryOrange}
            style={{ marginRight: 6 }}
          />
        ) : null}
        <Text style={styles.outlineText}>{label}</Text>
      </Pressable>
    );
  }

  const colorset =
    variant === "submit"
      ? ([...submitGradient] as const)
      : variant === "orange"
        ? ([...orangeButtonGradient] as const)
        : variant === "sunset"
          ? (["#FFC107", "#FF9800", "#43A047"] as const)
          : (["#66BB6A", "#43A047", "#2E7D32"] as const);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.wrap, disabled && styles.disabled, style]}
    >
      <LinearGradient
        colors={[...colorset]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.btn}
      >
        <View style={styles.btnInner}>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={colors.white}
              style={{ marginRight: 6 }}
            />
          ) : null}
          <Text style={styles.text}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.buttonPill,
    overflow: "hidden",
    elevation: 3,
    shadowColor: colors.primaryOrange,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  btn: {
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    minHeight: spacing.buttonHeight,
  },
  btnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    ...textStyles.button,
  },
  disabled: { opacity: 0.6 },
  outlineWrap: {
    borderRadius: radius.buttonPill,
    borderWidth: 2,
    borderColor: colors.primaryOrange,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minHeight: spacing.buttonHeight,
    backgroundColor: colors.white,
  },
  outlineText: {
    ...textStyles.button,
    color: colors.primaryOrange,
  },
});
