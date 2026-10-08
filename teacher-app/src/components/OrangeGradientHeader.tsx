import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { Pressable } from "./Pressable";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { moderateScale, icons, scaledHitSlop } from "../theme/responsive";

type Props = {
  title: string;
  subtitle?: string;
  /** Lines allowed for the subtitle. Default keeps existing single-line behavior. */
  subtitleLines?: number;
  onBack?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  style?: ViewStyle;
  /** Orange (default) or green for ID Cards flow. */
  variant?: "orange" | "green";
};

/** Spec: ~96px header, 24px bottom radius, H1 centered title. */
export function OrangeGradientHeader({
  title,
  subtitle,
  subtitleLines = 1,
  onBack,
  rightIcon,
  onRightPress,
  style,
  variant = "orange",
}: Props) {
  const insets = useSafeAreaInsets();
  const { headerGradient, idCardsHeaderGradient } = useTheme();
  const gradient =
    variant === "green" ? idCardsHeaderGradient : headerGradient;
  const iconSize = moderateScale(40);

  return (
    <LinearGradient
      colors={[...gradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + moderateScale(8),
          minHeight: insets.top + spacing.headerHeight,
        },
        style,
      ]}
    >
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:"absolute",right:-25,top:-35,width:160,height:160,borderRadius:80,borderWidth:24,borderColor:"rgba(255,255,255,0.08)"}} />
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={[styles.iconBtn, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }]}
            hitSlop={scaledHitSlop}
          >
            <Ionicons name="arrow-back" size={icons.lg} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={[styles.iconSlot, { width: iconSize, height: iconSize }]} />
        )}
        <View style={styles.titleWrap}>
          <Text
            style={styles.title}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={styles.subtitle}
              numberOfLines={subtitleLines}
              adjustsFontSizeToFit={subtitleLines === 1}
              minimumFontScale={0.75}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightIcon ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={onRightPress}
            style={[styles.iconBtn, { width: iconSize, height: iconSize, borderRadius: iconSize / 2 }]}
            hitSlop={scaledHitSlop}
          >
            <Ionicons name={rightIcon} size={icons.lg} color="#FFFFFF" />
          </Pressable>
        ) : (
          <View style={[styles.iconSlot, { width: iconSize, height: iconSize }]} />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    paddingBottom: moderateScale(18),
    justifyContent: "center",
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.pagePad,
    minHeight: moderateScale(48),
  },
  iconBtn: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  titleWrap: {
    flex: 1,
    paddingHorizontal: spacing.xs,
  },
  title: {
    ...textStyles.h1,
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    fontFamily: fonts.medium,
    fontSize: typeScale.xs,
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
    marginTop: moderateScale(2),
  },
});