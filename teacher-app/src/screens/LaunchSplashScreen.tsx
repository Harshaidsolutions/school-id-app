import { BRAND as THEME } from "../theme/brandTheme";
import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
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
