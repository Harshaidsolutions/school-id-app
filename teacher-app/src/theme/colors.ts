/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand
  primaryOrange: "#7650ED",
  warmOrange: "#9C7BFF",
  yellow: "#FACC15",
  softYellow: "#FEF3C7",
  green: "#5869E8",
  successGreen: "#5869E8",
  submitGreen: "#7B5FF1",
  softGreen: "rgba(76,175,80,0.12)",
  blue: "#487DCA",
  softBlue: "rgba(33,150,243,0.12)",
  purple: "#8A64C7",
  softPurple: "rgba(156,39,176,0.12)",
  pink: "#C95E8C",
  softPink: "rgba(233,30,99,0.12)",

  background: "#F6F7FC",
  surface: "#FFFFFF",
  text: "#34334F",
  textPrimary: "#34334F",
  textSecondary: "#74758F",
  textBody: "#5F607C",
  textPlaceholder: "#85869D",
  border: "#E5E3F3",

  // Header / gradients
  headerOrangeStart: "#5975FF",
  headerOrangeMid: "#8B45F6",
  headerYellowEnd: "#7650ED",

  brandOrange: "#7650ED",
  brandOrangeLight: "#9C7BFF",
  brandGreen: "#5869E8",
  brandGreenLight: "#7B5FF1",
  brandGreenDark: "#167D79",
  brandGreenDeep: "#126A68",
  brandNavy: "#34334F",
  brandBlue: "#487DCA",

  splashGreen: "#5869E8",
  splashGreenLight: "#7B5FF1",
  splashGreenPale: "rgba(76,175,80,0.12)",
  splashOrange: "#7650ED",
  splashOrangeDeep: "#E06B10",
  splashYellow: "#FACC15",

  gradientStart: "#9C7BFF",
  gradientMid: "#7650ED",
  gradientEnd: "#7B5FF1",

  royalGreen: "#5869E8",
  parrotGreen: "#7B5FF1",

  orangeDark: "#E06B10",
  orangeDeep: "#C45A12",
  offerOrange: "#7650ED",
  tabActive: "#7650ED",

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: "#F6F7FC",
  inputBg: "#FFFFFF",
  borderLight: "#E5E3F3",
  track: "#E5E3F3",

  textMuted: "#74758F",
  textSubtle: "#85869D",
  textNav: "#34334F",

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

  statusCaptured: "#168B76",
  statusCapturedBg: "rgba(76,175,80,0.12)",
  statusPending: "#BE751F",
  statusPendingBg: "rgba(245,129,31,0.12)",

  progressRingGreen: "#5869E8",
  progressRingOrange: "#7650ED",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerBorder: "#FECACA",

  darkBlue: "#34334F",
  cameraBg: "#56477A",
  overlay: "rgba(79,65,119,0.40)",
  overlayHeavy: "rgba(79,65,119,0.60)",

  tabInactive: "#73778E",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#7650ED",
} as const;

/** ID Cards header — same green as Home "ID Solutions" text. */
export const idCardsHeaderGradient = [
  colors.brandGreen,
  colors.brandGreenLight,
] as const;

/** Primary header: 135deg #9C7BFF → #7650ED */
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

/** Submit CTA: #7650ED → #7B5FF1 */
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
  card: s(24),
  chip: s(12),
  buttonPill: s(25),
  full: 999,
} as const;

/** Card: soft shadow preferred over heavy border */
export const cardShadow = {
  elevation: 2,
  shadowColor: "#7961CC",
  shadowOpacity: 0.09,
  shadowRadius: s(12),
  shadowOffset: { width: 0, height: s(2) },
} as const;

export type ColorToken = keyof typeof colors;
