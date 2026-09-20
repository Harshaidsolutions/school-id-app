import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import {
  gridItemWidth,
  hp,
  isLargePhone,
  isSmallPhone,
  scale,
  scaleFont,
  wp,
} from "../theme/responsive";

/**
 * Live layout metrics — recompute when window size changes (rotation, fold, etc.).
 */
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();

  return useMemo(
    () => ({
      width,
      height,
      isSmallPhone: isSmallPhone(),
      isLargePhone: isLargePhone(),
      scale: (size: number) => scale(size, width),
      wp: (percent: number) => wp(percent, width),
      hp: (percent: number) => hp(percent, height),
      scaleFont: (base: number, min: number, max?: number) =>
        scaleFont(base, min, max, width),
      contentWidth: wp(92, width),
      pagePad: scale(16, width),
      modalWidth: Math.min(wp(92, width), scale(420, width)),
      photoPreviewSize: (maxDp = 340) =>
        Math.min(width * 0.84, scale(maxDp, width)),
      gridColumns: (minColWidth = 148) => {
        const pad = scale(16, width);
        const gap = scale(8, width);
        const cols = Math.max(2, Math.floor((width - pad * 2 + gap) / (minColWidth + gap)));
        return Math.min(cols, width >= 430 ? 3 : 2);
      },
      gridItemWidth: (columns: number, pad = scale(16, width), gap = scale(8, width)) =>
        gridItemWidth(columns, pad, gap, width),
    }),
    [width, height]
  );
}
