/**
 * Admin panel tokens matching the Harsha ID Solutions dashboard mockup.
 */
export const colors = {
  darkBlue: "#1E3A8A",
  sidebar: "#FFFFFF",
  sidebarHover: "#F8FAFC",
  buttonBlue: "#2563EB",
  buttonBlueHover: "#1D4ED8",
  accentBlue: "#3B82F6",
  activeNav: "#FFEDD5",
  headerFrom: "#FFFFFF",
  headerTo: "#FFFFFF",
  primaryOrange: "#F97316",
  accentPurple: "#7C3AED",
  accentPink: "#DB2777",
  accentTeal: "#0D9488",
  white: "#FFFFFF",
  contentBg: "#F5F7FB",
  cardBg: "#FFFFFF",
  text: "#334155",
  textNavy: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  inputBg: "#FFFFFF",
  danger: "#DC2626",
  dangerSoft: "#FEF2F2",
  dangerBorder: "#FECACA",
  overlay: "rgba(15, 23, 42, 0.4)",
} as const;

export const harshaLetterColors = [
  "#E53935",
  "#FB8C00",
  "#FDD835",
  "#43A047",
  "#1E88E5",
  "#8E24AA",
] as const;

export type ColorToken = keyof typeof colors;
