/**
 * Typography tokens — only Poppins + Inter (no third family).
 *
 * --font-heading (Poppins): headers, section titles, buttons, badges,
 *   logo text, onboarding headlines, card/row titles
 * --font-body (Inter): body, field labels, inputs, placeholders,
 *   descriptions, tab labels, secondary/meta
 */
import { colors } from "./colors";
import { scale as s } from "./responsive";

export const fontHeading = "Poppins";
export const fontBody = "Inter";

export const fonts = {
  /** Poppins — heading roles */
  poppinsMedium: "Poppins_500Medium",
  poppinsSemiBold: "Poppins_600SemiBold",
  poppinsBold: "Poppins_700Bold",
  poppinsExtraBold: "Poppins_800ExtraBold",

  /** Inter — body roles */
  interRegular: "Inter_400Regular",
  interMedium: "Inter_500Medium",
  interSemiBold: "Inter_600SemiBold",

  /**
   * Role aliases (prefer textStyles):
   * heading weights → Poppins; body weights → Inter
   */
  heading: "Poppins_700Bold",
  headingMedium: "Poppins_500Medium",
  headingSemiBold: "Poppins_600SemiBold",
  headingBold: "Poppins_700Bold",
  headingExtraBold: "Poppins_800ExtraBold",

  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",

  /** Legacy aliases used across screens */
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  /** Row/card titles & buttons → Poppins */
  semiBold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extraBold: "Poppins_800ExtraBold",
} as const;

export const type = {
  nav: s(12),
  badge: s(16),
  subtitle: s(15),
  placeholder: s(15),
  section: s(18),
  body: s(16),
  label: s(14),
  input: s(16),
  button: s(16),
  rowTitle: s(18),
  h1: s(24),
  screenTitle: s(24),
  onboardingSub: s(18),
  onboardingHeadline: s(36),
  xs: s(13),
  sm: s(15),
  md: s(18),
  lg: s(22),
  xl: s(26),
  xxl: s(32),
  title: s(26),
  hero: s(32),
  display: s(34),
} as const;

export const lineHeights = {
  tight: 1.25,
  body: 1.5,
  relaxed: 1.65,
} as const;

export const textStyles = {
  h1: {
    fontFamily: fonts.headingBold,
    fontSize: type.h1,
    letterSpacing: 0.5,
    color: colors.white,
    textTransform: "none" as const,
  },
  h2: {
    fontFamily: fonts.headingSemiBold,
    fontSize: type.section,
    letterSpacing: 0.5,
    color: colors.sectionOrange,
    textTransform: "none" as const,
  },
  /** Card / row titles — Poppins */
  h3: {
    fontFamily: fonts.headingSemiBold,
    fontSize: type.rowTitle,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: type.subtitle,
    color: colors.textSecondary,
    lineHeight: type.subtitle * 1.45,
  },
  fieldLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: type.label,
    color: colors.text,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: type.input,
    color: colors.text,
  },
  placeholder: {
    fontFamily: fonts.body,
    fontSize: type.placeholder,
    color: colors.textPlaceholder,
  },
  button: {
    fontFamily: fonts.headingSemiBold,
    fontSize: type.button,
    letterSpacing: 0.3,
    color: colors.white,
  },
  nav: {
    fontFamily: fonts.bodyMedium,
    fontSize: type.nav,
  },
  onboardingHeadline: {
    fontFamily: fonts.headingBold,
    fontSize: type.onboardingHeadline,
    lineHeight: type.onboardingHeadline * 1.35,
  },
  onboardingSub: {
    fontFamily: fonts.body,
    fontSize: type.onboardingSub,
    color: colors.textBody,
    lineHeight: type.onboardingSub * 1.5,
  },
  badge: {
    fontFamily: fonts.headingBold,
    fontSize: type.badge,
    color: colors.white,
  },
} as const;
