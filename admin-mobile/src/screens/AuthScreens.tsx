import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { LoginResponse } from "../shared/types";
import { C, F, R, S, headerGradient, shadow } from "../theme";
import { Backdrop } from "../ui/Screen";
import { Banner, Button, Field, Muted, Rise } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { waLink } from "../lib/format";
import type { ScreenProps } from "../navigation/types";

function AuthShell({ title, subtitle, children, onBack }: { title: string; subtitle: string; children: ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}>
          <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 18 }]}>
            <View style={st.bubbleA} />
            <View style={st.bubbleB} />
            {onBack ? (
              <Tap onPress={onBack} style={st.back} accessibilityLabel="Back" hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={C.white} />
              </Tap>
            ) : null}
            <Rise>
              <View style={st.logoCard}>
                <Image source={require("../../assets/logo-mark.png")} style={{ width: 74, height: 74 }} contentFit="contain" />
              </View>
            </Rise>
            <Text style={st.brand}>My School ID Admin</Text>
            <Text style={st.brandSub}>by Harsha ID Solutions</Text>
          </LinearGradient>
          <Rise delay={80} style={st.cardWrap}>
            <View style={[st.card, shadow]}>
              <Text style={st.title}>{title}</Text>
              <Muted style={{ marginBottom: S.lg, fontSize: 14 }}>{subtitle}</Muted>
              {children}
            </View>
          </Rise>
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
    <AuthShell title="Welcome back 👋" subtitle="Log in to manage schools, students and ID cards.">
      <Banner text={error} />
      <Field label="Username or email" icon="person-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="admin@school.com" returnKeyType="next" />
      <Field label="Password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secure placeholder="Your password" returnKeyType="go" onSubmitEditing={() => void submit()} />
      <Tap onPress={() => navigation.navigate("Forgot")} style={{ alignSelf: "flex-end", marginBottom: S.lg }} hitSlop={8}>
        <Text style={st.link}>Forgot password?</Text>
      </Tap>
      <Button title="Log in" icon="log-in-outline" onPress={() => void submit()} loading={busy} />
      {contacts.phone || contacts.whatsapp || contacts.email ? (
        <View style={st.help}>
          <Muted style={{ textAlign: "center", marginBottom: S.sm }}>Need help or a login? Contact us</Muted>
          <View style={{ flexDirection: "row", gap: S.sm, justifyContent: "center", flexWrap: "wrap" }}>
            {contacts.whatsapp ? <Button small variant="soft" icon="logo-whatsapp" title="WhatsApp" onPress={() => void Linking.openURL(waLink(contacts.whatsapp))} /> : null}
            {contacts.phone ? <Button small variant="soft" icon="call-outline" title="Call" onPress={() => void Linking.openURL(`tel:${contacts.phone}`)} /> : null}
            {contacts.email ? <Button small variant="soft" icon="mail-outline" title="Email" onPress={() => void Linking.openURL(`mailto:${contacts.email}`)} /> : null}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: S.md, marginTop: S.lg }}>
        <Tap onPress={() => void Linking.openURL("https://harshaidsolutions.in/privacy-policy")}>
          <Text style={st.small}>Privacy Policy</Text>
        </Tap>
        <Text style={st.small}>·</Text>
        <Tap onPress={() => void Linking.openURL("https://harshaidsolutions.in/delete-account")}>
          <Text style={st.small}>Delete account</Text>
        </Tap>
      </View>
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
    <AuthShell title="Forgot password" subtitle="We will email you a 6-digit code to reset your password." onBack={() => navigation.goBack()}>
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
    <AuthShell title="Enter the code" subtitle={`We sent a code to ${email}.`} onBack={() => navigation.goBack()}>
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
    <AuthShell title="New password" subtitle="Choose a strong password you will remember." onBack={() => navigation.goBack()}>
      <Banner text={error} />
      <Field label="New password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secure />
      <Field label="Confirm password" icon="lock-closed-outline" value={confirm} onChangeText={setConfirm} secure />
      <Button title="Save password" icon="save-outline" onPress={() => void submit()} loading={busy} />
    </AuthShell>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: "center", paddingBottom: 70, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden" },
  bubbleA: { position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.13)", top: -70, right: -60 },
  bubbleB: { position: "absolute", width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.09)", bottom: -40, left: -30 },
  back: { position: "absolute", left: S.lg, top: 48, width: 40, height: 40, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center", zIndex: 2 },
  logoCard: { width: 100, height: 100, borderRadius: 30, backgroundColor: C.white, alignItems: "center", justifyContent: "center", ...shadow },
  brand: { fontFamily: F.hX, fontSize: 24, color: C.white, marginTop: S.md },
  brandSub: { fontFamily: F.bodyMed, fontSize: 13, color: "rgba(255,255,255,0.9)" },
  cardWrap: { paddingHorizontal: S.lg, marginTop: -48, width: "100%", maxWidth: 520, alignSelf: "center" },
  card: { backgroundColor: C.white, borderRadius: 26, padding: S.xl },
  title: { fontFamily: F.h, fontSize: 22, color: C.ink, marginBottom: 4 },
  link: { fontFamily: F.bodySemi, color: C.accentDeep, fontSize: 14 },
  help: { marginTop: S.xl, paddingTop: S.lg, borderTopWidth: 1, borderTopColor: C.line },
  small: { fontFamily: F.bodyMed, fontSize: 12, color: C.muted },
});

void R;
