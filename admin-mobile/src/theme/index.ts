/**
 * Same look as the admin website (myschoolidcard.in): indigo brand (#4F46E5) with a
 * purple gradient, rose accent, lavender page background and Plus Jakarta Sans text.
 * Token names are kept so every screen picks the website colours automatically.
 */
export const C = {
  primary: "#4F46E5",
  primaryLight: "#6366F1",
  primaryDeep: "#4338CA",
  primarySoft: "#EEF0FF",
  accent: "#4F46E5",
  accentDeep: "#4338CA",
  accentSoft: "#EEF0FF",
  rose: "#F43F5E",
  roseSoft: "#FFF1F3",
  bg: "#F6F5FD",
  surface: "rgba(255,255,255,0.96)",
  card: "#FFFFFF",
  ink: "#1E1B4B",
  text: "#3D3A6B",
  muted: "#77759A",
  faint: "#A3A1C2",
  line: "#E6E4F5",
  lineStrong: "#D9D6FB",
  success: "#0D9488",
  successSoft: "#E6F7F5",
  danger: "#E11D48",
  dangerSoft: "#FFF1F3",
  warning: "#EA6A3B",
  warningSoft: "#FFF1EC",
  purple: "#7C3AED",
  purpleSoft: "#F3EEFF",
  teal: "#0D9488",
  tealSoft: "#E6F7F5",
  glowA: "#C7D2FE",
  glowB: "#E9D5FF",
  white: "#FFFFFF",
  overlay: "rgba(30,27,75,0.45)",
};

/** Website header / brand gradient (#5B50F0 → #7C3AED). */
export const headerGradient = ["#5B50F0", "#6A4BEF", "#7C3AED"] as const;
export const primaryGradient = ["#6366F1", "#4F46E5", "#4338CA"] as const;
/** Website accent gradient (rose). */
export const accentGradient = ["#FB7185", "#F43F5E", "#E11D48"] as const;

export const F = {
  h: "PlusJakartaSans_700Bold",
  hSemi: "PlusJakartaSans_600SemiBold",
  hMed: "PlusJakartaSans_500Medium",
  hX: "PlusJakartaSans_800ExtraBold",
  body: "PlusJakartaSans_400Regular",
  bodyMed: "PlusJakartaSans_500Medium",
  bodySemi: "PlusJakartaSans_600SemiBold",
};

export const R = { sm: 10, md: 12, lg: 16, xl: 22, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = {
  shadowColor: "#312E81",
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

export const softShadow = {
  shadowColor: "#312E81",
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

/** Same soft tile colours as the website dashboard cards. */
export const tones = {
  orange: { bg: "#EEF0FF", fg: "#4F46E5" },
  blue: { bg: "#EEF0FF", fg: "#4338CA" },
  green: { bg: "#E6F7F5", fg: "#0D9488" },
  red: { bg: "#FFF1F3", fg: "#E11D48" },
  purple: { bg: "#F3EEFF", fg: "#7C3AED" },
  teal: { bg: "#E6F7F5", fg: "#0D9488" },
  amber: { bg: "#FFF1EC", fg: "#EA6A3B" },
  grey: { bg: "#F7F7FC", fg: "#77759A" },
} as const;
export type Tone = keyof typeof tones;

/** Content uses the full screen width (no centred column with empty sides). */
export const CONTENT_MAX = 4000;
