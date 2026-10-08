/**
 * Light + dark palettes — same token keys so screens can swap via ThemeContext.
 * Brand orange/green accents stay consistent in both modes.
 */

import { colors } from "./colors";
export const lightPalette = colors;

export type LightPalette = typeof lightPalette;
export type AppColors = { [K in keyof LightPalette]: string };

export const darkPalette: AppColors = {
  ...lightPalette,
  background: "#51457B",
  surface: "#63568F",
  surfaceMuted: "#51457B",
  inputBg: "#6A6097",
  text: "#F5F5F5",
  textPrimary: "#F5F5F5",
  textSecondary: "#E0DAF5",
  textBody: "#EAE6F8",
  textPlaceholder: "#DDD7F0",
  textMuted: "#E0DAF5",
  textSubtle: "#DDD7F0",
  textNav: "#F5F5F5",
  border: "#887DB2",
  borderLight: "#887DB2",
  track: "#887DB2",
  // Keep true white for icons/text on orange headers; cards use `surface`
  white: "#FFFFFF",
  graySoft: "#6A6097",
  tabBarBg: "#63568F",
  tabInactive: "#8A8F98",
  overlay: "rgba(68,46,112,0.55)",
  overlayHeavy: "rgba(68,46,112,0.7)",
  softYellow: "rgba(250,204,21,0.15)",
  yellowSoft: "rgba(250,204,21,0.15)",
  orangeSoft: "rgba(245,129,31,0.18)",
  greenSoft: "rgba(76,175,80,0.18)",
  blueSoft: "rgba(33,150,243,0.18)",
  purpleSoft: "rgba(156,39,176,0.18)",
  pinkSoft: "rgba(233,30,99,0.18)",
  chipYellow: "rgba(250,204,21,0.18)",
  chipOrange: "rgba(245,129,31,0.18)",
  chipGreen: "rgba(76,175,80,0.18)",
  chipBlue: "rgba(33,150,243,0.18)",
  chipPurple: "rgba(156,39,176,0.18)",
  chipPink: "rgba(233,30,99,0.18)",
  classIconYellow: "rgba(250,204,21,0.18)",
  classIconOrange: "rgba(245,129,31,0.18)",
  classIconGreen: "rgba(76,175,80,0.18)",
  classIconBlue: "rgba(33,150,243,0.18)",
  classIconPurple: "rgba(156,39,176,0.18)",
  statusCapturedBg: "rgba(76,175,80,0.22)",
  statusPendingBg: "rgba(245,129,31,0.22)",
  dangerSoft: "rgba(239,68,68,0.2)",
  dangerBorder: "rgba(239,68,68,0.4)",
  brandNavy: "#F5F5F5",
  darkBlue: "#F5F5F5",
};
