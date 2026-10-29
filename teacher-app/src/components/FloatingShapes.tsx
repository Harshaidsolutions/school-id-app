import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { useReducedMotion } from "../hooks/useReducedMotion";

type Shape = { size: number; top?: number | `${number}%`; left?: number | `${number}%`; right?: number | `${number}%`; bottom?: number | `${number}%`; kind: "ring" | "dot" | "card"; drift: number; duration: number; delay?: number; opacity?: number };

const DEFAULT_SHAPES: Shape[] = [
  { kind: "ring", size: 180, top: -70, right: -60, drift: 8, duration: 7000, opacity: 0.07 },
  { kind: "ring", size: 96, bottom: -44, left: -30, drift: 6, duration: 6000, delay: 500, opacity: 0.05 },
];

/** Soft, slow decorative motion for gradient headers. Static when Reduce Motion is on. */
export function FloatingShapes({ shapes = DEFAULT_SHAPES, color = "#FFFFFF" }: { shapes?: Shape[]; color?: string }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {shapes.map((s, i) => <Floater key={i} shape={s} color={color} />)}
    </View>
  );
}

function Floater({ shape, color }: { shape: Shape; color: string }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { t.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(shape.delay ?? 0),
        Animated.timing(t, { toValue: 1, duration: shape.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: shape.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, shape.delay, shape.duration, t]);
  const translateY = t.interpolate({ inputRange: [0, 1], outputRange: [0, -shape.drift] });
  const rotate = t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", shape.kind === "card" ? "10deg" : "0deg"] });
  const base = { position: "absolute" as const, top: shape.top, left: shape.left, right: shape.right, bottom: shape.bottom, opacity: shape.opacity ?? 0.15 };
  const look =
    shape.kind === "ring"
      ? { width: shape.size, height: shape.size, borderRadius: shape.size / 2, borderWidth: Math.max(10, shape.size * 0.14), borderColor: color }
      : shape.kind === "card"
        ? { width: shape.size, height: shape.size * 0.68, borderRadius: 8, backgroundColor: color }
        : { width: shape.size, height: shape.size, borderRadius: shape.size / 2, backgroundColor: color };
  return <Animated.View style={[base, look, { transform: [{ translateY }, { rotate }] }]} />;
}
