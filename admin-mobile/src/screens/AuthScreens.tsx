import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { LoginResponse } from "../shared/types";
import { C, F, R, RAINBOW, S } from "../theme";
import { RainbowBar } from "../ui/Screen";
import { Banner, Button, Field, Muted, Rise } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { waLink } from "../lib/format";
import type { ScreenProps } from "../navigation/types";

/** Soft pulsing halo behind the admin logo. */
function LogoHalo({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={st.haloWrap}>
      <Animated.View style={[st.halo, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }] }]} />
      {children}
    </View>
  );
}

function AuthShell({ title, subtitle, eyebrow = "Admin console", children, onBack }: { title: string; subtitle: string; eyebrow?: string; children: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.white }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          {/* Dark "console" header with the admin app icon */}
          <LinearGradient colors={["#1B1F3B", "#2C2163", "#4A2A86"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 20 }]}>
            <View style={[st.glow, { backgroundColor: "#1EA0E1", top: -60, left: -50 }]} />
            <View style={[st.glow, { backgroundColor: "#F26A1B", bottom: -40, right: -60, opacity: 0.22 }]} />
            <View style={st.heroRow}>
              {onBack ? (
                <Tap onPress={onBack} style={st.back} accessibilityLabel="Back" hitSlop={10}>
                  <Ionicons name="chevron-back" size={22} color={C.white} />
                </Tap>
              ) : (
                <View style={{ width: 40 }} />
              )}
            </View>
            <Rise style={{ alignItems: "center" }}>
              <LogoHalo>
                <Image source={require("../../assets/logo-mark.png")} style={st.mark} contentFit="contain" />
              </LogoHalo>
              <Text style={st.brand}>My School ID Admin</Text>
              <View style={st.eyebrow}>
                <View style={st.eyebrowBar}>
                  {RAINBOW.map((c) => (
                    <View key={c} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </View>
                <Text style={st.eyebrowText}>{eyebrow.toUpperCase()}</Text>
              </View>
            </Rise>
            <RainbowBar style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
          </LinearGradient>

          {/* White sheet with the form */}
          <View style={[st.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Rise delay={90} style={st.wrap}>
              <Text style={st.title}>{title}</Text>
              <Muted style={{ marginBottom: S.lg, fontSize: 14 }}>{subtitle}</Muted>
              {children}
            </Rise>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function LoginScreen({ navigation }: ScreenProps<"Login">) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState<{ email?: string | null; phone?: string | null; whatsapp?: string | null }>({});

  useEffect(() => {
    void api
      .get("/auth/support-contacts")
      .then(({ data }) => setContacts(data ?? {}))
      .catch(() => undefined);
  }, []);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your username or email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", { audience: "admin", email: email.trim(), password });
      if (data.user.role !== "admin") {
        setError("This app is for admin accounts only.");
        return;
      }
      await login(data.token, data.user);
    } catch (e) {
      setError(errMsg(e, "Login failed. Check your username and password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Log in to manage schools, students and ID cards.">
      <Banner text={error} />
      <Field label="Username or email" icon="person-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="admin@school.com" returnKeyType="next" />
      <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secure placeholder="Your password" returnKeyType="go" onSubmitEditing={() => void submit()} />
      <Tap onPress={() => navigation.navigate("Forgot")} style={{ alignSelf: "flex-end", marginBottom: S.lg }} hitSlop={8}>
        <Text style={st.link}>Forgot password?</Text>
      </Tap>
      <Button title="Log in" icon="log-in-outline" onPress={() => void submit()} loading={busy} />
      {contacts.phone || contacts.whatsapp || contacts.email ? (
        <View style={st.help}>
          <Text style={st.helpText}>Need help or a login?</Text>
          <View style={{ flexDirection: "row", gap: S.sm }}>
            {contacts.whatsapp ? (
              <Tap style={[st.circle, { backgroundColor: "#25D366" }]} accessibilityLabel="WhatsApp" onPress={() => void Linking.openURL(waLink(contacts.whatsapp))}>
                <Ionicons name="logo-whatsapp" size={20} color={C.white} />
              </Tap>
            ) : null}
            {contacts.phone ? (
              <Tap style={[st.circle, { backgroundColor: C.accent }]} accessibilityLabel="Call" onPress={() => void Linking.openURL(`tel:${contacts.phone}`)}>
                <Ionicons name="call" size={18} color={C.white} />
              </Tap>
            ) : null}
            {contacts.email ? (
              <Tap style={[st.circle, { backgroundColor: C.rose }]} accessibilityLabel="Email" onPress={() => void Linking.openURL(`mailto:${contacts.email}`)}>
                <Ionicons name="mail" size={18} color={C.white} />
              </Tap>
            ) : null}
          </View>
        </View>
      ) : null}
    </AuthShell>
  );
}

export function ForgotScreen({ navigation }: ScreenProps<"Forgot">) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!email.trim()) return setError("Enter your registered email.");
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ codeSent?: boolean; devOtp?: string }>("/auth/forgot-password", { email: email.trim() });
      if (data.codeSent !== true) {
        setError("Please contact admin for password.");
        return;
      }
      navigation.navigate("VerifyOtp", { email: email.trim(), devOtp: data.devOtp });
    } catch (e) {
      setError(errMsg(e, "Failed to send reset email."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell eyebrow="Password help" title="Forgot password" subtitle="We will email you a 6-digit code to reset your password." onBack={() => navigation.goBack()}>
      <Banner text={error} />
      <Field label="Registered email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="admin@school.com" />
      <Button title="Send code" icon="paper-plane-outline" onPress={() => void submit()} loading={busy} />
    </AuthShell>
  );
}

export function VerifyOtpScreen({ navigation, route }: ScreenProps<"VerifyOtp">) {
  const { email, devOtp } = route.params;
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your email.");
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ resetToken: string }>("/auth/verify-reset-otp", { email, otp: code });
      navigation.replace("ResetPassword", { email, resetToken: data.resetToken });
    } catch (e) {
      setError(errMsg(e, "Invalid or expired code."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell eyebrow="Password help" title="Enter the code" subtitle={`We sent a code to ${email}.`} onBack={() => navigation.goBack()}>
      <Banner text={error} />
      {devOtp ? <Banner text={`Test code: ${devOtp}`} tone="amber" /> : null}
      <Field label="6-digit code" icon="keypad-outline" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" style={{ letterSpacing: 6, fontFamily: F.h, fontSize: 20 }} />
      <Button title="Verify" icon="checkmark-circle-outline" onPress={() => void submit()} loading={busy} />
    </AuthShell>
  );
}

export function ResetPasswordScreen({ navigation, route }: ScreenProps<"ResetPassword">) {
  const { email, resetToken } = route.params;
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { email, resetToken, newPassword: password });
      navigation.popToTop();
    } catch (e) {
      setError(errMsg(e, "Failed to reset password."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell eyebrow="Password help" title="New password" subtitle="Choose a strong password you will remember." onBack={() => navigation.goBack()}>
      <Banner text={error} />
      <Field label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secure />
      <Field label="Confirm password" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secure />
      <Button title="Save password" icon="save-outline" onPress={() => void submit()} loading={busy} />
    </AuthShell>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: S.lg, paddingBottom: 56, overflow: "hidden" },
  glow: { position: "absolute", width: 220, height: 220, borderRadius: 110, opacity: 0.28 },
  heroRow: { flexDirection: "row", height: 40, marginBottom: 4 },
  back: { width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  haloWrap: { width: 108, height: 108, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: 92, height: 92, borderRadius: 28, backgroundColor: "#8E4FC4" },
  mark: { width: 88, height: 88, borderRadius: 24 },
  brand: { fontFamily: F.hX, fontSize: 24, color: C.white, marginTop: S.md, letterSpacing: -0.5 },
  eyebrow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, paddingVertical: 5, paddingLeft: 7, paddingRight: 11, marginTop: 8 },
  eyebrowBar: { width: 20, height: 7, borderRadius: 4, overflow: "hidden", flexDirection: "row" },
  eyebrowText: { fontFamily: F.h, fontSize: 10, letterSpacing: 1.6, color: C.white },
  sheet: { flexGrow: 1, marginTop: -28, backgroundColor: C.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: S.xl, paddingTop: S.xl + 4 },
  wrap: { width: "100%", maxWidth: 480, alignSelf: "center" },
  title: { fontFamily: F.hX, fontSize: 27, color: C.ink, marginBottom: 2, letterSpacing: -0.6 },
  link: { fontFamily: F.bodySemi, color: C.primary, fontSize: 14 },
  help: { marginTop: S.lg, paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: S.sm },
  helpText: { fontFamily: F.bodyMed, fontSize: 13, color: C.muted, flexShrink: 1 },
  circle: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  small: { fontFamily: F.bodyMed, fontSize: 12, color: C.muted },
});

void R;
