import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect } from "react-native-svg";
import { useTheme } from "../theme/ThemeContext";
import { useReducedMotion } from "../hooks/useReducedMotion";

/**
 * Soft, modern page background: two large radial colour glows that drift slowly
 * behind the content. Pure decoration — never intercepts touches. Static when the
 * phone's Reduce Motion setting is on.
 */
export function ScreenBackdrop() {
  const { colors, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) { t.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, t]);

  const size = Math.max(width, 360) * 1.25;
  const strength = isDark ? 0.22 : 0.42;
  const a = t.interpolate({ inputRange: [0, 1], outputRange: [0, 26] });
  const b = t.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });

  const glow = (id: string, color: string) => (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={strength} />
          <Stop offset="55%" stopColor={color} stopOpacity={strength * 0.35} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );

  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, styles.clip]}>
      <Animated.View style={{ position: "absolute", top: -size * 0.45, right: -size * 0.4, transform: [{ translateX: b }, { translateY: a }] }}>
        {glow("glowA", colors.glowA)}
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: height * 0.35, left: -size * 0.55, transform: [{ translateX: a }, { translateY: b }] }}>
        {glow("glowB", colors.glowB)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });
