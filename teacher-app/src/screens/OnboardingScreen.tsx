import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
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
import { Pressable } from "../components/Pressable";
import { RainbowBar } from "../components/RainbowBar";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useTheme } from "../theme/ThemeContext";
import { RAINBOW } from "../theme/brandTheme";
import { fonts } from "../theme/typography";

type Props = NativeStackScreenProps<RootStackParamList, "Onboarding">;

export const ONBOARDING_COMPLETE_KEY = "teacher_onboarding_complete";

const PAGE_COUNT = 3;
const INK = "#1B1F3B";
const MUTED = "#6B7090";
const PURPLE = "#6A2C9E";
const SKY = "#1EA0E1";
const CTA = ["#FF8A1F", "#F26A1B", "#E8243C"] as const;

/* ───────────── small animation helpers ───────────── */

/** Looping 0 → 1 → 0 value (for floating / pulsing). */
function useLoop(duration: number, delay = 0) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      v.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, v, duration, delay]);
  return v;
}

/** Fade + rise in when the page becomes active (replays each time you swipe to it). */
function Reveal({ active, delay = 0, children, style }: { active: boolean; delay?: number; children: ReactNode; style?: object }) {
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || reduced) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [active, delay, reduced, v]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Website-style chip: rainbow pill + upper-case label. */
function Eyebrow({ text }: { text: string }) {
  return (
    <View style={st.eyebrow}>
      <View style={st.eyebrowBar}>
        {RAINBOW.map((c) => (
          <View key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>
      <Text style={st.eyebrowText}>{text}</Text>
    </View>
  );
}

/* ───────────── screen ───────────── */

export function OnboardingScreen({ navigation }: Props) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<number>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const { width: screenW } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    navigation.replace("Login");
  }
  const goTo = (i: number) => listRef.current?.scrollToIndex({ index: i, animated: true });
  const goNext = () => (index >= PAGE_COUNT - 1 ? void finish() : goTo(index + 1));

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
    if (i !== index && i >= 0 && i < PAGE_COUNT) setIndex(i);
  }

  const last = index === PAGE_COUNT - 1;

  return (
    <View style={[st.root, { backgroundColor: colors.background }]}>
      <ScreenBackdrop />
      <RainbowBar style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 3 }} />

      {/* Top bar: back + skip */}
      <View style={[st.topBar, { paddingTop: insets.top + 10 }]}>
        {index > 0 ? (
          <Pressable onPress={() => goTo(index - 1)} style={st.roundBtn} accessibilityLabel="Back" hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
        ) : (
          <View style={{ width: 42 }} />
        )}
        {!last ? (
          <Pressable onPress={() => void finish()} style={st.skip} hitSlop={10} accessibilityLabel="Skip">
            <Text style={st.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <View style={{ width: 42 }} />
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        data={[0, 1, 2]}
        keyExtractor={(i) => String(i)}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true, listener: onScroll })}
        scrollEventThrottle={16}
        getItemLayout={(_, i) => ({ length: screenW, offset: screenW * i, index: i })}
        style={{ flex: 1 }}
        renderItem={({ item: i }) => (
          <View style={{ width: screenW, flex: 1, paddingHorizontal: 22 }}>
            {i === 0 ? <PageWelcome active={index === 0} /> : i === 1 ? <PageSteps active={index === 1} width={screenW - 44} /> : <PageAllInOne active={index === 2} />}
          </View>
        )}
      />

      {/* Bottom: dots + pill button */}
      <View style={[st.bottom, { paddingBottom: insets.bottom + 18 }]}>
        <View style={st.dots}>
          {[0, 1, 2].map((i) => {
            const w = scrollX.interpolate({
              inputRange: [(i - 1) * screenW, i * screenW, (i + 1) * screenW],
              outputRange: [1, 3.2, 1],
              extrapolate: "clamp",
            });
            const o = scrollX.interpolate({
              inputRange: [(i - 1) * screenW, i * screenW, (i + 1) * screenW],
              outputRange: [0.35, 1, 0.35],
              extrapolate: "clamp",
            });
            return <Animated.View key={i} style={[st.dot, { opacity: o, transform: [{ scaleX: w }] }]} />;
          })}
        </View>
        <Pressable onPress={goNext} style={st.cta} accessibilityRole="button" accessibilityLabel={last ? "Get started" : "Next"}>
          <LinearGradient colors={[...CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.ctaFill}>
            <Text style={st.ctaText}>{last ? "Get Started" : "Next"}</Text>
            <View style={st.ctaArrow}>
              <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Pressable>
      </View>
    </View>
  );
}

