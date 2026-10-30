import { useRef } from "react";
import { Animated, Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Button touch feedback: a soft spring scale. The caller's style is resolved here
 * (RN 0.81 new architecture ignores function styles on Animated components).
 */
export function Tap({
  style,
  onPressIn,
  onPressOut,
  scaleTo = 0.96,
  ...rest
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; scaleTo?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 28, bounciness: to === 1 ? 9 : 0 }).start();
  const flat = (StyleSheet.flatten(style) ?? {}) as ViewStyle;
  const own = Array.isArray(flat.transform) ? flat.transform : [];
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => {
        spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        spring(1);
        onPressOut?.(e);
      }}
      style={[flat, { transform: [...own, { scale }] }, rest.disabled ? { opacity: 0.5 } : null]}
    />
  );
}
