/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand
  primaryOrange: "#F5811F",
  warmOrange: "#FF8C1A",
  yellow: "#FACC15",
  softYellow: "#FEF3C7",
  green: "#4CAF50",
  successGreen: "#4CAF50",
  submitGreen: "#6FCF57",
  softGreen: "rgba(76,175,80,0.12)",
  blue: "#2196F3",
  softBlue: "rgba(33,150,243,0.12)",
  purple: "#9C27B0",
  softPurple: "rgba(156,39,176,0.12)",
  pink: "#E91E63",
  softPink: "rgba(233,30,99,0.12)",

  background: "#FAF8F5",
  surface: "#FFFFFF",
  text: "#45468C",
  textPrimary: "#45468C",
  textSecondary: "#8A8F98",
  textBody: "#485989",
  textPlaceholder: "#B0B4BA",
  border: "#F0F0F0",

  // Header / gradients
  headerOrangeStart: "#FF8C1A",
  headerOrangeMid: "#F5811F",
  headerYellowEnd: "#F5811F",

  brandOrange: "#F5811F",
  brandOrangeLight: "#FF8C1A",
  brandGreen: "#4CAF50",
  brandGreenLight: "#6FCF57",
  brandGreenDark: "#388E3C",
  brandGreenDeep: "#2E7D32",
  brandNavy: "#45468C",
  brandBlue: "#2196F3",

  splashGreen: "#4CAF50",
  splashGreenLight: "#6FCF57",
  splashGreenPale: "rgba(76,175,80,0.12)",
  splashOrange: "#F5811F",
  splashOrangeDeep: "#E06B10",
  splashYellow: "#FACC15",

  gradientStart: "#FF8C1A",
  gradientMid: "#F5811F",
  gradientEnd: "#6FCF57",

  royalGreen: "#4CAF50",
  parrotGreen: "#6FCF57",

  orangeDark: "#E06B10",
  orangeDeep: "#C45A12",
  offerOrange: "#F5811F",
  tabActive: "#F5811F",

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: "#FAF8F5",
  inputBg: "#FFFFFF",
  borderLight: "#F0F0F0",
  track: "#F0F0F0",

  textMuted: "#8A8F98",
  textSubtle: "#B0B4BA",
  textNav: "#45468C",

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

  statusCaptured: "#4CAF50",
  statusCapturedBg: "rgba(76,175,80,0.12)",
  statusPending: "#F5811F",
  statusPendingBg: "rgba(245,129,31,0.12)",

  progressRingGreen: "#4CAF50",
  progressRingOrange: "#F5811F",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerBorder: "#FECACA",

  darkBlue: "#45468C",
  cameraBg: "#3D2817",
  overlay: "rgba(26,34,51,0.45)",
  overlayHeavy: "rgba(26,34,51,0.6)",

  tabInactive: "#9CA3AF",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#F5811F",
} as const;

/** ID Cards header — same green as Home "ID Solutions" text. */
export const idCardsHeaderGradient = [
  colors.brandGreen,
  colors.brandGreenLight,
] as const;

/** Primary header: 135deg #FF8C1A → #F5811F */
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

/** Submit CTA: #F5811F → #6FCF57 */
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
  pagePad: s(16),
  cardGap: s(8),
  sectionGap: s(16),
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
  card: s(16),
  chip: s(12),
  buttonPill: s(25),
  full: 999,
} as const;

/** Card: soft shadow preferred over heavy border */
export const cardShadow = {
  elevation: 2,
  shadowColor: "#000000",
  shadowOpacity: 0.04,
  shadowRadius: s(8),
  shadowOffset: { width: 0, height: s(2) },
} as const;

export type ColorToken = keyof typeof colors;
