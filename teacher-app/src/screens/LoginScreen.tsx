import { ScreenBackdrop } from "../components/ScreenBackdrop";
import {ServiceRegistration} from "../components/ServiceRegistration";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { Entrance } from "../components/Entrance";
import { Pressable } from "../components/Pressable";
import { API_BASE_URL } from "../api/client";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  KeyboardAvoidingView,
  Linking,
  Image,
  Platform,
  Pressable as RNPressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingShapes } from "../components/FloatingShapes";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { BRAND } from "../constants/brand";
import { RainbowBar } from "../components/RainbowBar";
import { BrandLockup } from "../components/BrandLockup";
import { RAINBOW } from "../theme/brandTheme";
import type { LoginResponse } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import {
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  SUPPORT_WEBSITE,
} from "../constants/support";
import { openWhatsApp } from "../utils/whatsappBusiness";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const REMEMBER_KEY = "teacher_remember_username";
const REMEMBER_FLAG = "teacher_remember_me";


export function LoginScreen(_props: Props) {
  const styles = useLoginStyles();
  const { colors, isDark, submitGradient } = useTheme();
  const insets = useSafeAreaInsets();
  const [focused, setFocused] = useState<"user" | "pass" | null>(null);
  const userRef = useRef<TextInput>(null);
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [float]);
  const passRef = useRef<TextInput>(null);
  const { width } = useResponsiveLayout();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [flag, saved] = await Promise.all([
          AsyncStorage.getItem(REMEMBER_FLAG),
          AsyncStorage.getItem(REMEMBER_KEY),
        ]);
        if (flag === "1" && saved) {
          setRememberMe(true);
          setUsername(saved);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleLogin() {
    if (loading) return;
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        audience: "mobile",
        email: username.trim(),
        password,
      });

      if (!data || typeof data.token !== "string" || !data.user?.role) {
        throw new Error("The login server returned an unexpected response. Please contact support.");
      }
      if (
        data.user.role !== "teacher" &&
        data.user.role !== "institute_staff" &&
        data.user.role !== "organization_staff"
      ) {
        setError("This app is for school, institute, and organization accounts.");
        return;
      }

      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_FLAG, "1");
        await AsyncStorage.setItem(REMEMBER_KEY, username.trim());
      } else {
        await AsyncStorage.removeItem(REMEMBER_FLAG);
        await AsyncStorage.removeItem(REMEMBER_KEY);
      }

      await login(data.token, data.user);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const fallback = status === 401 ? "Username or password was not accepted. Use the account shown by your administrator."
        : status === 403 ? "This account is disabled or does not have app access. Contact your administrator."
        : status && status >= 500 ? "The login server is temporarily unavailable. Please try again later."
        : status === 404 ? `Login service not found at ${API_BASE_URL}. Please send this address to your admin.`
        : "Could not complete login. Please try again.";
      setError(getErrorMessage(err, fallback));
    } finally {
      setLoading(false);
    }
  }

  function handleWhatsAppPress() {
    void openWhatsApp("I need help with My School ID Card.");
  }

  function openCall() {
    void Linking.openURL(`tel:${SUPPORT_PHONE}`);
  }

  function openMail() {
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }

  function openWebsite() {
    void Linking.openURL(SUPPORT_WEBSITE);
  }

  return (
    <View style={[styles.safe, { backgroundColor: isDark ? colors.background : "#F6F7FC" }]}>
      <ScreenBackdrop />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + spacing.md }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Top: the same "My School ID Card" logo as the splash screen, gently floating */}
          <View style={[styles.top, { paddingTop: insets.top + spacing.xl }]}>
            <LinearGradient colors={isDark ? [colors.background, colors.background] : ["#F3EDFA", "#E9F6FD", "#F6F7FC"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <FloatingShapes color={colors.primaryOrange} />
            <RainbowBar style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
            <Animated.View style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [4, -6] }) }] }}>
              <BrandLockup variant="hero" title={BRAND.appName} subtitle={BRAND.headerSubtitle} showTagline={false} singleLine />
            </Animated.View>
            <View style={styles.dotsRow}>
              {RAINBOW.map((c) => (
                <View key={c} style={[styles.dot, { backgroundColor: c }]} />
              ))}
            </View>
          </View>

          {/* White sheet that rises over the top area */}
          <View style={styles.sheet}>
          <View style={styles.sheetInner}>
          {/* Login form (plain View — no animated layer over the inputs) */}
          <View style={styles.authPanel}>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              Welcome <Text style={{ color: colors.primaryOrange }}>Back!</Text>
            </Text>
            <Text style={styles.subtitle}>Login with the username and password from your school.</Text>

            <Text style={styles.label}>Username</Text>
            <RNPressable style={[styles.field, focused === "user" && styles.fieldFocused]} onPress={() => userRef.current?.focus()} accessible={false}>
              <Ionicons name="person-outline" size={19} color={focused === "user" ? SKY : colors.textMuted} />
              <TextInput
                ref={userRef}
                editable={!loading}
                autoComplete="username"
                textContentType="username"
                importantForAutofill="yes"
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocused("user")}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
                onSubmitEditing={() => passRef.current?.focus()}
              />
            </RNPressable>

            <Text style={styles.label}>Password</Text>
            <RNPressable style={[styles.field, focused === "pass" && styles.fieldFocused]} onPress={() => passRef.current?.focus()} accessible={false}>
              <Ionicons name="lock-closed-outline" size={19} color={focused === "pass" ? SKY : colors.textMuted} />
              <TextInput
                ref={passRef}
                editable={!loading}
                autoComplete="password"
                textContentType="password"
                importantForAutofill="yes"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={() => void handleLogin()}
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={colors.textPlaceholder}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocused("pass")}
                onBlur={() => setFocused(null)}
              />
              <RNPressable onPress={() => setShowPassword((v) => !v)} hitSlop={10} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.textMuted} />
              </RNPressable>
            </RNPressable>

            <RNPressable style={styles.rememberRow} onPress={() => setRememberMe((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }}>
              <View style={[styles.check, rememberMe && styles.checkOn]}>{rememberMe ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}</View>
              <Text style={styles.rememberText}>Remember my username</Text>
            </RNPressable>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Pressable onPress={() => void handleLogin()} disabled={loading} style={[styles.loginBtn, loading && styles.loginBtnDisabled]} accessibilityRole="button">
              <LinearGradient colors={[...submitGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loginGradient}>
                <Text style={styles.loginBtnText}>{loading ? "Logging in…" : "Login"}</Text>
                {!loading ? (
                  <View style={styles.loginArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                  </View>
                ) : null}
              </LinearGradient>
            </Pressable>
          </View>

          <View style={styles.below}>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>New here?</Text>
              <View style={styles.orLine} />
            </View>
            <ServiceRegistration />

            {/* Help: compact row of round buttons */}
            <View style={styles.contactCard}>
              <Text style={styles.contactPrompt}>Need a login? Contact us</Text>
              <View style={styles.contactBtns}>
                <Pressable style={[styles.circleBtn, { backgroundColor: "#25D366" }]} onPress={handleWhatsAppPress} accessibilityLabel="WhatsApp">
                  <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
                </Pressable>
                <Pressable style={[styles.circleBtn, { backgroundColor: SKY }]} onPress={openCall} accessibilityLabel="Call">
                  <Ionicons name="call" size={20} color="#FFFFFF" />
                </Pressable>
                <Pressable style={[styles.circleBtn, { backgroundColor: "#E8243C" }]} onPress={openMail} accessibilityLabel="Email">
                  <Ionicons name="mail" size={20} color="#FFFFFF" />
                </Pressable>
                <Pressable style={[styles.circleBtn, { backgroundColor: colors.primaryOrange }]} onPress={openWebsite} accessibilityLabel="Website">
                  <Ionicons name="globe-outline" size={21} color="#FFFFFF" />
                </Pressable>
              </View>
              <Text style={styles.contactText} numberOfLines={1}>
                www.harshaidsolutions.in · {SUPPORT_EMAIL}
              </Text>
            </View>
          </View>
          </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const SKY = "#1EA0E1";

function useLoginStyles() {
  const { colors, isDark } = useTheme();
  return useResponsiveStyles(({ wp, scale }) => {
    const formW = Math.min(wp(100) - spacing.pagePad * 2, 440);
    const card = isDark ? colors.inputBg : "#FFFFFF";
    return {
      safe: { flex: 1 },
      flex: { flex: 1 },
      scroll: { flexGrow: 1, alignItems: "center" },
      top: { width: "100%", alignItems: "center", paddingBottom: scale(54), overflow: "hidden" },
      dotsRow: { flexDirection: "row", gap: 6, marginTop: scale(10) },
      dot: { width: 7, height: 7, borderRadius: 4 },
      sheet: {
        width: "100%",
        flexGrow: 1,
        marginTop: -scale(30),
        zIndex: 2,
        backgroundColor: card,
        borderTopLeftRadius: scale(32),
        borderTopRightRadius: scale(32),
        paddingTop: spacing.lg,
        shadowColor: "#1B1F3B",
        shadowOpacity: 0.08,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -6 },
        elevation: 10,
        alignItems: "center",
      },
      sheetInner: { width: formW },
      authPanel: { width: "100%" },
      title: {
        fontSize: scale(30),
        lineHeight: scale(42),
        paddingTop: scale(2),
        includeFontPadding: true,
        letterSpacing: -0.6,
        fontFamily: fonts.headingExtraBold,
        color: colors.textPrimary,
      },
      subtitle: { fontFamily: fonts.body, fontSize: scale(14), lineHeight: scale(20), color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
      label: { fontFamily: fonts.headingSemiBold, fontSize: scale(13.5), color: colors.textPrimary, marginBottom: 6 },
      field: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.xs,
        minHeight: scale(54),
        paddingHorizontal: spacing.sm,
        marginBottom: spacing.sm,
        borderRadius: scale(16),
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: isDark ? colors.inputBg : "#F6F7FC",
      },
      fieldFocused: { borderColor: SKY, backgroundColor: card },
      input: {
        flex: 1,
        ...textStyles.input,
        color: colors.textPrimary,
        paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
      },
      rememberRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.sm, alignSelf: "flex-start" },
      check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", backgroundColor: card },
      checkOn: { backgroundColor: colors.primaryOrange, borderColor: colors.primaryOrange },
      rememberText: { fontFamily: fonts.bodyMedium, fontSize: scale(13.5), color: colors.textSecondary },
      errorBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, padding: spacing.sm, borderRadius: scale(14), backgroundColor: colors.dangerSoft, marginBottom: spacing.sm },
      error: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: typeScale.label, color: colors.danger },
      loginBtn: {
        width: "100%",
        borderRadius: 999,
        minHeight: scale(56),
        overflow: "hidden",
        elevation: 6,
        shadowColor: "#F26A1B",
        shadowOpacity: 0.3,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      loginGradient: { width: "100%", minHeight: scale(56), borderRadius: 999, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
      loginArrow: { width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
      loginBtnDisabled: { opacity: 0.65 },
      loginBtnText: { ...textStyles.button, fontSize: scale(17), letterSpacing: 0.3, color: "#FFFFFF" },
      below: { width: "100%", alignItems: "center" },
      orRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, alignSelf: "stretch", marginTop: spacing.lg },
      orLine: { flex: 1, height: 1, backgroundColor: colors.border },
      orText: { fontFamily: fonts.bodyMedium, fontSize: scale(12.5), color: colors.textMuted },
      contactCard: {
        width: "100%",
        marginTop: spacing.md,
        alignItems: "center",
        gap: spacing.xs,
      },
      contactPrompt: { fontFamily: fonts.headingSemiBold, fontSize: scale(14.5), color: colors.textPrimary },
      contactBtns: { flexDirection: "row", gap: spacing.md },
      circleBtn: { width: scale(48), height: scale(48), borderRadius: scale(24), alignItems: "center", justifyContent: "center" },
      contactText: { fontFamily: fonts.body, fontSize: scale(12), color: colors.textMuted },
    };
  }, [colors, isDark]);
}
