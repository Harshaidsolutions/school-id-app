import { useWindowDimensions, type ViewStyle } from "react-native";
import { S } from "../theme";

/**
 * Responsive list grid: 1 column on phones, 2 on large phones in landscape / small
 * tablets, 3 on big tablets. Lists use the full screen width — no empty side gutters.
 */
export function useGrid() {
  const { width } = useWindowDimensions();
  const cols = width >= 1100 ? 3 : width >= 680 ? 2 : 1;
  const itemW = (width - S.lg * 2 - S.md * (cols - 1)) / cols;
  return {
    width,
    cols,
    item: (cols > 1 ? { width: itemW } : undefined) as ViewStyle | undefined,
    wrap: (cols > 1 ? { gap: S.md } : undefined) as ViewStyle | undefined,
  };
}

/** Tile columns for picture grids (templates, catalogue). */
export function tileCols(width: number) {
  return width >= 1100 ? 5 : width >= 880 ? 4 : width >= 600 ? 3 : 2;
}