/* ───────────── page 1: welcome ───────────── */

function PageWelcome({ active }: { active: boolean }) {
  const float = useLoop(1800);
  const spin = useLoop(6000);
  const { height } = useWindowDimensions();
  const logo = Math.min(190, height * 0.22);
  return (
    <View style={st.page}>
      <Reveal active={active} style={{ alignItems: "center" }}>
        <View style={{ width: logo * 1.45, height: logo * 1.45, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={[
              st.orbit,
              { width: logo * 1.4, height: logo * 1.4, borderRadius: logo * 0.7 },
              { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] },
            ]}
          >
            {RAINBOW.map((c, k) => (
              <View
                key={c}
                style={[
                  st.orbitDot,
                  {
                    backgroundColor: c,
                    left: logo * 0.7 + Math.cos((k / RAINBOW.length) * Math.PI * 2) * logo * 0.7 - 6,
                    top: logo * 0.7 + Math.sin((k / RAINBOW.length) * Math.PI * 2) * logo * 0.7 - 6,
                  },
                ]}
              />
            ))}
          </Animated.View>
          <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [6, -8] }) }] }}>
            <View style={[st.logoTile, { width: logo, height: logo, borderRadius: logo * 0.28 }]}>
              <Image source={require("../../assets/in-app-logo.png")} style={{ width: logo * 0.78, height: logo * 0.78 }} resizeMode="contain" />
            </View>
          </Animated.View>
        </View>
      </Reveal>
      <Reveal active={active} delay={120} style={{ alignItems: "center", width: "100%" }}>
        <BrandLockup variant="hero" title={BRAND.appName} subtitle={BRAND.headerSubtitle} showTagline={false} singleLine />
      </Reveal>
      <Reveal active={active} delay={220} style={{ alignItems: "center" }}>
        <Eyebrow text="Schools & Institutes" />
        <Text style={st.headline}>
          Your ID card <Text style={{ color: PURPLE }}>data collector</Text>
        </Text>
        <Text style={st.body}>Photos and student details in one simple app — ready for printing.</Text>
      </Reveal>
    </View>
  );
}

/* ───────────── page 2: capture → organize → print (animated photos) ───────────── */

const STEPS: { title: string; text: string; icon: keyof typeof Ionicons.glyphMap; color: string; img: ImageSourcePropType }[] = [
  { title: "Capture", text: "Take each student's photo", icon: "camera", color: "#1EA0E1", img: require("../../assets/onboarding/capture.jpg") },
  { title: "Organize", text: "Details sorted by class", icon: "folder-open", color: "#6A2C9E", img: require("../../assets/onboarding/organize.jpg") },
  { title: "Print", text: "Ready-to-print ID cards", icon: "print", color: "#F26A1B", img: require("../../assets/onboarding/print.jpg") },
];

