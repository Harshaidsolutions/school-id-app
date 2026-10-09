/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand
  primaryOrange: "#C96948",
  warmOrange: "#E69C75",
  yellow: "#FACC15",
  softYellow: "#FEF3C7",
  green: "#287F79",
  successGreen: "#287F79",
  submitGreen: "#44978B",
  softGreen: "rgba(76,175,80,0.12)",
  blue: "#487DCA",
  softBlue: "rgba(33,150,243,0.12)",
  purple: "#8A64C7",
  softPurple: "rgba(156,39,176,0.12)",
  pink: "#C95E8C",
  softPink: "rgba(233,30,99,0.12)",

  background: "#FBF6F0",
  surface: "#FFFFFF",
  text: "#694B72",
  textPrimary: "#694B72",
  textSecondary: "#827287",
  textBody: "#6D6177",
  textPlaceholder: "#8D7D90",
  border: "#EBDDE4",

  // Header / gradients
  headerOrangeStart: "#875881",
  headerOrangeMid: "#BB787F",
  headerYellowEnd: "#C96948",

  brandOrange: "#C96948",
  brandOrangeLight: "#E69C75",
  brandGreen: "#287F79",
  brandGreenLight: "#44978B",
  brandGreenDark: "#167D79",
  brandGreenDeep: "#126A68",
  brandNavy: "#694B72",
  brandBlue: "#487DCA",

  splashGreen: "#287F79",
  splashGreenLight: "#44978B",
  splashGreenPale: "rgba(76,175,80,0.12)",
  splashOrange: "#C96948",
  splashOrangeDeep: "#E06B10",
  splashYellow: "#FACC15",

  gradientStart: "#E69C75",
  gradientMid: "#C96948",
  gradientEnd: "#44978B",

  royalGreen: "#287F79",
  parrotGreen: "#44978B",

  orangeDark: "#E06B10",
  orangeDeep: "#C45A12",
  offerOrange: "#C96948",
  tabActive: "#C96948",

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: "#FBF6F0",
  inputBg: "#FFFFFF",
  borderLight: "#EBDDE4",
  track: "#EBDDE4",

  textMuted: "#827287",
  textSubtle: "#8D7D90",
  textNav: "#694B72",

  classIconYellow: "#FEF3C7",
  classIconOrange: "rgba(245,129,31,0.12)",
  classIconGreen: "rgba(76,175,80,0.12)",
  classIconBlue: "rgba(33,150,243,0.12)",
  classIconPurple: "rgba(156,39,176,0.12)",

  yellowSoft: "#FEF3C7",
  greenSoft: "rgba(76,175,80,0.12)",
  orangeSoft: "rgba(245,129,31,0.12)",
  blueSoft: "rgba(33,150,243,0.12)",
  purpleSoft: "rgba(156,39,176,0.12)",
  pinkSoft: "rgba(233,30,99,0.12)",
  graySoft: "#F5F5F5",

  chipYellow: "#FEF3C7",
  chipGreen: "rgba(76,175,80,0.12)",
  chipOrange: "rgba(245,129,31,0.12)",
  chipBlue: "rgba(33,150,243,0.12)",
  chipPurple: "rgba(156,39,176,0.12)",
  chipPink: "rgba(233,30,99,0.12)",

  statusCaptured: "#287F79",
  statusCapturedBg: "rgba(76,175,80,0.12)",
  statusPending: "#C96948",
  statusPendingBg: "rgba(245,129,31,0.12)",

  progressRingGreen: "#287F79",
  progressRingOrange: "#C96948",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerBorder: "#FECACA",

  darkBlue: "#694B72",
  cameraBg: "#56477A",
  overlay: "rgba(79,65,119,0.40)",
  overlayHeavy: "rgba(79,65,119,0.60)",

  tabInactive: "#9CA3AF",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#C96948",
} as const;

/** ID Cards header — same green as Home "ID Solutions" text. */
export const idCardsHeaderGradient = [
  colors.brandGreen,
  colors.brandGreenLight,
] as const;

/** Primary header: 135deg #E69C75 → #C96948 */
export const headerGradient = [
  colors.headerOrangeStart,
  colors.headerOrangeMid,
] as const;

export const fabGradient = [
  colors.headerOrangeStart,
  colors.headerOrangeMid,
] as const;

export const primaryGradient = [
  colors.headerOrangeStart,
  colors.primaryOrange,
  colors.submitGreen,
] as const;

export const orangeButtonGradient = [
  colors.headerOrangeStart,
  colors.primaryOrange,
] as const;

/** Submit CTA: #C96948 → #44978B */
export const submitGradient = [
  colors.primaryOrange,
  colors.submitGreen,
] as const;

export const loginGradient = [
  colors.brandGreenLight,
  colors.green,
] as const;

export const splashGradient = [
  colors.softGreen,
  colors.green,
  colors.primaryOrange,
] as const;

/**
 * Spacing — 8px base grid, width-scaled for small/large phones.
 */
export const spacing = {
  xxs: s(4),
  xs: s(8),
  sm: s(12),
  md: s(16),
  lg: s(20),
  xl: s(24),
  xxl: s(24),
  pagePad: s(20),
  cardGap: s(12),
  sectionGap: s(24),
  fieldGap: s(12),
  labelGap: s(8),
  iconTextGap: s(14),
  sectionDividerAbove: s(24),
  sectionDividerBelow: s(16),
  headerHeight: s(96),
  navHeight: s(64),
  buttonHeight: s(54),
  chipSize: s(44),
  fabSize: s(56),
  fabLift: s(8),
  iconSm: s(32),
  iconMd: s(40),
  iconLg: s(48),
  avatarSm: s(52),
  avatarMd: s(80),
  avatarLg: s(112),
  progress: s(6),
};

export const radius = {
  sm: s(12),
  md: s(14),
  lg: s(16),
  xl: s(24),
  card: s(22),
  chip: s(12),
  buttonPill: s(25),
  full: 999,
} as const;

/** Card: soft shadow preferred over heavy border */
export const cardShadow = {
  elevation: 2,
  shadowColor: "#997B8E",
  shadowOpacity: 0.10,
  shadowRadius: s(8),
  shadowOffset: { width: 0, height: s(2) },
} as const;

export type ColorToken = keyof typeof colors;
