import { StyleSheet, Text, View } from "react-native";
import { spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { scale } from "../theme/responsive";

type Props = {
  captured: number;
  total: number;
  caption?: string;
  hideCaption?: boolean;
};

/** Progress bar + caption — identical on ID Cards home and class detail. */
export function IdCardsProgressSection({
  captured,
  total,
  caption,
  hideCaption = false,
}: Props) {
  const { colors } = useTheme();
  const pct = total === 0 ? 0 : Math.round((captured / total) * 100);
  const label = caption ?? `${captured}/${total} photos captured`;

  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: colors.track }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${pct}%`,
              backgroundColor: colors.brandGreen,
            },
          ]}
        />
      </View>
      {!hideCaption ? (
        <Text style={[styles.caption, { color: colors.textMuted }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.pagePad,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  track: {
    height: scale(8),
    borderRadius: 4,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 4,
  },
  caption: {
    marginTop: spacing.xs,
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
    textAlign: "center",
  },
});
