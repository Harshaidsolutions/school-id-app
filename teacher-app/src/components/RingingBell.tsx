import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/** Notification bell that gives a small swing every few seconds (more often when something is unread). */
export function RingingBell({ size, color, unread }: { size: number; color: string; unread: number }) {
  const swing = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let stopped = false;
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || stopped) return;
      const ring = Animated.sequence(
        [14, -12, 9, -6, 3, 0].map((deg) => Animated.timing(swing, { toValue: deg, duration: 90, easing: Easing.inOut(Easing.quad), useNativeDriver: true }))
      );
      loop = Animated.loop(Animated.sequence([ring, Animated.delay(unread > 0 ? 2200 : 5200)]));
      loop.start();
    });
    return () => {
      stopped = true;
      loop?.stop();
      swing.setValue(0);
    };
  }, [swing, unread]);
  const rotate = swing.interpolate({ inputRange: [-20, 20], outputRange: ["-20deg", "20deg"] });
  return (
    <Animated.View style={{ transform: [{ translateY: -size * 0.3 }, { rotate }, { translateY: size * 0.3 }] }}>
      <Ionicons name={unread > 0 ? "notifications" : "notifications-outline"} size={size} color={color} />
    </Animated.View>
  );
}
