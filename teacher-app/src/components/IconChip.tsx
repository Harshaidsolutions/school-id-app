import { StyleSheet, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "../theme/colors";
import { chipForIndex, type ChipAccent } from "../theme/chips";
import { icons } from "../theme/responsive";

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  index?: number;
  accent?: ChipAccent;
  size?: number;
  iconSize?: number;
  style?: ViewStyle;
};

/** Spec: 40×40, radius 12, icon 20, rotating accent tint. */
export function IconChip({
  name,
  index = 0,
  accent,
  size = spacing.chipSize,
  iconSize = icons.md,
  style,
}: Props) {
  const palette = accent ?? chipForIndex(index);
  return (
    <View
      style={[
        styles.chip,
        {
          width: size,
          height: size,
          borderRadius: radius.chip,
          backgroundColor: palette.bg,
        },
        style,
      ]}
    >
      <Ionicons name={name} size={iconSize} color={palette.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    justifyContent: "center",
  },
});
