import { BRAND as THEME } from "../theme/brandTheme";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import {ServiceRegistration} from "../components/ServiceRegistration";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../theme/ThemeContext";
import { Entrance } from "../components/Entrance";
import { Pressable } from "../components/Pressable";
import { API_BASE_URL } from "../api/client";
import axios from "axios";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FloatingShapes } from "../components/FloatingShapes";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { AppIcon } from "../components/AppIcon";
import { loginLogoSize } from "../constants/headerLogo";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { BrandLockup } from "../components/BrandLockup";
import { BRAND } from "../constants/brand";
import { KeyboardDismissView } from "../components/KeyboardDismissView";
import type { LoginResponse } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { cardShadow, radius, spacing } from "../theme/colors";
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
  const { width } = useResponsiveLayout();
  const logoSize = loginLogoSize(width);
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
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={["bottom"]}><ScreenBackdrop />
      <KeyboardDismissView style={styles.flex}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient colors={isDark ? ["rgba(19,28,46,0.6)", "rgba(11,18,32,0)"] : ["rgba(255,255,255,0.75)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[styles.hero, { paddingTop: insets.top + spacing.xl }]}>
              <FloatingShapes color={isDark ? "#FFFFFF" : colors.primaryOrange} />
              <View style={styles.heroAccent} />
              <Entrance style={styles.identityPanel}>
                <View style={styles.logoCard}>
                  <BrandLockup
                    variant="hero"
                    harshaColor={colors.textPrimary}
                    solutionsColor={colors.primaryOrange}
                    taglineColor={colors.textMuted}
                    title={BRAND.appName}
                    subtitle={BRAND.headerSubtitle}
                    showTagline={false}
                    singleLine
                  />
                </View>
              </Entrance>
            </LinearGradient>

            <Entrance style={styles.authPanel} delay={120}>
              <View style={styles.titleBadge}>
                <Ionicons name="shield-checkmark" size={14} color={colors.orangeDark} />
                <Text style={styles.titleBadgeText}>Teacher & staff login</Text>
              </View>
              <Text style={styles.title}>Welcome Back!</Text>
              <Text style={styles.subtitle}>Login to continue</Text>

              <View style={[styles.field, focused === "user" && styles.fieldFocused]}>
                <View style={[styles.fieldIcon, focused === "user" && styles.fieldIconFocused]}>
                  <Ionicons name="person" size={17} color={focused === "user" ? "#FFFFFF" : colors.primaryOrange} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor={colors.textPlaceholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  value={username}
                  onChangeText={setUsername}
                  onFocus={() => setFocused("user")}
                  onBlur={() => setFocused(null)}
                />
              </View>
              <View style={[styles.field, focused === "pass" && styles.fieldFocused]}>
                <View style={[styles.fieldIcon, focused === "pass" && styles.fieldIconFocused]}>
                  <Ionicons name="lock-closed" size={16} color={focused === "pass" ? "#FFFFFF" : colors.primaryOrange} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor={colors.textPlaceholder}
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocused("pass")}
                  onBlur={() => setFocused(null)}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.textMuted}
                  />
                </Pressable>
              </View>

              {error ? (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={colors.danger} />
                  <Text style={styles.error}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => void handleLogin()}
                disabled={loading}
                style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              >
                <LinearGradient colors={[...submitGradient]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.loginGradient}>
                  <Text style={styles.loginBtnText}>
                    {loading ? "Logging in…" : "Login"}
                  </Text>
                  {!loading ? <View style={styles.loginArrow}><Ionicons name="arrow-forward" size={18} color="#FFFFFF" /></View> : null}
                </LinearGradient>
              </Pressable>
            </Entrance>

            <Entrance style={styles.below} delay={240}>
              <ServiceRegistration />
              <View style={styles.contactCard}>
                <Text style={styles.contactPrompt}>
                  Please contact us if you want login
                </Text>

                <View style={styles.contactBtns}>
                  <Pressable style={styles.waBtn} onPress={handleWhatsAppPress}>
                    <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                    <Text style={styles.contactBtnText}>WhatsApp</Text>
                  </Pressable>
                  <Pressable style={styles.callBtn} onPress={openCall}>
                    <Ionicons name="call" size={18} color={colors.primaryOrange} />
                    <Text style={[styles.contactBtnText, { color: colors.primaryOrange }]}>Call</Text>
                  </Pressable>
                </View>

                <View style={styles.linkRow}>
                  <Pressable style={styles.contactRow} onPress={openWebsite}>
                    <Ionicons name="globe-outline" size={16} color={colors.primaryOrange} />
                    <Text style={styles.contactText} numberOfLines={1}>www.harshaidsolutions.in</Text>
                  </Pressable>

                  <Pressable style={styles.contactRow} onPress={openMail}>
                    <Ionicons name="mail-outline" size={16} color={colors.primaryOrange} />
                    <Text style={styles.contactText} numberOfLines={1}>{SUPPORT_EMAIL}</Text>
                  </Pressable>
                </View>
              </View>
            </Entrance>
          </ScrollView>
        </KeyboardAvoidingView>
      </KeyboardDismissView>
    </SafeAreaView>
  );
}

