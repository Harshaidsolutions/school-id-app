import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
 * Native Android splash shows solid orange only; this screen follows immediately.
 */
export function LaunchSplashScreen({ onReady, fontsReady = true }: Props) {
  const styles = useLaunchSplashStyles();
  const { width, scale } = useResponsiveLayout();
  const logoSize = loginLogoSize(width);
  // Approved visual design: original logo has no circular backdrop.
  const splashLogoSize = Math.round(logoSize * 1.03);
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
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fontsReady, opacity, scaleAnim]);

  return (
    <LinearGradient
      colors={["#F7FFF9", "#EAF9F1", "#D7F1E6"]}
      locations={[0, 0.55, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.root}
      onLayout={signalReady}
    >
      {fontsReady ? (
        <Animated.View
          style={[
            styles.wordmark,
            { opacity, transform: [{ scale: scaleAnim }] },
          ]}
        >
          <AppIcon size={splashLogoSize} />
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

  }));
}
