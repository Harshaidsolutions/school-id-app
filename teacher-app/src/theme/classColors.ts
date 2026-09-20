import { colors } from "./colors";

/** Pastel square icon backgrounds for class rows (reference palette). */
export const classIconPalette = [
  { bg: colors.classIconYellow, fg: "#F9A825" },
  { bg: colors.classIconOrange, fg: colors.primaryOrange },
  { bg: colors.classIconGreen, fg: colors.brandGreenDark },
  { bg: colors.classIconBlue, fg: "#1976D2" },
  { bg: colors.classIconPurple, fg: "#7B1FA2" },
] as const;

export function classIconForIndex(index: number): {
  bg: string;
  fg: string;
  letter: string;
} {
  const palette = classIconPalette[index % classIconPalette.length];
  return { ...palette, letter: "" };
}

export function classIconLetter(classSection: string): string {
  const trimmed = classSection.trim();
  if (!trimmed) return "?";
  const first = trimmed.charAt(0).toUpperCase();
  if (/^\d/.test(trimmed)) return first;
  if (trimmed.length >= 3 && trimmed.slice(0, 3).toUpperCase() === "L.K") {
    return "L";
  }
  return first;
}
