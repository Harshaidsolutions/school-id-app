/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";

export const colors = {
  // Brand — bright Blue + Amber on white (two light, friendly colours).
  // Token names are kept for compatibility; values define the look.
  primaryOrange: "#2563EB",
  warmOrange: "#3B82F6",
  yellow: "#F59E0B",
  softYellow: "rgba(245,158,11,0.14)",
  green: "#2563EB",
  successGreen: "#2563EB",
  submitGreen: "#3B82F6",
  softGreen: "rgba(37,99,235,0.08)",
  blue: "#2563EB",
  softBlue: "rgba(37,99,235,0.08)",
  purple: "#3B82F6",
  softPurple: "rgba(37,99,235,0.08)",
  pink: "#C2690A",
  softPink: "rgba(245,158,11,0.14)",

  background: "#F8FAFC",
  surface: "#FFFFFF",
  text: "#1E293B",
  textPrimary: "#1E293B",
  textSecondary: "#64748B",
  textBody: "#334155",
  textPlaceholder: "#94A3B8",
  border: "#E2E8F0",

  // Header / gradients
  headerOrangeStart: "#2563EB",
  headerOrangeMid: "#1D4ED8",
  headerYellowEnd: "#F59E0B",

  brandOrange: "#F59E0B",
  brandOrangeLight: "#FBBF24",
  brandGreen: "#2563EB",
  brandGreenLight: "#3B82F6",
  brandGreenDark: "#2563EB",
  brandGreenDeep: "#1D4ED8",
  brandNavy: "#1E293B",
  brandBlue: "#2563EB",

  splashGreen: "#2563EB",
  splashGreenLight: "#3B82F6",
  splashGreenPale: "rgba(37,99,235,0.08)",
  splashOrange: "#F59E0B",
  splashOrangeDeep: "#B45309",
  splashYellow: "#FBBF24",

  gradientStart: "#3B82F6",
  gradientMid: "#2563EB",
  gradientEnd: "#1D4ED8",

  royalGreen: "#2563EB",
  parrotGreen: "#3B82F6",

  orangeDark: "#C2690A",
  orangeDeep: "#92400E",
  offerOrange: "#C2690A",
  tabActive: "#2563EB",

  whatsappGreen: "#2563EB",

  white: "#FFFFFF",
  surfaceMuted: "#F8FAFC",
  inputBg: "#F8FAFC",
  borderLight: "#EEF2F7",
  track: "#E2E8F0",

  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  textNav: "#1E293B",

  classIconYellow: "rgba(245,158,11,0.14)",
  classIconOrange: "rgba(245,158,11,0.14)",
  classIconGreen: "rgba(37,99,235,0.08)",
  classIconBlue: "rgba(37,99,235,0.08)",
  classIconPurple: "rgba(37,99,235,0.08)",

  yellowSoft: "rgba(245,158,11,0.14)",
  greenSoft: "rgba(37,99,235,0.08)",
  orangeSoft: "rgba(245,158,11,0.14)",
  blueSoft: "rgba(37,99,235,0.08)",
  purpleSoft: "rgba(37,99,235,0.08)",
  pinkSoft: "rgba(245,158,11,0.14)",
  graySoft: "#F1F5F9",

  chipYellow: "rgba(245,158,11,0.14)",
  chipGreen: "rgba(37,99,235,0.08)",
  chipOrange: "rgba(245,158,11,0.14)",
  chipBlue: "rgba(37,99,235,0.08)",
  chipPurple: "rgba(37,99,235,0.08)",
  chipPink: "rgba(245,158,11,0.14)",

  statusCaptured: "#2563EB",
  statusCapturedBg: "rgba(37,99,235,0.08)",
  statusPending: "#C2690A",
  statusPendingBg: "rgba(245,158,11,0.14)",

  progressRingGreen: "#2563EB",
  progressRingOrange: "#F59E0B",

  danger: "#C8323F",
  dangerSoft: "#FCEBEC",
  dangerBorder: "#F5C6CB",

  darkBlue: "#1E293B",
  cameraBg: "#1D4ED8",
  overlay: "rgba(15,23,42,0.40)",
  overlayHeavy: "rgba(15,23,42,0.62)",

  tabInactive: "#94A3B8",
  tabBarBg: "#FFFFFF",
  sectionOrange: "#2563EB",
} as const;

/** ID Cards flow header — same blue family as the main header. */
export const idCardsHeaderGradient = [
  "#3B82F6",
  colors.headerOrangeStart,
] as const;

/** Primary header: blue → bright blue */
export const headerGradient = [
  "#3B82F6",
  colors.headerOrangeStart,
] as const;

/** Floating action: amber */
export const fabGradient = [
  "#FBBF24",
  "#F59E0B",
] as const;

export const primaryGradient = [
  colors.warmOrange,
  colors.primaryOrange,
] as const;

/** Main buttons: blue */
export const orangeButtonGradient = [
  colors.warmOrange,
  colors.primaryOrange,
] as const;

/** Submit / confirm CTA: blue */
export const submitGradient = [
  colors.warmOrange,
  colors.primaryOrange,
] as const;

export const loginGradient = [
  colors.primaryOrange,
  colors.headerOrangeMid,
] as const;

export const splashGradient = [
  colors.primaryOrange,
  colors.headerOrangeMid,
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
  lg: s(18),
  xl: s(28),
  card: s(22),
  chip: s(12),
  buttonPill: s(18),
  full: 999,
} as const;

/** Card: soft shadow preferred over heavy border */
export const cardShadow = {
  elevation: 3,
  shadowColor: "#2563EB",
  shadowOpacity: 0.07,
  shadowRadius: s(16),
  shadowOffset: { width: 0, height: s(6) },
} as const;

export type ColorToken = keyof typeof colors;
