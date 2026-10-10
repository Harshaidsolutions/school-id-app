import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconChip } from "./IconChip";
import { colors, spacing } from "../theme/colors";
import { textStyles } from "../theme/typography";
import { icons, scale } from "../theme/responsive";

type Props = {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  chipIndex?: number;
  style?: ViewStyle;
};

/** H2 section header + thin orange rule. */
export function SectionHeader({ title, icon, chipIndex = 0, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.row}>
        {icon ? (
          <IconChip
            name={icon}
            index={chipIndex}
            size={spacing.iconSm}
            iconSize={icons.sm}
          />
        ) : null}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    ...textStyles.h2,
  },
  rule: {
    height: scale(3),
    width: scale(42),
    backgroundColor: "#005C55",
    opacity: 0.75,
    borderRadius: scale(1),
    marginBottom: spacing.xxs,
  },
});
