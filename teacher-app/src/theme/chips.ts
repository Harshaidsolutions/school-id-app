import { colors } from "./colors";

export type ChipAccent = {
  bg: string;
  fg: string;
  key: "orange" | "blue";
};

/** Alternate: navy → amber (soft tint bg). */
export const chipAccents: readonly ChipAccent[] = [
  { key: "blue", bg: colors.chipBlue, fg: colors.brandBlue },
  { key: "orange", bg: colors.chipOrange, fg: colors.orangeDark },
] as const;

export function chipForIndex(index: number): ChipAccent {
  return chipAccents[index % chipAccents.length];
}
