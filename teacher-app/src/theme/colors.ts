/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand
  primaryOrange: "#F58A42",
  warmOrange: "#FFB784",
  yellow: "#FACC15",
  softYellow: "#FEF3C7",
  green: "#128C58",
  successGreen: "#128C58",
  submitGreen: "#20B977",
  softGreen: "rgba(76,175,80,0.12)",
  blue: "#487DCA",
  softBlue: "rgba(33,150,243,0.12)",
  purple: "#8668C6",
  softPurple: "rgba(156,39,176,0.12)",
  pink: "#DB6593",
  softPink: "rgba(233,30,99,0.12)",

  background: "#F7FBF8",
  surface: "#FFFFFF",
  text: "#183B35",
  textPrimary: "#183B35",
  textSecondary: "#58736B",
  textBody: "#3C6258",
  textPlaceholder: "#829A91",
  border: "#E0EEE5",

  // Header / gradients
  headerOrangeStart: "#0D8655",
  headerOrangeMid: "#2BB978",
  headerYellowEnd: "#F58A42",

  brandOrange: "#F58A42",
  brandOrangeLight: "#FFB784",
  brandGreen: "#128C58",
  brandGreenLight: "#20B977",
  brandGreenDark: "#08784B",
  brandGreenDeep: "#075E41",
  brandNavy: "#183B35",
  brandBlue: "#487DCA",

  splashGreen: "#128C58",
  splashGreenLight: "#20B977",
  splashGreenPale: "rgba(76,175,80,0.12)",
  splashOrange: "#F58A42",
  splashOrangeDeep: "#E06B10",
  splashYellow: "#FACC15",

  gradientStart: "#FFB784",
  gradientMid: "#F58A42",
  gradientEnd: "#20B977",

  royalGreen: "#128C58",
  parrotGreen: "#20B977",

  orangeDark: "#E06B10",
  orangeDeep: "#C45A12",
  offerOrange: "#F58A42",
  tabActive: "#F58A42",

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: "#F7FBF8",
  inputBg: "#FFFFFF",
  borderLight: "#E0EEE5",
  track: "#E0EEE5",

  textMuted: "#58736B",
  textSubtle: "#829A91",
  textNav: "#183B35",

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

  statusCaptured: "#128C58",
  statusCapturedBg: "rgba(76,175,80,0.12)",
  statusPending: "#F58A42",
  statusPendingBg: "rgba(245,129,31,0.12)",

  progressRingGreen: "#128C58",
  progressRingOrange: "#F58A42",

  danger: "#EF4444",
  dangerSoft: "#FEE2E2",
  dangerBorder: "#FECACA",

  darkBlue: "#183B35",
  cameraBg: "#163F34",
  overlay: "rgba(79,65,119,0.40)",
  overlayHeavy: "rgba(79,65,119,0.60)",

  tabInactive: "#9CA3AF",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#F58A42",
} as const;

/** ID Cards header — same green as Home "ID Solutions" text. */
export const idCardsHeaderGradient = [
  colors.brandGreen,
  colors.brandGreenLight,
] as const;

/** Primary header: 135deg #FFB784 → #F58A42 */
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

/** Submit CTA: #F58A42 → #20B977 */
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
  shadowColor: "#207A56",
  shadowOpacity: 0.10,
  shadowRadius: s(8),
  shadowOffset: { width: 0, height: s(2) },
} as const;

export type ColorToken = keyof typeof colors;
