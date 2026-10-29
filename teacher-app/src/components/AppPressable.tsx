import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, type PressableProps, type PressableStateCallbackType, type StyleProp, type ViewStyle } from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Layout-preserving touch feedback; respects the phone's Reduce Motion setting.
 *
 * Important: Animated components on React Native 0.81 (new architecture) ignore a
 * *function* `style`, which dropped every button's background, border and row layout
 * on real devices. We resolve the caller's style ourselves (tracking `pressed`) and
 * always hand Animated a plain style array.
 */
export function AppPressable({ style, android_ripple, onPressIn, onPressOut, ...rest }: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => { active = false; subscription.remove(); scale.stopAnimation(); };
  }, [scale]);
  useEffect(() => { if (reduceMotion) { scale.stopAnimation(); scale.setValue(1); } }, [reduceMotion, scale]);

  function animate(value: number) {
    if (reduceMotion) { scale.setValue(1); return; }
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 28, bounciness: value === 1 ? 10 : 0 }).start();
  }

  const state = { pressed, hovered: false } as PressableStateCallbackType;
  const base = (typeof style === "function" ? style(state) : style) as StyleProp<ViewStyle>;
  const flattened = (StyleSheet.flatten(base) ?? {}) as ViewStyle;
  const ownTransform = Array.isArray(flattened.transform) ? flattened.transform : [];

  return (
    <AnimatedPressable
      {...rest}
      android_ripple={android_ripple ?? null}
      onPressIn={(event) => { setPressed(true); animate(0.96); onPressIn?.(event); }}
      onPressOut={(event) => { setPressed(false); animate(1); onPressOut?.(event); }}
      style={[flattened, { transform: [...ownTransform, { scale }] }, pressed ? { opacity: 0.9 } : null]}
    />
  );
}
