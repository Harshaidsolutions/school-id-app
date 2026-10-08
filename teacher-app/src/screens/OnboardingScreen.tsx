import { Pressable } from "../components/Pressable";
import { useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import type { RootStackParamList } from "../navigation/types";
import { BrandLockup } from "../components/BrandLockup";
import { BRAND } from "../constants/brand";
import { AppIcon } from "../components/AppIcon";
import { IconChip } from "../components/IconChip";
import { OnboardingTapZones } from "../components/OnboardingTapZones";
import { OnboardingSwipeIndicator } from "../components/OnboardingSwipeIndicator";
import { colors, fabGradient, spacing, radius, cardShadow } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export const ONBOARDING_COMPLETE_KEY = "teacher_onboarding_complete";

const PAGE_COUNT = 3;
const FOOTER_RADIUS = 32;
const FOOTER_RATIO = 0.34;

type FooterAccent = "orange" | "green";

type NavProps = {
  index: number;
  onSkip: () => void;
  onNext: () => void;
  onBack: () => void;
  scrollX: Animated.Value;
  screenW: number;
};

export function OnboardingScreen({ navigation }: Props) {
  const styles = useOnboardingStyles();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<number>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const { width: screenW, height: screenH } = useWindowDimensions();

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    navigation.replace("Login");
  }

  function goNext() {
    if (index >= PAGE_COUNT - 1) {
      void finish();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function goBack() {
    if (index <= 0) return;
    listRef.current?.scrollToIndex({ index: index - 1, animated: true });
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
    if (i !== index) setIndex(i);
  }

  const nav: NavProps = {
    index,
    onSkip: () => void finish(),
    onNext: goNext,
    onBack: goBack,
    scrollX,
    screenW,
  };

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={[0, 1, 2]}
        keyExtractor={(_, idx) => String(idx)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: false,
            listener: onScroll,
          }
        )}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({
          length: screenW,
          offset: screenW * i,
          index: i,
        })}
        renderItem={({ index: i }) => (
          <View style={{ width: screenW, height: screenH }}>
            {i === 0 ? (
              <Page1 nav={nav} />
            ) : i === 1 ? (
              <Page2 nav={nav} screenW={screenW} screenH={screenH} />
            ) : (
              <Page3 nav={nav} screenW={screenW} screenH={screenH} />
            )}
          </View>
        )}
      />
    </View>
  );
}

function OnboardingHeaderZone({
  showBack,
  onBack,
  iconColor,
  compact,
}: {
  showBack?: boolean;
  onBack?: () => void;
  iconColor?: string;
  compact?: boolean;
}) {
  const styles = useOnboardingStyles();
  const { scale } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.headerZone,
        compact && styles.headerZoneCompact,
        {
          paddingTop: insets.top + (compact ? scale(2) : scale(4)),
          minHeight: insets.top + (compact ? scale(36) : scale(48)),
        },
      ]}
    >
      {showBack && onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={iconColor ?? colors.brandGreen}
          />
        </Pressable>
      ) : (
        <View style={styles.backBtnPlaceholder} />
      )}
    </View>
  );
}

function FooterControls({
  onSkip,
  onNext,
  accent,
  scrollX,
  screenW,
}: {
  onSkip: () => void;
  onNext: () => void;
  accent: FooterAccent;
  scrollX: Animated.Value;
  screenW: number;
}) {
  const styles = useOnboardingStyles();
  const arrowColor =
    accent === "green" ? colors.brandGreen : colors.primaryOrange;

  return (
    <View style={styles.footerControls}>
      <Pressable onPress={onSkip} hitSlop={12} style={styles.skipHit}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
      <View style={styles.footerMid}>
        <OnboardingSwipeIndicator
          scrollX={scrollX}
          pageWidth={screenW}
          pageCount={PAGE_COUNT}
        />
      </View>
      <Pressable
        style={styles.nextBtn}
        onPress={onNext}
        accessibilityLabel="Next"
      >
        <Ionicons name="arrow-forward" size={26} color={arrowColor} />
      </Pressable>
    </View>
  );
}

