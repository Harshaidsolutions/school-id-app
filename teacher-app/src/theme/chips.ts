import { colors } from "./colors";

export type ChipAccent = {
  bg: string;
  fg: string;
  key: "orange" | "green" | "blue" | "purple" | "pink";
};

/** Rotate: orange → green → blue → purple → pink (12% tint bg). */
export const chipAccents: readonly ChipAccent[] = [
  { key: "orange", bg: colors.chipOrange, fg: colors.primaryOrange },
  { key: "green", bg: colors.chipGreen, fg: colors.brandGreen },
  { key: "blue", bg: colors.chipBlue, fg: colors.brandBlue },
  { key: "purple", bg: colors.chipPurple, fg: colors.purple },
  { key: "pink", bg: colors.chipPink, fg: colors.pink },
] as const;

export function chipForIndex(index: number): ChipAccent {
  return chipAccents[index % chipAccents.length];
}
