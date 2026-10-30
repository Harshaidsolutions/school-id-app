/**
 * Citrus theme (same family as the teacher app): warm orange + calm blue,
 * Poppins headings, Inter body text, soft glass cards on a warm background.
 */
export const C = {
  primary: "#FF7A00",
  primaryLight: "#FFA040",
  primaryDeep: "#E06A00",
  primarySoft: "#FFF1E3",
  accent: "#2F80ED",
  accentDeep: "#1F63C4",
  accentSoft: "#EAF2FE",
  bg: "#FFF9F2",
  surface: "rgba(255,255,255,0.92)",
  card: "#FFFFFF",
  ink: "#2B1D0E",
  text: "#4A3B2C",
  muted: "#8A7B6B",
  faint: "#B9AC9E",
  line: "#F0E4D6",
  lineStrong: "#E4D3C0",
  success: "#16A34A",
  successSoft: "#E8F7EE",
  danger: "#DC2626",
  dangerSoft: "#FDECEC",
  warning: "#D97706",
  warningSoft: "#FFF4DE",
  purple: "#7C5CFC",
  purpleSoft: "#F1EDFF",
  teal: "#0D9488",
  tealSoft: "#E3F6F4",
  glowA: "#FFD8A8",
  glowB: "#A5D8FF",
  white: "#FFFFFF",
  overlay: "rgba(43,29,14,0.45)",
};

export const headerGradient = ["#FFB347", "#FF8A00", "#FF5E62"] as const;
export const primaryGradient = ["#FFA040", "#FF7A00", "#E06A00"] as const;
export const accentGradient = ["#6FA8F5", "#2F80ED", "#1F63C4"] as const;

export const F = {
  h: "Poppins_700Bold",
  hSemi: "Poppins_600SemiBold",
  hMed: "Poppins_500Medium",
  hX: "Poppins_800ExtraBold",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
};

export const R = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = {
  shadowColor: "#B4692A",
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

export const softShadow = {
  shadowColor: "#B4692A",
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

/** Tone palettes for chips, stats and badges. */
export const tones = {
  orange: { bg: C.primarySoft, fg: C.primaryDeep },
  blue: { bg: C.accentSoft, fg: C.accentDeep },
  green: { bg: C.successSoft, fg: C.success },
  red: { bg: C.dangerSoft, fg: C.danger },
  purple: { bg: C.purpleSoft, fg: C.purple },
  teal: { bg: C.tealSoft, fg: C.teal },
  amber: { bg: C.warningSoft, fg: C.warning },
  grey: { bg: "#F3EEE8", fg: C.muted },
} as const;
export type Tone = keyof typeof tones;

export const CONTENT_MAX = 720;