/** Identical curve + height on every onboarding page. */
function OnboardingFooter({
  accent,
  nav,
  children,
}: {
  accent: FooterAccent;
  nav: NavProps;
  children: React.ReactNode;
}) {
  const styles = useOnboardingStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const footerH = Math.round(height * FOOTER_RATIO);
  const gradient =
    accent === "green"
      ? ([colors.brandGreen, colors.brandGreenLight, "#63BDB4"] as const)
      : fabGradient;

  return (
    <LinearGradient
      colors={[...gradient]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[
        styles.footerBand,
        {
          height: footerH,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
        },
      ]}
    >
      <View style={styles.footerSlot}>{children}</View>
      <FooterControls
        onSkip={nav.onSkip}
        onNext={nav.onNext}
        accent={accent}
        scrollX={nav.scrollX}
        screenW={nav.screenW}
      />
    </LinearGradient>
  );
}

function Page1({ nav }: { nav: NavProps }) {
  const styles = useOnboardingStyles();
  const { scale, wp } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const iconSize = Math.min(wp(40), screenH * 0.2);

  return (
    <View style={[styles.p1Root, { paddingTop: insets.top + scale(8) }]}>
      <OnboardingTapZones
        onBack={nav.onBack}
        onNext={nav.onNext}
        canGoBack={false}
        footerRatio={FOOTER_RATIO}
      />
      <View style={styles.p1Top}>
        <AppIcon size={iconSize} style={{ marginBottom: spacing.md }} />
        <BrandLockup
          variant="hero"
          title={BRAND.appName}
          subtitle={BRAND.headerSubtitle}
          showTagline={false}
          singleLine
        />
      </View>

      <OnboardingFooter accent="orange" nav={nav}>
        <Text style={styles.p1Title}>Data Collector</Text>
        <Text style={styles.p1Subtitle}>Made for Schools & Institutes.</Text>
      </OnboardingFooter>
    </View>
  );
}

function Page2({
  nav,
  screenW,
  screenH,
}: {
  nav: NavProps;
  screenW: number;
  screenH: number;
}) {
  const styles = useOnboardingStyles();
  const features = [
    { icon: "id-card" as const, l1: "Data Collector" },
    { icon: "camera" as const, l1: "Photo Capture" },
    { icon: "cloud-upload" as const, l1: "Upload Securely" },
  ];
  const illustrationH = Math.min(screenW * 0.55, screenH * 0.28);
  const illustrationW = screenW - spacing.lg * 2;

  return (
    <View style={styles.p2Root}>
      <OnboardingTapZones
        onBack={nav.onBack}
        onNext={nav.onNext}
        footerRatio={FOOTER_RATIO}
      />
      <OnboardingHeaderZone
        showBack
        onBack={nav.onBack}
        iconColor={colors.brandGreen}
      />

      <View style={styles.p2Top}>
        <Text style={styles.p2Headline}>
          Capture....{"\n"}Organize....{"\n"}
          <Text style={styles.p2HeadOrange}>Manage....</Text>
        </Text>
        <Text style={styles.p2Body}>
          Capture student photos, manage data & create ID cards in minutes.
        </Text>

        <View style={styles.p2ImageWrap}>
          <Image
            source={require("../../assets/onboarding-hero.png")}
            style={{
              width: illustrationW,
              height: illustrationH,
            }}
            resizeMode="contain"
          />
        </View>
      </View>

      <OnboardingFooter accent="green" nav={nav}>
        <View style={styles.p2Features}>
          {features.map((f) => (
            <View key={f.l1} style={styles.p2FeatureCol}>
              <View style={styles.p2FeatureIcon}>
                <Ionicons name={f.icon} size={26} color={colors.brandGreen} />
              </View>
              <Text style={styles.p2FeatureLabel}>{f.l1}</Text>
            </View>
          ))}
        </View>
      </OnboardingFooter>
    </View>
  );
}

