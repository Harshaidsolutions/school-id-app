import { StyleSheet, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { moderateScale } from "../theme/responsive";

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
};

/** Shared green header shell — same height/padding on ID Cards + class screens. */
export function IdCardsGreenHeader({ children, style }: Props) {
  const insets = useSafeAreaInsets();
  const { idCardsHeaderGradient } = useTheme();

  return (
    <LinearGradient
      colors={[...idCardsHeaderGradient]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[
        styles.shell,
        {
          paddingTop: insets.top + spacing.xs,
          minHeight: insets.top + HEADER_BODY,
        },
        style,
      ]}
    >
      <View style={styles.inner}>{children}</View>
    </LinearGradient>
  );
}

/** Body height below status bar — keep identical across ID Cards screens. */
export const ID_CARDS_HEADER_BODY = moderateScale(72);
const HEADER_BODY = ID_CARDS_HEADER_BODY;

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    justifyContent: "flex-end",
  },
  inner: {
    minHeight: moderateScale(56),
    justifyContent: "center",
  },
});
