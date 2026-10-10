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
import { SafeAreaView } from "react-native-safe-area-context";
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
const LOGIN_BG = "#F2FAF5";

export function LoginScreen(_props: Props) {
  const styles = useLoginStyles();
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
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
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
            <View style={styles.identityPanel}>
            <AppIcon size={Math.min(logoSize, 104)} />
            <BrandLockup
              variant="hero"
              title={BRAND.appName}
              subtitle={BRAND.headerSubtitle}
              showTagline={false}
              singleLine
              style={{ marginTop: spacing.sm }}
            />

            </View>
            <Entrance style={styles.authPanel}><View style={styles.portalTag}><Ionicons name="shield-checkmark-outline" color="#005C55" size={16} /><Text style={styles.portalTagText}>AUTHORIZED PORTAL</Text></View>
            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>Login to continue</Text>

            <View style={styles.formGroup}><Text style={styles.fieldLabel}>USERNAME</Text>
              <View style={styles.formRow}>
                <Ionicons name="person-outline" size={18} color="#7A83A0" />
                <TextInput
                  style={styles.input}
                  placeholder="Username"
                  placeholderTextColor="#B0B8C4"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  value={username}
                  onChangeText={setUsername}
                />
              </View>
              <View style={styles.formDivider} /><Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.formRow}>
                <Ionicons name="lock-closed-outline" size={18} color="#7A83A0" />
                <TextInput
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="#B0B8C4"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#7A83A0"
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.rememberRow}><Pressable onPress={() => setRememberMe((v) => !v)} style={styles.rememberPress} accessibilityLabel="Remember me"><Ionicons name={rememberMe ? "checkbox" : "square-outline"} color="#005C55" size={19} /><Text style={styles.rememberText}>Remember me</Text></Pressable></View>{error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void handleLogin()}
              disabled={loading}
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            >
              <Text style={styles.loginBtnText}>
                {loading ? "Logging in…" : "Sign In"}
              </Text>
            </Pressable>

            </Entrance>
            <Text style={styles.contactPrompt}>
              Please contact us if you want login
            </Text>

            <View style={styles.contactBtns}>
              <Pressable style={styles.waBtn} onPress={handleWhatsAppPress}>
                <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                <Text style={styles.contactBtnText}>WhatsApp</Text>
              </Pressable>
              <Pressable style={styles.callBtn} onPress={openCall}>
                <Ionicons name="call" size={18} color="#FFFFFF" />
                <Text style={styles.contactBtnText}>Call</Text>
              </Pressable>
            </View>

            <Pressable style={styles.contactRow} onPress={openWebsite}>
              <Ionicons name="globe-outline" size={18} color="#D66A32" />
              <Text style={styles.contactText}>www.harshaidsolutions.in</Text>
            </Pressable>

            <Pressable style={styles.contactRow} onPress={openMail}>
              <Ionicons name="mail" size={18} color="#D66A32" />
              <Text style={styles.contactText}>{SUPPORT_EMAIL}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </KeyboardDismissView>
    </SafeAreaView>
  );
}

function useLoginStyles() {
  return useResponsiveStyles(({ wp, scale }) => {
    const formW = Math.min(wp(100) - spacing.pagePad * 2, 480);
    return {
      safe: { flex: 1, backgroundColor: "#FAF8FF" },
      flex: { flex: 1 },
      scroll: {
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.pagePad,
        paddingVertical: spacing.lg,
      },
      identityPanel: { alignItems: "center", width: formW, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: "#EBF9F5", borderRadius: scale(30), marginBottom: spacing.sm },
      // A generous responsive login surface; fields and callbacks stay exactly the same.
      authPanel: { width: formW, padding: spacing.lg, backgroundColor: "#FFFFFF", borderRadius: scale(32), borderWidth: 1, borderColor: "#E7EBF4", shadowColor: "#005C55", shadowOpacity: 0.10, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
      title: { fontSize: scale(28), fontFamily: fonts.headingSemiBold, color: "#131B2E", textAlign: "left", marginTop: spacing.sm },
      subtitle: { fontSize: typeScale.body, fontFamily: fonts.body, color: "#66757B", textAlign: "left", marginTop: spacing.xs, marginBottom: spacing.lg },
      formGroup: { width: "100%", marginBottom: spacing.sm, borderWidth: 0, borderRadius: scale(20), backgroundColor: "#FFFFFF", overflow: "hidden" },
      formRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: scale(56), backgroundColor: "#EAEDFF", borderRadius: scale(18), marginBottom: spacing.xs },
      formDivider: { height: spacing.xs, backgroundColor: "transparent" },
      input: {
        flex: 1,
        ...textStyles.input,
        color: "#29463A",
        paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
      },
      error: {
        marginBottom: spacing.xs,
        fontFamily: fonts.body,
        fontSize: typeScale.body,
        color: "#DC2626",
        textAlign: "center",
        width: "100%",
      },
      loginBtn: { width: "100%", minHeight: scale(56), alignSelf: "center", alignItems: "center", justifyContent: "center", backgroundColor: "#005C55", borderRadius: 999, marginTop: spacing.sm, elevation: 4, shadowColor: "#005C55", shadowOpacity: 0.24, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      portalTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: spacing.xs, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, backgroundColor: "#D8F8E9", marginBottom: spacing.sm },
      portalTagText: { fontFamily: fonts.semiBold, letterSpacing: 1, fontSize: typeScale.xs, color: "#005C55" },
      fieldLabel: { fontFamily: fonts.semiBold, fontSize: typeScale.xs, letterSpacing: 0.6, color: "#344454", marginTop: spacing.xs, marginBottom: spacing.xs },
      rememberRow: { marginVertical: spacing.sm },
      rememberPress: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
      rememberText: { fontFamily: fonts.medium, color: "#344454", fontSize: typeScale.subtitle },
      loginBtnDisabled: { opacity: 0.65 },
      loginBtnText: {
        ...textStyles.button,
        color: "#FFFFFF",
      },
      contactPrompt: {
        textAlign: "center",
        fontFamily: fonts.body,
        fontSize: typeScale.subtitle,
        color: "#207E52",
        marginTop: spacing.md,
        marginBottom: spacing.sm,
        width: formW,
      },
      contactBtns: {
        flexDirection: "row",
        gap: spacing.sm,
        marginBottom: spacing.sm,
        width: formW,
      },
      waBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        borderRadius: radius.buttonPill,
        backgroundColor: "#218451",
      },
      callBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        borderRadius: radius.buttonPill,
        backgroundColor: "#EAA563",
      },
      contactBtnText: {
        fontFamily: fonts.headingSemiBold,
        fontSize: typeScale.body,
        color: "#FFFFFF",
      },
      contactRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        marginBottom: spacing.xs,
        width: formW,
      },
      contactText: {
        fontFamily: fonts.body,
        fontSize: typeScale.subtitle,
        color: "#29463A",
      },
    };
  });
}
