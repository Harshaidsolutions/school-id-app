/**
 * Same look as the admin website (myschoolidcard.in): indigo brand (#4F46E5) with a
 * purple gradient, rose accent, lavender page background and Plus Jakarta Sans text.
 * Token names are kept so every screen picks the website colours automatically.
 */
/**
 * Same look as harshaidsolutions.in: white cards on a soft page, deep-ink text,
 * purple brand, sky → purple headers, warm orange → red buttons and the six-colour
 * logo strip. Poppins headings + Inter body (bundled in assets/fonts).
 * Token names are kept so every screen picks the new colours automatically.
 */
export const C = {
  primary: "#6A2C9E",
  primaryLight: "#8E4FC4",
  primaryDeep: "#521F7C",
  primarySoft: "#F3EDFA",
  accent: "#1EA0E1",
  accentDeep: "#1582BA",
  accentSoft: "#E6F5FC",
  rose: "#E8243C",
  roseSoft: "#FDECEE",
  bg: "#F6F7FC",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  ink: "#1B1F3B",
  text: "#41466B",
  muted: "#6B7090",
  faint: "#A3A7C2",
  line: "#E8E9F3",
  lineStrong: "#DCDDEB",
  success: "#16A34A",
  successSoft: "#E8F7EE",
  danger: "#E8243C",
  dangerSoft: "#FDECEE",
  warning: "#F26A1B",
  warningSoft: "#FFF1E8",
  purple: "#6A2C9E",
  purpleSoft: "#F3EDFA",
  teal: "#1EA0E1",
  tealSoft: "#E6F5FC",
  orange: "#F26A1B",
  amber: "#FBB316",
  glowA: "#BDE3F7",
  glowB: "#E9D8F7",
  white: "#FFFFFF",
  overlay: "rgba(27,31,59,0.5)",
};

/** Website "cool" gradient (sky → purple) for page headers. */
export const headerGradient = ["#1EA0E1", "#4A63C4", "#6A2C9E"] as const;
/** Website call-to-action gradient (orange → red) for main buttons. */
export const primaryGradient = ["#FF8A1F", "#F26A1B", "#E8243C"] as const;
export const accentGradient = ["#FF8A1F", "#F26A1B", "#E8243C"] as const;
/** The six logo-tile colours (website top bar). */
export const RAINBOW = ["#E8243C", "#1EA0E1", "#B9B51F", "#6A2C9E", "#F26A1B", "#FBB316"] as const;

export const F = {
  h: "Poppins_700Bold",
  hSemi: "Poppins_600SemiBold",
  hMed: "Poppins_500Medium",
  hX: "Poppins_800ExtraBold",
  body: "Inter_400Regular",
  bodyMed: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
};

export const R = { sm: 10, md: 12, lg: 16, xl: 22, pill: 999 };
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const shadow = {
  shadowColor: "#1B1F3B",
  shadowOpacity: 0.12,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

export const softShadow = {
  shadowColor: "#1B1F3B",
  shadowOpacity: 0.07,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
} as const;

/** Same soft tile colours as the website dashboard cards. */
export const tones = {
  orange: { bg: "#FFF1E8", fg: "#F26A1B" },
  blue: { bg: "#E6F5FC", fg: "#1582BA" },
  green: { bg: "#E8F7EE", fg: "#16A34A" },
  red: { bg: "#FDECEE", fg: "#E8243C" },
  purple: { bg: "#F3EDFA", fg: "#6A2C9E" },
  teal: { bg: "#E6F5FC", fg: "#1EA0E1" },
  amber: { bg: "#FFF7E0", fg: "#B7790A" },
  grey: { bg: "#F6F7FC", fg: "#6B7090" },
} as const;
export type Tone = keyof typeof tones;

/** Content uses the full screen width (no centred column with empty sides). */
export const CONTENT_MAX = 4000;
