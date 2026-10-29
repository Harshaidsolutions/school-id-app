import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, type StyleProp, type ViewStyle } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Short, non-blocking entrance (fade + rise). `delay` lets lists stagger.
 * All content stays visible with reduced motion.
 */
export function Entrance({ children, style, delay = 0, distance = 14 }: { children: ReactNode; style?: StyleProp<ViewStyle>; delay?: number; distance?: number }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) { progress.setValue(1); return; }
    progress.setValue(0);
    const animation = Animated.timing(progress, { toValue: 1, duration: 380, delay: Math.min(delay, 600), easing: Easing.out(Easing.cubic), useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reducedMotion]);
  return <Animated.View style={[style, { opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.001, 1] }), transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>{children}</Animated.View>;
}