function PageSteps({ active, width }: { active: boolean; width: number }) {
  const reduced = useReducedMotion();
  const [focus, setFocus] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    setFocus(0);
    const t = setInterval(() => setFocus((f) => (f + 1) % STEPS.length), 1700);
    return () => clearInterval(t);
  }, [active, reduced]);
  const { height } = useWindowDimensions();
  const big = Math.min(width * 0.78, height * 0.3);
  const small = Math.min((width - 24) / 3, 108);

  return (
    <View style={st.page}>
      <Reveal active={active} style={{ alignItems: "center" }}>
        <Eyebrow text="How it works" />
        <Text style={st.headline}>
          Capture. Organize. <Text style={{ color: "#F26A1B" }}>Print.</Text>
        </Text>
      </Reveal>

      {/* Big animated photo of the current step */}
      <Reveal active={active} delay={100} style={{ alignItems: "center" }}>
        <StepHero step={focus} size={big} />
      </Reveal>

      {/* The three steps as small animated photo cards */}
      <Reveal active={active} delay={200} style={st.stepRow}>
        {STEPS.map((s, i) => (
          <StepThumb key={s.title} step={i} on={focus === i} size={small} onPress={() => setFocus(i)} />
        ))}
      </Reveal>
    </View>
  );
}

function StepHero({ step, size }: { step: number; size: number }) {
  const float = useLoop(1600);
  const fade = useRef(new Animated.Value(1)).current;
  const [shown, setShown] = useState(step);
  useEffect(() => {
    if (step === shown) return;
    Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => {
      setShown(step);
      Animated.spring(fade, { toValue: 1, useNativeDriver: true, friction: 6, tension: 90 }).start();
    });
  }, [step, shown, fade]);
  const s = STEPS[shown];
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [4, -6] }) },
          { scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
        opacity: fade,
      }}
    >
      <View style={[st.heroCard, { width: size, height: size }]}>
        <Image source={s.img} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        <View style={[st.heroTag, { backgroundColor: s.color }]}>
          <Ionicons name={s.icon} size={15} color="#FFFFFF" />
          <Text style={st.heroTagText}>
            {shown + 1}. {s.title}
          </Text>
        </View>
      </View>
      <Text style={st.heroCaption}>{s.text}</Text>
    </Animated.View>
  );
}

function StepThumb({ step, on, size, onPress }: { step: number; on: boolean; size: number; onPress: () => void }) {
  const bob = useLoop(1400, step * 260);
  const s = STEPS[step];
  return (
    <Pressable onPress={onPress} accessibilityLabel={s.title} style={{ alignItems: "center", width: size }}>
      <Animated.View
        style={[
          st.thumb,
          { width: size, height: size * 0.82, borderColor: on ? s.color : "#E8E9F3" },
          { transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }, { scale: on ? 1.04 : 1 }] },
        ]}
      >
        <Image source={s.img} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      </Animated.View>
      <View style={st.thumbLabelRow}>
        <View style={[st.thumbIcon, { backgroundColor: on ? s.color : "#F3EDFA" }]}>
          <Ionicons name={s.icon} size={12} color={on ? "#FFFFFF" : s.color} />
        </View>
        <Text style={[st.thumbLabel, on && { color: s.color }]}>{s.title}</Text>
      </View>
    </Pressable>
  );
}

/* ───────────── page 3: all in one ───────────── */

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; label: string; text: string; color: string }[] = [
  { icon: "id-card", label: "Data Collector", text: "Student details with photos", color: "#E8243C" },
  { icon: "camera", label: "Photo Capture", text: "Face guide for clear photos", color: "#1EA0E1" },
  { icon: "grid", label: "ID Card Templates", text: "Pick a design you like", color: "#6A2C9E" },
  { icon: "cube", label: "ID Card Models", text: "Cards, tags, lanyards & more", color: "#F26A1B" },
];

