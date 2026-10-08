/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand
  primaryOrange: "#D66A32",
  warmOrange: "#ED8650",
  yellow: "#FACC15",
  softYellow: "#FEF3C7",
  green: "#168B86",
  successGreen: "#168B86",
  submitGreen: "#25A59C",
  softGreen: "rgba(76,175,80,0.12)",
  blue: "#487DCA",
  softBlue: "rgba(33,150,243,0.12)",
  purple: "#8A64C7",
  softPurple: "rgba(156,39,176,0.12)",
  pink: "#C95E8C",
  softPink: "rgba(233,30,99,0.12)",

  background: "#F5F6FC",
  surface: "#FFFFFF",
  text: "#50548D",
  textPrimary: "#50548D",
  textSecondary: "#6C718D",
  textBody: "#566482",
  textPlaceholder: "#787F99",
  border: "#DFE4F1",

  // Header / gradients
  headerOrangeStart: "#7370D5",
  headerOrangeMid: "#548FC5",
  headerYellowEnd: "#D66A32",

  brandOrange: "#D66A32",
  brandOrangeLight: "#ED8650",
  brandGreen: "#168B86",
  brandGreenLight: "#25A59C",
  brandGreenDark: "#167D79",
  brandGreenDeep: "#126A68",
  brandNavy: "#50548D",
  brandBlue: "#487DCA",

  splashGreen: "#168B86",
  splashGreenLight: "#25A59C",
  splashGreenPale: "rgba(76,175,80,0.12)",
  splashOrange: "#D66A32",
  splashOrangeDeep: "#E06B10",
  splashYellow: "#FACC15",

  gradientStart: "#ED8650",
  gradientMid: "#D66A32",
  gradientEnd: "#25A59C",

  royalGreen: "#168B86",
  parrotGreen: "#25A59C",

  orangeDark: "#E06B10",
  orangeDeep: "#C45A12",
  offerOrange: "#D66A32",
  tabActive: "#D66A32",

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: "#F5F6FC",
  inputBg: "#FFFFFF",
  borderLight: "#DFE4F1",
  track: "#DFE4F1",

  textMuted: "#6C718D",
  textSubtle: "#787F99",
  textNav: "#50548D",

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

  statusCaptured: "#168B86",
  statusCapturedBg: "rgba(76,175,80,0.12)",
  statusPending: "#D66A32",
  statusPendingBg: "rgba(245,129,31,0.12)",

  progressRingGreen: "#168B86",
  progressRingOrange: "#D66A32",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerBorder: "#FECACA",

  darkBlue: "#50548D",
  cameraBg: "#56477A",
  overlay: "rgba(79,65,119,0.40)",
  overlayHeavy: "rgba(79,65,119,0.60)",

  tabInactive: "#9CA3AF",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#D66A32",
} as const;

/** ID Cards header — same green as Home "ID Solutions" text. */
export const idCardsHeaderGradient = [
  colors.brandGreen,
  colors.brandGreenLight,
] as const;

/** Primary header: 135deg #ED8650 → #D66A32 */
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

/** Submit CTA: #D66A32 → #25A59C */
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
  shadowColor: "#7775B8",
  shadowOpacity: 0.10,
  shadowRadius: s(8),
  shadowOffset: { width: 0, height: s(2) },
} as const;

export type ColorToken = keyof typeof colors;
