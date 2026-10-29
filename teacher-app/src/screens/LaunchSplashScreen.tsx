import { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppIcon } from "../components/AppIcon";
import { FloatingShapes } from "../components/FloatingShapes";
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
    <LinearGradient
      colors={["#FFFFFF", "#EEF2F9"]}
      locations={[0, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.root}
      onLayout={signalReady}
    >
      <FloatingShapes color="#2563EB" shapes={[
        { kind: "ring", size: 280, top: -110, right: -100, drift: 10, duration: 6000, opacity: 0.06 },
        { kind: "ring", size: 200, bottom: -80, left: -80, drift: 8, duration: 7000, delay: 400, opacity: 0.05 },
        { kind: "dot", size: 12, top: "26%", right: "20%", drift: 10, duration: 3600, opacity: 0.9 },
      ]} />
      {fontsReady ? (
        <Animated.View
          style={[
            styles.wordmark,
            { opacity, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <View
            style={[
              styles.logoCircle,
              {
                width: circleSize,
                height: circleSize,
                borderRadius: circleSize / 2,
              },
            ]}
          >
            <Image source={require("../../assets/app-icon.png")} style={{ width: Math.round(circleSize * 0.78), height: Math.round(circleSize * 0.78), borderRadius: Math.round(circleSize * 0.39) }} resizeMode="contain" accessibilityLabel="My School ID Card" />
          </View>
          <BrandLockup
            variant="splash"
            title={BRAND.appName}
            subtitle={BRAND.headerSubtitle}
            showTagline={false}
            singleLine
            style={{ marginTop: scale(12) }}
          />
        </Animated.View>
      ) : null}
    </LinearGradient>
  );
}

function useLaunchSplashStyles() {
  return useResponsiveStyles(({ wp, scale }) => ({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
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
      shadowColor: "#1E293B",
      shadowOpacity: 0.12,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
  }));
}
