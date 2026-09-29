import {
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { BRAND } from "../constants/brand";
import { BRAND_LOGO_ASPECT, brandLogoSource } from "../constants/brandLogo";
import { fonts } from "../theme/typography";
import { fontScaleMin, scale, scaleFont, wp } from "../theme/responsive";

type Variant = "splash" | "hero" | "homeHero" | "headerRow" | "compact";

type Props = {
  variant?: Variant;
  /** Customer-facing name. Replaces the Harsha wordmark when set. */
  title?: string;
  showMascot?: boolean;
  showTagline?: boolean;
  /** Default center; use left for Home header row. */
  align?: "left" | "center";
  style?: StyleProp<ViewStyle>;
  harshaColor?: string;
  solutionsColor?: string;
  taglineColor?: string;
};

const BRAND_MIN = { harsha: 18, solutions: 12, tag: 11 } as const;
const BRAND_BASE = { harsha: 42, solutions: 22, tag: 13 } as const;

function BrandLine({
  text,
  baseSize,
  minSize,
  style,
  width,
}: {
  text: string;
  baseSize: number;
  minSize: number;
  style: TextStyle;
  width: number;
}) {
  const fontSize = scaleFont(baseSize, minSize, undefined, width);
  return (
    <Text
      style={[style, { fontSize, lineHeight: fontSize * 1.18, width, paddingBottom: 2 }]}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={fontScaleMin(baseSize, minSize)}
      ellipsizeMode="clip"
    >
      {text}
    </Text>
  );
}

/**
 * Tight wordmark: HARSHA immediately over ID SOLUTIONS (no stacked gap),
 * tagline as a small subtitle. Each line never breaks mid-word.
 */
export function BrandLockup({
  variant = "hero",
  title,
  showMascot = false,
  showTagline = true,
  align = "center",
  style,
  harshaColor,
  solutionsColor,
  taglineColor,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const lineW = wp(
    variant === "compact" ? 88 : variant === "headerRow" ? 62 : variant === "homeHero" ? 78 : 92,
    screenW
  );
  const textAlign = align === "left" ? "left" : "center";

  const sizes =
    variant === "splash"
      ? { mascot: wp(28, screenW), harsha: BRAND_BASE.harsha, solutions: BRAND_BASE.solutions, tag: BRAND_BASE.tag, gap: 0 }
      : variant === "homeHero"
        ? { mascot: wp(32, screenW), harsha: 104, solutions: 56, tag: 18, gap: 0 }
      : variant === "headerRow"
        ? { mascot: wp(20, screenW), harsha: 40, solutions: 22, tag: 12, gap: 0 }
      : variant === "compact"
        ? { mascot: wp(16, screenW), harsha: 22, solutions: 13, tag: 11, gap: 0 }
        : { mascot: wp(28, screenW), harsha: 44, solutions: 24, tag: 14, gap: 0 };

  const hColor = harshaColor ?? (variant === "splash" ? "#FFFFFF" : "#F5811F");
  const sColor = solutionsColor ?? (variant === "splash" ? "#FFFFFF" : "#4CAF50");
  const tColor = taglineColor ?? (variant === "splash" ? "rgba(255,255,255,0.9)" : "#8A8F98");

  const harshaStyle: TextStyle = {
    fontFamily: fonts.headingExtraBold,
    letterSpacing: 0.4,
    color: hColor,
    textAlign,
    includeFontPadding: false,
  };
  const solutionsStyle: TextStyle = {
    fontFamily: fonts.headingBold,
    letterSpacing: 0.8,
    color: sColor,
    textAlign,
    marginTop: sizes.gap,
    includeFontPadding: false,
  };
  const tagStyle: TextStyle = {
    fontFamily: fonts.headingSemiBold,
    letterSpacing: 0.2,
    color: tColor,
    textAlign,
    marginTop: scale(4, screenW),
    includeFontPadding: false,
  };

  const harshaMin = variant === "compact" ? 14 : BRAND_MIN.harsha;
  const solutionsMin = variant === "compact" ? 10 : BRAND_MIN.solutions;
  const tagMin = BRAND_MIN.tag;

  return (
    <View
      style={[
        styles.wrap,
        align === "left" && styles.wrapLeft,
        style,
      ]}
    >
      {showMascot ? (
        <Image
          source={brandLogoSource()}
          style={{
            width: sizes.mascot,
            height: Math.round(sizes.mascot * BRAND_LOGO_ASPECT),
            marginBottom: scale(6, screenW),
          }}
          resizeMode="contain"
          accessibilityLabel="My School ID Card logo"
        />
      ) : null}
      {title ? (
        <Text
          style={[harshaStyle, { fontSize: scaleFont(sizes.harsha, harshaMin, undefined, screenW), lineHeight: scaleFont(sizes.harsha, harshaMin, undefined, screenW) * 1.15 }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
        >
          {title}
        </Text>
      ) : (
        <>
      <BrandLine
        text={BRAND.harsha}
        baseSize={sizes.harsha}
        minSize={harshaMin}
        style={harshaStyle}
        width={lineW}
      />
      <BrandLine
        text={BRAND.solutions}
        baseSize={sizes.solutions}
        minSize={solutionsMin}
        style={solutionsStyle}
        width={lineW}
      />
        </>
      )}
      {showTagline && !title ? (
        <BrandLine
          text={BRAND.tagline}
          baseSize={sizes.tag}
          minSize={tagMin}
          style={tagStyle}
          width={lineW}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: "100%" },
  wrapLeft: { alignItems: "flex-start" },
});
