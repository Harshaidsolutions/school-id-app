import { useMemo } from "react";
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from "react-native";
import { useResponsiveLayout } from "./useResponsiveLayout";

type NamedStyles<T> = {
  [P in keyof T]: ViewStyle | TextStyle | ImageStyle;
};

type ResponsiveLayout = ReturnType<typeof useResponsiveLayout>;

/**
 * StyleSheet.create that recomputes when window dimensions change.
 * Pass a factory receiving live layout metrics (scale, wp, hp, width, height).
 */
export function useResponsiveStyles<T extends NamedStyles<T>>(
  factory: (layout: ResponsiveLayout) => T
): T {
  const layout = useResponsiveLayout();
  return useMemo(
    () => StyleSheet.create(factory(layout)),
    [layout.width, layout.height]
  );
}