function useLoginStyles() {
  const { colors } = useTheme();
  return useResponsiveStyles(({ wp, scale }) => {
    const formW = Math.min(wp(100) - spacing.pagePad * 2, 440);
    return {
      safe: { flex: 1, backgroundColor: colors.background },
      flex: { flex: 1 },
      scroll: {
        flexGrow: 1,
        alignItems: "center",
        paddingBottom: spacing.xl,
      },
      hero: {
        width: "100%",
        alignItems: "center",
        paddingBottom: scale(84),
        borderBottomLeftRadius: scale(32),
        borderBottomRightRadius: scale(32),
        overflow: "hidden",
      },
      identityPanel: { alignItems: "center", width: formW },
      logoCard: {
        alignItems: "center",
        paddingHorizontal: spacing.xs,
      },
      heroAccent: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 3,
        backgroundColor: colors.brandOrange,
        opacity: 0.85,
      },
      authPanel: {
        width: formW,
        marginTop: -scale(56),
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        backgroundColor: colors.surface,
        borderRadius: scale(28),
        shadowColor: THEME.primaryDeep,
        shadowOpacity: 0.12,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 6,
      },
      titleBadge: {
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: spacing.sm,
        paddingVertical: scale(5),
        borderRadius: radius.full,
        backgroundColor: colors.orangeSoft,
      },
      titleBadgeText: { fontFamily: fonts.headingSemiBold, fontSize: scale(12), color: colors.orangeDark },
      title: {
        marginTop: spacing.sm,
        fontSize: scale(28),
        letterSpacing: -0.3,
        fontFamily: fonts.headingExtraBold,
        textAlign: "center",
        color: colors.textPrimary,
      },
      subtitle: {
        marginTop: scale(2),
        marginBottom: spacing.lg,
        fontFamily: fonts.body,
        fontSize: typeScale.subtitle,
        color: colors.textMuted,
        textAlign: "center",
      },
      field: {
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.sm,
        minHeight: scale(56),
        paddingLeft: scale(8),
        paddingRight: spacing.md,
        marginBottom: spacing.sm,
        borderRadius: scale(18),
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.inputBg,
      },
      fieldFocused: { borderColor: colors.primaryOrange, backgroundColor: colors.surface },
      fieldIcon: { width: scale(40), height: scale(40), borderRadius: scale(13), alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft },
      fieldIconFocused: { backgroundColor: colors.primaryOrange },
      input: {
        flex: 1,
        ...textStyles.input,
        color: colors.textPrimary,
        paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
      },
      errorBox: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs, padding: spacing.sm, borderRadius: scale(14), backgroundColor: colors.dangerSoft, marginBottom: spacing.sm },
      error: {
        flex: 1,
        fontFamily: fonts.bodyMedium,
        fontSize: typeScale.label,
        color: colors.danger,
      },
      loginBtn: {
        width: "100%",
        alignSelf: "center",
        borderRadius: scale(18),
        minHeight: scale(56),
        marginTop: spacing.xs,
        overflow: "hidden",
        elevation: 6,
        shadowColor: THEME.primaryDeep,
        shadowOpacity: 0.35,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      loginGradient: { width: "100%", minHeight: scale(56), paddingVertical: spacing.sm, borderRadius: scale(18), flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
      loginArrow: { width: scale(28), height: scale(28), borderRadius: scale(14), backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
      loginBtnDisabled: { opacity: 0.65 },
      loginBtnText: {
        ...textStyles.button,
        color: "#FFFFFF",
      },
      below: { width: formW, alignItems: "center" },
      contactCard: {
        width: "100%",
        marginTop: spacing.md,
        padding: spacing.md,
        borderRadius: scale(24),
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
      },
      contactPrompt: {
        textAlign: "center",
        fontFamily: fonts.headingSemiBold,
        fontSize: typeScale.label,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
      },
      contactBtns: {
        flexDirection: "row",
        gap: spacing.sm,
        marginBottom: spacing.sm,
      },
      waBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        minHeight: scale(48),
        borderRadius: scale(16),
        backgroundColor: colors.whatsappGreen,
      },
      callBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        minHeight: scale(48),
        borderRadius: scale(16),
        backgroundColor: colors.blueSoft,
      },
      contactBtnText: {
        fontFamily: fonts.headingSemiBold,
        fontSize: typeScale.body,
        color: "#FFFFFF",
      },
      linkRow: { gap: scale(6), alignItems: "center" },
      contactRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingVertical: scale(4),
        maxWidth: "100%",
      },
      contactText: {
        fontFamily: fonts.bodyMedium,
        fontSize: typeScale.label,
        color: colors.textBody,
      },
    };
  }, [colors]);
}