function Page3({
  nav,
  screenW,
  screenH,
}: {
  nav: NavProps;
  screenW: number;
  screenH: number;
}) {
  const styles = useOnboardingStyles();
  const { scale } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const footerTextSize =
    screenW < 340 ? typeScale.lg : screenW < 380 ? typeScale.xl : typeScale.xxl;

  const features = [
    { icon: "id-card" as const, label: "Data Collector" },
    { icon: "camera" as const, label: "Photo Capture" },
    { icon: "grid" as const, label: "ID Card Templates" },
    { icon: "cube" as const, label: "ID Card Models" },
  ];

  return (
    <View style={styles.p3Root}>
      <OnboardingTapZones
        onBack={nav.onBack}
        onNext={nav.onNext}
        footerRatio={FOOTER_RATIO}
      />

      <View style={[styles.p3Top, { paddingTop: insets.top }]}>
        <Pressable
          onPress={nav.onBack}
          style={styles.p3BackBtn}
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={colors.primaryOrange}
          />
        </Pressable>

        <Text style={styles.p3Headline}>
          All in One{"\n"}
          <Text style={styles.p3HeadOrange}>ID Solution</Text>
        </Text>
        <Text style={styles.p3Body} numberOfLines={2}>
          Templates, Models, Data Collector & more – Everything in one app.
        </Text>

        <View style={styles.p3FeatureList}>
          {features.map((feature) => (
            <View key={feature.label} style={styles.p3FeatureRow}>
              <View style={styles.p3FeatureIconWrap}>
                <Ionicons
                  name={feature.icon}
                  size={scale(22)}
                  color={colors.primaryOrange}
                />
              </View>
              <Text style={styles.p3FeatureText}>{feature.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <OnboardingFooter accent="orange" nav={nav}>
        <View style={styles.p3FooterTextWrap}>
          <Text
            style={[styles.p3FooterBold, { fontSize: footerTextSize }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            Simple - Fast - Secure
          </Text>
          <Text
            style={[styles.p3FooterSub, { fontSize: footerTextSize * 0.88 }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            Less Work. Best Results.
          </Text>
        </View>
      </OnboardingFooter>
    </View>
  );
}

function useOnboardingStyles() {
  return useResponsiveStyles(({ scale, wp }) => ({
    root: { flex: 1, backgroundColor: colors.white },

    headerZone: {
      paddingHorizontal: spacing.lg,
      justifyContent: "center",
      zIndex: 10,
    },
    headerZoneCompact: {
      marginBottom: -spacing.xxs,
    },
    backBtn: {
      width: scale(44),
      height: scale(44),
      borderRadius: scale(22),
      backgroundColor: colors.white,
      alignItems: "center",
      justifyContent: "center",
      elevation: 6,
      shadowColor: colors.brandNavy,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },
    backBtnPlaceholder: {
      width: scale(44),
      height: scale(44),
    },

    footerBand: {
      width: "100%",
      borderTopLeftRadius: FOOTER_RADIUS,
      borderTopRightRadius: FOOTER_RADIUS,
      paddingTop: spacing.md,
      paddingHorizontal: spacing.lg,
      justifyContent: "space-between",
    },
    footerSlot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    footerControls: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.xs,
      paddingTop: spacing.sm,
      width: "100%",
    },
    skipHit: { minWidth: scale(56) },
    footerMid: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.sm,
    },
    skipText: {
      fontFamily: fonts.headingBold,
      fontSize: typeScale.lg,
      color: colors.white,
    },
    dots: { flexDirection: "row", gap: spacing.xs, alignItems: "center" },
    nextBtn: {
      width: spacing.fabSize,
      height: spacing.fabSize,
      borderRadius: spacing.fabSize / 2,
      backgroundColor: colors.white,
      alignItems: "center",
      justifyContent: "center",
      elevation: 6,
      shadowColor: colors.brandNavy,
      shadowOpacity: 0.14,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    },

    p1Root: { flex: 1, backgroundColor: colors.white },
    p1Top: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.lg,
    },
    p1Title: {
      fontFamily: fonts.headingBold,
      fontSize: typeScale.xl,
      color: colors.white,
      textAlign: "center",
    },
    p1Subtitle: {
      fontFamily: fonts.headingSemiBold,
      fontSize: typeScale.lg,
      color: "rgba(255,255,255,0.95)",
      textAlign: "center",
      marginTop: scale(4),
    },

    p2Root: { flex: 1, backgroundColor: colors.background },
    p2Top: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    p2Headline: {
      ...textStyles.onboardingHeadline,
      color: colors.brandGreenDark,
      textAlign: "left",
      lineHeight: typeScale.onboardingHeadline * 1.38,
      paddingBottom: scale(6),
    },
    p2HeadOrange: {
      color: colors.primaryOrange,
      lineHeight: typeScale.onboardingHeadline * 1.38,
      paddingBottom: scale(4),
    },
    p2Body: {
      ...textStyles.onboardingSub,
      marginTop: spacing.sm,
      maxWidth: wp(82),
      textAlign: "left",
    },
    p2ImageWrap: {
      flex: 1,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    p2Features: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: spacing.sm,
      width: "100%",
    },
    p2FeatureCol: { alignItems: "center", gap: spacing.xs, flex: 1 },
    p2FeatureIcon: {
      width: scale(52),
      height: scale(52),
      borderRadius: spacing.sm,
      backgroundColor: colors.white,
      alignItems: "center",
      justifyContent: "center",
    },
    p2FeatureLabel: {
      fontFamily: fonts.headingSemiBold,
      fontSize: typeScale.body,
      color: colors.white,
      textAlign: "center",
      lineHeight: typeScale.body * 1.3,
    },

    p3Root: { flex: 1, backgroundColor: colors.white },
    p3Top: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    p3BackBtn: {
      width: scale(40),
      height: scale(40),
      borderRadius: scale(20),
      backgroundColor: colors.white,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 0,
      shadowColor: "#65568D",
      shadowOpacity: 0.1,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    p3Headline: {
      ...textStyles.onboardingHeadline,
      color: colors.brandGreen,
      textAlign: "left",
      lineHeight: typeScale.onboardingHeadline * 1.32,
      fontSize: typeScale.onboardingHeadline,
      paddingBottom: scale(2),
      marginTop: spacing.xs,
    },
    p3HeadOrange: {
      color: colors.primaryOrange,
      lineHeight: typeScale.onboardingHeadline * 1.32,
      paddingBottom: scale(4),
    },
    p3Body: {
      ...textStyles.onboardingSub,
      marginTop: spacing.sm,
      textAlign: "left",
      fontSize: typeScale.onboardingSub,
    },
    p3FeatureList: {
      flex: 1,
      justifyContent: "space-evenly",
      marginTop: spacing.lg,
      marginBottom: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.lg,
    },
    p3FeatureRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    p3FeatureIconWrap: {
      width: scale(44),
      height: scale(44),
      borderRadius: radius.full,
      backgroundColor: colors.orangeSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    p3FeatureText: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: typeScale.body * 1.28,
      color: colors.brandNavy,
      lineHeight: typeScale.body * 1.55,
      letterSpacing: 0.15,
    },
    p3FooterTextWrap: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xs,
    },
    p3FooterBold: {
      fontFamily: fonts.headingBold,
      fontSize: typeScale.xxl,
      color: colors.white,
      textAlign: "center",
      letterSpacing: 0.5,
      width: "100%",
    },
    p3FooterSub: {
      fontFamily: fonts.headingSemiBold,
      fontSize: typeScale.body,
      color: "rgba(255,255,255,0.92)",
      textAlign: "center",
      marginTop: scale(4),
    },
  }));
}
