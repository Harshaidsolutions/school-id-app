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
      colors={["#FF8C1A", "#F5811F", "#6FCF57", "#4CAF50"]}
      locations={[0, 0.38, 0.72, 1]}
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
            <AppIcon size={splashLogoSize} />
          </View>
          <BrandLockup
            variant="splash"
            title={BRAND.appName}
            showTagline={false}
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
    },
  }));
}