function PageAllInOne({ active }: { active: boolean }) {
  return (
    <View style={st.page}>
      <Reveal active={active} style={{ alignItems: "center" }}>
        <Eyebrow text="Everything in one app" />
        <Text style={st.headline}>
          All in one <Text style={{ color: SKY }}>ID solution</Text>
        </Text>
      </Reveal>
      <View style={{ width: "100%", gap: 10 }}>
        {FEATURES.map((f, i) => (
          <Reveal key={f.label} active={active} delay={90 + i * 90}>
            <View style={st.featureRow}>
              <View style={[st.featureIcon, { backgroundColor: f.color }]}>
                <Ionicons name={f.icon} size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.featureTitle}>{f.label}</Text>
                <Text style={st.featureText}>{f.text}</Text>
              </View>
              <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
            </View>
          </Reveal>
        ))}
      </View>
      <Reveal active={active} delay={480} style={{ alignItems: "center" }}>
        <Text style={st.motto}>Simple · Fast · Secure</Text>
      </Reveal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 4, zIndex: 2 },
  roundBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E8E9F3" },
  skip: { paddingHorizontal: 16, height: 38, borderRadius: 999, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8E9F3", alignItems: "center", justifyContent: "center" },
  skipText: { fontFamily: fonts.headingSemiBold, fontSize: 14, color: INK },
  page: { flex: 1, alignItems: "center", justifyContent: "space-evenly", paddingVertical: 6 },

  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F3EDFA", borderRadius: 999, paddingVertical: 6, paddingLeft: 8, paddingRight: 12, marginBottom: 10 },
  eyebrowBar: { width: 22, height: 8, borderRadius: 4, overflow: "hidden", flexDirection: "row" },
  eyebrowText: { fontFamily: fonts.headingBold, fontSize: 10.5, letterSpacing: 1.6, color: PURPLE, textTransform: "uppercase" },
  headline: { fontFamily: fonts.headingExtraBold, fontSize: 27, lineHeight: 34, color: INK, textAlign: "center", letterSpacing: -0.6 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: MUTED, textAlign: "center", marginTop: 8, maxWidth: 330 },

  orbit: { position: "absolute", borderWidth: 1.5, borderColor: "rgba(106,44,158,0.15)", borderStyle: "dashed" },
  orbitDot: { position: "absolute", width: 12, height: 12, borderRadius: 6 },
  logoTile: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", shadowColor: INK, shadowOpacity: 0.12, shadowRadius: 22, shadowOffset: { width: 0, height: 12 }, elevation: 8 },

  heroCard: { borderRadius: 26, overflow: "hidden", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E8E9F3", shadowColor: INK, shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 7 },
  heroTag: { position: "absolute", left: 12, top: 12, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  heroTagText: { fontFamily: fonts.headingBold, fontSize: 13, color: "#FFFFFF" },
  heroCaption: { fontFamily: fonts.bodyMedium, fontSize: 14.5, color: MUTED, textAlign: "center", marginTop: 12 },

  stepRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", gap: 12 },
  thumb: { borderRadius: 18, overflow: "hidden", borderWidth: 2, backgroundColor: "#FFFFFF" },
  thumbLabelRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  thumbIcon: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  thumbLabel: { fontFamily: fonts.headingSemiBold, fontSize: 13, color: INK },

  featureRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: 18, borderWidth: 1, borderColor: "#E8E9F3", paddingVertical: 12, paddingHorizontal: 14, shadowColor: INK, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  featureIcon: { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  featureTitle: { fontFamily: fonts.headingBold, fontSize: 15.5, color: INK },
  featureText: { fontFamily: fonts.body, fontSize: 13, color: MUTED, marginTop: 1 },
  motto: { fontFamily: fonts.headingBold, fontSize: 16, color: PURPLE, letterSpacing: 0.4 },

  bottom: { paddingHorizontal: 22, paddingTop: 8, gap: 14, alignItems: "center" },
  dots: { flexDirection: "row", gap: 14, height: 8, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: PURPLE },
  cta: { alignSelf: "stretch", borderRadius: 999, overflow: "hidden", shadowColor: "#F26A1B", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  ctaFill: { minHeight: 56, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  ctaText: { fontFamily: fonts.headingBold, fontSize: 17, color: "#FFFFFF", letterSpacing: 0.2 },
  ctaArrow: { width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
});
