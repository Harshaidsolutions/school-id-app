/**
 * Design tokens — exact client typography/spacing/color spec.
 */
import { scale as s } from "./responsive";
import { BRAND, withAlpha } from "./brandTheme";

const P = BRAND;
const tintP = withAlpha(P.primary, 0.09);
const tintA = withAlpha(P.accent, 0.14);

export const colors = {
  // Brand — every value comes from the active theme in ./brandTheme.ts.
  // Token names are kept for compatibility; values define the look.
  primaryOrange: P.primary,
  warmOrange: P.primaryLight,
  yellow: P.accent,
  softYellow: tintA,
  green: P.primary,
  successGreen: P.primary,
  submitGreen: P.primaryLight,
  softGreen: tintP,
  blue: P.primary,
  softBlue: tintP,
  purple: P.primaryLight,
  softPurple: tintP,
  pink: P.accentDeep,
  softPink: tintA,

  background: P.background,
  // Glass cards: slightly see-through white over the soft page glow.
  surface: "rgba(255,255,255,0.86)",
  text: P.ink,
  textPrimary: P.ink,
  textSecondary: "#64748B",
  textBody: "#3F4660",
  textPlaceholder: "#98A0B3",
  border: withAlpha(P.primary, 0.12),

  // Header / gradients
  headerOrangeStart: P.primary,
  headerOrangeMid: P.primaryDeep,
  headerYellowEnd: P.accent,

  brandOrange: P.accent,
  brandOrangeLight: P.accentLight,
  brandGreen: P.primary,
  brandGreenLight: P.primaryLight,
  brandGreenDark: P.primary,
  brandGreenDeep: P.primaryDeep,
  brandNavy: P.ink,
  brandBlue: P.primary,

  splashGreen: P.primary,
  splashGreenLight: P.primaryLight,
  splashGreenPale: tintP,
  splashOrange: P.accent,
  splashOrangeDeep: P.accentDeep,
  splashYellow: P.accentLight,

  gradientStart: P.primaryLight,
  gradientMid: P.primary,
  gradientEnd: P.primaryDeep,

  royalGreen: P.primary,
  parrotGreen: P.primaryLight,

  orangeDark: P.accentDeep,
  orangeDeep: P.accentDeep,
  offerOrange: P.accentDeep,
  tabActive: P.primary,

  whatsappGreen: "#25D366",

  white: "#FFFFFF",
  surfaceMuted: P.background,
  inputBg: "#FFFFFF",
  borderLight: withAlpha(P.primary, 0.08),
  track: withAlpha(P.primary, 0.1),

  textMuted: "#64748B",
  textSubtle: "#98A0B3",
  textNav: P.ink,

  classIconYellow: tintA,
  classIconOrange: tintA,
  classIconGreen: tintP,
  classIconBlue: tintP,
  classIconPurple: tintP,

  yellowSoft: tintA,
  greenSoft: tintP,
  orangeSoft: tintA,
  blueSoft: tintP,
  purpleSoft: tintP,
  pinkSoft: tintA,
  graySoft: "#F1F3F9",

  chipYellow: tintA,
  chipGreen: tintP,
  chipOrange: tintA,
  chipBlue: tintP,
  chipPurple: tintP,
  chipPink: tintA,

  statusCaptured: P.primary,
  statusCapturedBg: tintP,
  statusPending: P.accentDeep,
  statusPendingBg: tintA,

  progressRingGreen: P.primary,
  progressRingOrange: P.accent,

  danger: "#E03E52",
  dangerSoft: "#FDECEE",
  dangerBorder: "#F8C7CE",

  darkBlue: P.ink,
  cameraBg: "#111827",
  overlay: "rgba(15,23,42,0.40)",
  overlayHeavy: "rgba(15,23,42,0.62)",

  tabInactive: "#98A0B3",
  tabBarBg: "#FFFFFF",
  sectionOrange: P.ink,
  onAccent: P.onAccent,
  glowA: P.glowA,
  glowB: P.glowB,
} as const;

/** ID Cards flow header — same gradient as every header. */
export const idCardsHeaderGradient = [...P.header] as unknown as readonly [string, string, string];

/** Primary header gradient (two analogous hues). */
export const headerGradient = [...P.header] as unknown as readonly [string, string, string];

/** Floating action: accent */
export const fabGradient = [P.accentLight, P.accent] as const;

export const primaryGradient = [P.primaryLight, P.primary, P.primaryDeep] as const;

/** Main buttons */
export const orangeButtonGradient = [P.primaryLight, P.primary] as const;

/** Submit / confirm CTA */
export const submitGradient = [P.primaryLight, P.primary, P.primaryDeep] as const;

export const loginGradient = [P.primary, P.primaryDeep] as const;

export const splashGradient = [P.primary, P.primaryDeep] as const;

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
/** Glass card: soft coloured shadow under a translucent white card. */
export const cardShadow = {
  elevation: 4,
  shadowColor: BRAND.primaryDeep,
  shadowOpacity: 0.1,
  shadowRadius: s(20),
  shadowOffset: { width: 0, height: s(8) },
} as const;

export type ColorToken = keyof typeof colors;
