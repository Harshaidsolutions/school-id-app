import { BRAND as THEME } from "../theme/brandTheme";
import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { withAlpha } from "../theme/brandTheme";
import { AppIcon } from "../components/AppIcon";
import { BrandLockup } from "../components/BrandLockup";
import { BRAND } from "../constants/brand";
import { loginLogoSize } from "../constants/headerLogo";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

type Props = {
  onReady?: () => void;
  /** When false, wordmark is hidden until Poppins/Inter finish loading. */
  fontsReady?: boolean;
};

/**
 * Branded intro — login logo + wordmark on gradient.
 * Native Android splash shows solid deep blue only; this screen follows immediately.
 */
export function LaunchSplashScreen({ onReady, fontsReady = true }: Props) {
  const styles = useLaunchSplashStyles();
  const { width, scale } = useResponsiveLayout();
  const logoSize = loginLogoSize(width);
  const circleSize = Math.round(logoSize * 1.38);
  const splashLogoSize = Math.round(logoSize * 0.82);
  const opacity = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.82)).current;
  const readyFired = useRef(false);

  function signalReady() {
    if (readyFired.current) return;
    readyFired.current = true;
    onReady?.();
  }

  useEffect(() => {
    signalReady();
  }, []);

  // Soft "ripple" rings that keep breathing around the logo.
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const a = loop(ringA, 0);
    const b = loop(ringB, 1200);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ringA, ringB]);
  const ringStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.7] }) }],
  });

  useEffect(() => {
    if (!fontsReady) return;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fontsReady, opacity, scaleAnim]);

  return (
    <View style={styles.root} onLayout={signalReady}>
      <LinearGradient colors={["#FFFFFF", THEME.background, withAlpha(THEME.primaryLight, 0.18)]} style={StyleSheet.absoluteFill} />
      <Animated.View pointerEvents="none" style={[styles.ring, { width: circleSize * 1.6, height: circleSize * 1.6, borderRadius: circleSize * 0.8 }, ringStyle(ringA)]} />
      <Animated.View pointerEvents="none" style={[styles.ring, styles.ringAccent, { width: circleSize * 1.6, height: circleSize * 1.6, borderRadius: circleSize * 0.8 }, ringStyle(ringB)]} />
      {fontsReady ? (
        <Animated.View
          style={[
            styles.wordmark,
            { opacity, transform: [{ scale: scaleAnim }] },
          ]}
        >
          {/* Logo only — clean white launch screen. */}
          <BrandLockup
            variant="splash"
            title={BRAND.appName}
            subtitle={BRAND.headerSubtitle}
            showTagline={false}
            singleLine
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

function useLaunchSplashStyles() {
  return useResponsiveStyles(({ wp, scale }) => ({
    root: {
      flex: 1,
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    ring: {
      position: "absolute" as const,
      borderWidth: 2,
      borderColor: withAlpha(THEME.primary, 0.45),
      backgroundColor: withAlpha(THEME.primary, 0.05),
    },
    ringAccent: {
      borderColor: withAlpha(THEME.accent, 0.45),
      backgroundColor: withAlpha(THEME.accent, 0.05),
    },
    wordmark: {
      alignItems: "center",
      maxWidth: wp(92),
      paddingHorizontal: scale(16),
    },
    logoCircle: {
      backgroundColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "#E4E8F0",
      shadowColor: THEME.primaryDeep,
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
  }));
}
