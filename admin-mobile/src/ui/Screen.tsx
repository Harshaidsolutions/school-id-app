import { useEffect, useRef, type ReactNode } from "react";
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { C, CONTENT_MAX, F, S, headerGradient } from "../theme";
import { Tap } from "./Pressable";

/** Two soft colour glows drifting slowly behind every page. */
export function Backdrop() {
  const { width, height } = useWindowDimensions();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const size = Math.max(width, 360) * 1.2;
  const a = t.interpolate({ inputRange: [0, 1], outputRange: [0, 24] });
  const b = t.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
  const glow = (id: string, color: string) => (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.45} />
          <Stop offset="60%" stopColor={color} stopOpacity={0.12} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
      <Animated.View style={{ position: "absolute", top: height * 0.12, right: -size * 0.45, transform: [{ translateX: b }, { translateY: a }] }}>
        {glow("ga", C.glowA)}
      </Animated.View>
      <Animated.View style={{ position: "absolute", top: height * 0.5, left: -size * 0.55, transform: [{ translateX: a }, { translateY: b }] }}>
        {glow("gb", C.glowB)}
      </Animated.View>
    </View>
  );
}

/** Gradient page header with back button, title and actions. */
export function Header({
  title,
  subtitle,
  back = true,
  right,
  children,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  children?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const nav = useNavigation();
  const canBack = back && (onBack || nav.canGoBack());
  return (
    <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.header, { paddingTop: insets.top + 10 }]}>
      <View style={st.bubbleA} />
      <View style={st.bubbleB} />
      <View style={[st.headerRow, { maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%" }]}>
        {canBack ? (
          <Tap onPress={() => (onBack ? onBack() : nav.goBack())} hitSlop={10} accessibilityLabel="Back" style={st.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.white} />
          </Tap>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={st.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={st.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View style={{ flexDirection: "row", gap: 8 }}>{right}</View> : null}
      </View>
      {children ? <View style={{ maxWidth: CONTENT_MAX, alignSelf: "center", width: "100%", marginTop: S.md }}>{children}</View> : null}
    </LinearGradient>
  );
}

/** Standard page: header + soft background + scrolling content. */
export function Screen({
  title,
  subtitle,
  back = true,
  right,
  headerExtra,
  children,
  refreshing,
  onRefresh,
  scroll = true,
  footer,
  contentStyle,
  overlay,
  onBack,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  overlay?: ReactNode;
  onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[st.content, { paddingBottom: insets.bottom + (footer ? 24 : 110) }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} colors={[C.primary]} tintColor={C.primary} /> : undefined}
    >
      <View style={st.max}>{children}</View>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header title={title} subtitle={subtitle} back={back} right={right} onBack={onBack}>
        {headerExtra}
      </Header>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {body}
        {footer ? <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.lg, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" },
  bubbleA: { position: "absolute", width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.12)", top: -60, right: -40 },
  bubbleB: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.08)", bottom: -50, left: 30 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  backBtn: { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  title: { fontFamily: F.h, fontSize: 21, color: C.white, letterSpacing: -0.2 },
  subtitle: { fontFamily: F.bodyMed, fontSize: 13, color: "rgba(255,255,255,0.9)", marginTop: 1 },
  content: { padding: S.lg },
  max: { width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  footer: { paddingHorizontal: S.lg, paddingTop: 12, backgroundColor: "rgba(255,249,242,0.97)", borderTopWidth: 1, borderTopColor: C.line },
});
