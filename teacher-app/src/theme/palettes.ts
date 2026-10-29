/**
 * Light + dark palettes — same token keys so screens can swap via ThemeContext.
 * Brand orange/green accents stay consistent in both modes.
 */

import { colors } from "./colors";
import { BRAND } from "./brandTheme";
export const lightPalette = colors;

export type LightPalette = typeof lightPalette;
export type AppColors = { [K in keyof LightPalette]: string };

export const darkPalette: AppColors = {
  ...lightPalette,
  background: "#0B1220",
  surface: "rgba(19,28,46,0.88)",
  surfaceMuted: "#0B1220",
  inputBg: "#1A2438",
  text: "#F1F4F9",
  textPrimary: "#F1F4F9",
  textSecondary: "#AEB6C6",
  textBody: "#D3D9E4",
  textPlaceholder: "#7F889B",
  textMuted: "#AEB6C6",
  textSubtle: "#7F889B",
  textNav: "#F1F4F9",
  border: "#253049",
  borderLight: "#1E283D",
  track: "#253049",
  // Keep true white for icons/text on navy headers; cards use `surface`
  white: "#FFFFFF",
  graySoft: "#1A2438",
  tabBarBg: "#131C2E",
  tabInactive: "#7F889B",
  primaryOrange: BRAND.primaryLight,
  blue: BRAND.primaryLight,
  brandBlue: BRAND.primaryLight,
  tabActive: BRAND.accentLight,
  brandGreen: BRAND.primaryLight,
  sectionOrange: "#F1F4F9",
  offerOrange: "#FBBF24",
  orangeDark: "#FBBF24",
  statusCaptured: "#8FA9E6",
  statusPending: "#FBBF24",
  overlay: "rgba(3,7,16,0.6)",
  overlayHeavy: "rgba(3,7,16,0.78)",
  softYellow: "rgba(245,158,11,0.18)",
  yellowSoft: "rgba(245,158,11,0.18)",
  orangeSoft: "rgba(245,158,11,0.18)",
  pinkSoft: "rgba(245,158,11,0.18)",
  greenSoft: "rgba(110,140,214,0.16)",
  blueSoft: "rgba(110,140,214,0.16)",
  purpleSoft: "rgba(110,140,214,0.16)",
  chipYellow: "rgba(245,158,11,0.2)",
  chipOrange: "rgba(245,158,11,0.2)",
  chipPink: "rgba(245,158,11,0.2)",
  chipGreen: "rgba(110,140,214,0.18)",
  chipBlue: "rgba(110,140,214,0.18)",
  chipPurple: "rgba(110,140,214,0.18)",
  classIconYellow: "rgba(245,158,11,0.2)",
  classIconOrange: "rgba(245,158,11,0.2)",
  classIconGreen: "rgba(110,140,214,0.18)",
  classIconBlue: "rgba(110,140,214,0.18)",
  classIconPurple: "rgba(110,140,214,0.18)",
  statusCapturedBg: "rgba(110,140,214,0.2)",
  statusPendingBg: "rgba(245,158,11,0.2)",
  dangerSoft: "rgba(200,50,63,0.2)",
  dangerBorder: "rgba(200,50,63,0.4)",
  brandNavy: "#F1F4F9",
  darkBlue: "#F1F4F9",
};
