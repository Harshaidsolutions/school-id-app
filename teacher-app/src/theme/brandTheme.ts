/**
 * Brand themes — every colour in the app is derived from ONE of these sets.
 * Switch the whole app's look by changing ACTIVE_THEME.
 *
 * primary  : headers, buttons, links, active tabs
 * accent   : highlights (progress, badges, FAB, pending)
 * header   : gradient used by every coloured header (two analogous hues = modern look)
 * glowA/B  : soft background glows behind pages
 */
export type BrandTheme = {
  name: string;
  primary: string;
  primaryLight: string;
  primaryDeep: string;
  accent: string;
  accentLight: string;
  accentDeep: string; // accent dark enough for text on white
  onAccent: string; // icon/text colour on accent fills
  header: readonly [string, string, string];
  background: string;
  ink: string; // main text
  glowA: string;
  glowB: string;
  headingFont: "Outfit" | "Poppins";
};

export const THEMES = {
  aurora: {
    name: "Aurora",
    primary: "#6D5DFC", primaryLight: "#8B7CFF", primaryDeep: "#4F46E5",
    accent: "#38BDF8", accentLight: "#7DD3FC", accentDeep: "#0284C7", onAccent: "#082F49",
    header: ["#8B5CF6", "#6D5DFC", "#3B82F6"],
    background: "#F6F5FF", ink: "#1E1B4B", glowA: "#A78BFA", glowB: "#7DD3FC",
    headingFont: "Poppins",
  },
  sunset: {
    name: "Sunset",
    primary: "#F05A5E", primaryLight: "#FF8A65", primaryDeep: "#D9434B",
    accent: "#7C5CFC", accentLight: "#A78BFA", accentDeep: "#6D28D9", onAccent: "#FFFFFF",
    header: ["#FF9A62", "#F96B5F", "#EC4F6C"],
    background: "#FFF7F3", ink: "#2A1B2E", glowA: "#FDBA74", glowB: "#F9A8D4",
    headingFont: "Outfit",
  },
  ocean: {
    name: "Ocean",
    primary: "#0EA5E9", primaryLight: "#38BDF8", primaryDeep: "#0284C7",
    accent: "#F97316", accentLight: "#FDBA74", accentDeep: "#C2410C", onAccent: "#FFFFFF",
    header: ["#22D3EE", "#0EA5E9", "#3B82F6"],
    background: "#F2F9FD", ink: "#0B2537", glowA: "#7DD3FC", glowB: "#C4B5FD",
    headingFont: "Outfit",
  },
  blossom: {
    name: "Blossom",
    primary: "#D6336C", primaryLight: "#F06595", primaryDeep: "#B02A5B",
    accent: "#5C7CFA", accentLight: "#91A7FF", accentDeep: "#3B5BDB", onAccent: "#FFFFFF",
    header: ["#F783AC", "#E64980", "#9775FA"],
    background: "#FFF6FA", ink: "#2B1530", glowA: "#FCC2D7", glowB: "#B197FC",
    headingFont: "Poppins",
  },
  electric: {
    name: "Electric",
    primary: "#3D5AFE", primaryLight: "#6C7CFF", primaryDeep: "#2A3FD6",
    accent: "#FF4D8D", accentLight: "#FF8FB6", accentDeep: "#D6336C", onAccent: "#FFFFFF",
    header: ["#5B6CFF", "#3D5AFE", "#7C3AED"],
    background: "#F5F6FF", ink: "#14183A", glowA: "#A5B4FC", glowB: "#F9A8D4",
    headingFont: "Outfit",
  },
  citrus: {
    name: "Citrus",
    primary: "#FF7A00", primaryLight: "#FFA040", primaryDeep: "#E06A00",
    accent: "#2F80ED", accentLight: "#6FA8F5", accentDeep: "#1F63C4", onAccent: "#FFFFFF",
    header: ["#FFB347", "#FF8A00", "#FF5E62"],
    background: "#FFF9F2", ink: "#2B1D0E", glowA: "#FFD8A8", glowB: "#A5D8FF",
    headingFont: "Poppins",
  },
} as const satisfies Record<string, BrandTheme>;

export type ThemeKey = keyof typeof THEMES;

/** ← Change this one value to restyle the whole app. */
export const ACTIVE_THEME: ThemeKey = "citrus";

export const BRAND: BrandTheme = THEMES[ACTIVE_THEME];

/** "#RRGGBB" + alpha (0–1) → "rgba(r,g,b,a)" */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
