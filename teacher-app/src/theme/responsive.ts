/**
 * Cross-device layout — single source of truth.
 *
 * Root cause of APK vs preview drift:
 * 1. moderateScale(factor 0.4) damped fonts/spacing while % widths tracked
 *    screen size 1:1 → elements drifted relative to each other.
 * 2. Scale was clamped (0.85–1.2), so small vs large phones did not share
 *    the same proportions.
 * 3. System font scale (Android Font size / Display size) grew text (sp)
 *    while boxes stayed put → wrapping/clipping differed per device.
 * 4. StyleSheet values mixed live % with frozen literals.
 *
 * Fix: linear width ratio vs 390dp design, live window size, bounded accessibility font scaling.
 * RN numbers are already density-independent (dp); fontSize is sp only when
 * allowFontScaling is true; allow up to 1.3× for accessibility.
 */
import { Dimensions, PixelRatio } from "react-native";

export const BASE_WIDTH = 390;
export const BASE_HEIGHT = 844;

/** Phone buckets used for scale checks (logical dp width). */
export const REFERENCE_WIDTHS = {
  smallAndroid: 360, // ~5.5" / Galaxy A-class
  iphoneSE: 375,
  pixel4a: 393,
  standard: 390, // ~6.1"
  pixel7: 412,
  iphone14: 390,
  largeAndroid: 428, // ~6.7" / Pixel 7 Pro class
  iphone14ProMax: 430,
} as const;

let cachedWidth = Dimensions.get("window").width || BASE_WIDTH;
let cachedHeight = Dimensions.get("window").height || BASE_HEIGHT;

function readWindow() {
  const { width, height } = Dimensions.get("window");
  if (width > 0) cachedWidth = width;
  if (height > 0) cachedHeight = height;
  return { width: cachedWidth, height: cachedHeight };
}

Dimensions.addEventListener("change", ({ window }) => {
  if (window.width > 0) cachedWidth = window.width;
  if (window.height > 0) cachedHeight = window.height;
});

export function windowSize() {
  return readWindow();
}

/**
 * Linear scale vs 390dp. Tablets (>480) cap so phones stay 1:1 proportional.
 */
export function scale(size: number, width = windowSize().width): number {
  const ratio = width / BASE_WIDTH;
  const applied = width >= 480 ? Math.min(ratio, 1.25) : ratio;
  return PixelRatio.roundToNearestPixel(size * applied);
}

/** Scaled font with readable floor/ceiling — prevents mid-word wrap via caller + adjustsFontSizeToFit. */
export function scaleFont(
  baseSize: number,
  minSize: number,
  maxSize?: number,
  width = windowSize().width
): number {
  const scaled = scale(baseSize, width);
  const max = maxSize ?? baseSize * 1.35;
  return PixelRatio.roundToNearestPixel(Math.max(minSize, Math.min(max, scaled)));
}

/** Ratio for Text minimumFontScale (min / design base at 390dp). */
export function fontScaleMin(baseSize: number, minSize: number): number {
  return Math.min(1, minSize / baseSize);
}

export function verticalScale(size: number, height = windowSize().height): number {
  return PixelRatio.roundToNearestPixel(size * (height / BASE_HEIGHT));
}

/** Same as scale — damping was the cross-device drift. */
export function moderateScale(
  size: number,
  _factor = 1,
  width = windowSize().width
): number {
  return scale(size, width);
}

export function wp(percent: number, width = windowSize().width): number {
  return PixelRatio.roundToNearestPixel((width * percent) / 100);
}

export function hp(percent: number, height = windowSize().height): number {
  return PixelRatio.roundToNearestPixel((height * percent) / 100);
}

export function gridItemWidth(
  columns: number,
  pad: number,
  gap: number,
  width = windowSize().width
): number {
  return PixelRatio.roundToNearestPixel(
    (width - pad * 2 - gap * (columns - 1)) / columns
  );
}

/** Responsive column count for card grids (2 on phones, 3 on large phones). */
export function gridColumns(
  width = windowSize().width,
  minColWidth = 148
): number {
  const pad = scale(16, width);
  const gap = scale(8, width);
  const cols = Math.floor((width - pad * 2 + gap) / (minColWidth + gap));
  if (width >= 430) return Math.max(2, Math.min(3, cols));
  return Math.max(2, Math.min(2, cols));
}

export function modalMaxWidth(width = windowSize().width): number {
  return Math.min(wp(92, width), scale(420, width));
}

export const isSmallPhone = () => windowSize().width < 370;
export const isLargePhone = () => windowSize().width >= 414;

/** Layout-critical: do not honor system font size (causes per-device drift). */
export const MAX_FONT_MULT = 1.3;

/**
 * Icon sizes — always width-scaled (same ratio as typography).
 * Prefer these over raw numbers in `<Ionicons size={…} />`.
 */
export function iconSize(size: number, width = windowSize().width): number {
  return scale(size, width);
}

export const icons = {
  xs: scale(12),
  sm: scale(14),
  md: scale(18),
  lg: scale(22),
  xl: scale(24),
  xxl: scale(28),
  hero: scale(32),
  display: scale(48),
} as const;

/** Touch hit slop — scaled so tap targets stay proportional. */
export const scaledHitSlop = {
  top: scale(8),
  bottom: scale(8),
  left: scale(8),
  right: scale(8),
} as const;

export const hitSlop = scaledHitSlop;

/**
 * Vertical-only layout (footer bands, scroll section padding).
 * Width-based scale() alone drifts on 16:9 vs 20:9 — use this for Y-axis spacing.
 */
export function layoutV(size: number, height = windowSize().height): number {
  return verticalScale(size, height);
}

export function scaleReport(width: number): Record<string, number> {
  return {
    width,
    ratio: width / BASE_WIDTH,
    pad20: scale(20, width),
    title26: scale(26, width),
    button54: scale(54, width),
  };
}
