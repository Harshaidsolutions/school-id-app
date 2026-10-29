import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { FloatingShapes } from "./FloatingShapes";
import { moderateScale } from "../theme/responsive";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

/** Shared sunset header shell — same height/padding on ID Cards + class screens. */
export function IdCardsGreenHeader({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  const { idCardsHeaderGradient } = useTheme();

  return (
    <LinearGradient
      colors={[...idCardsHeaderGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.shell,
        {
          paddingTop: insets.top + spacing.xs,
          minHeight: insets.top + HEADER_BODY,
        },
        style,
      ]}
    >
      <FloatingShapes />
      <View style={styles.inner}>{children}</View>
    </LinearGradient>
  );
}

/** Body height below status bar — keep identical across ID Cards screens. */
export const ID_CARDS_HEADER_BODY = moderateScale(72);
const HEADER_BODY = ID_CARDS_HEADER_BODY;

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  inner: {
    minHeight: moderateScale(56),
    justifyContent: "center",
  },
});
