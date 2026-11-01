import { useEffect, useRef, useState } from "react";
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "./Pressable";
import { RainbowBar } from "./RainbowBar";
import api, { getErrorMessage } from "../api/client";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

const INK = "#1B1F3B";
const MUTED = "#6B7090";
const LINE = "#E8E9F3";
const CTA = ["#FF8A1F", "#F26A1B", "#E8243C"] as const;
const COOL = ["#1EA0E1", "#4A63C4", "#6A2C9E"] as const;

type Key = "name" | "phone" | "email" | "organization" | "message";
const FIELDS: { key: Key; label: string; icon: keyof typeof Ionicons.glyphMap; placeholder: string }[] = [
  { key: "name", label: "Your name *", icon: "person-outline", placeholder: "Full name" },
  { key: "phone", label: "Phone number *", icon: "call-outline", placeholder: "10-digit mobile number" },
  { key: "email", label: "Email", icon: "mail-outline", placeholder: "name@example.com" },
  { key: "organization", label: "School / institute name", icon: "school-outline", placeholder: "e.g. Sri Vidya High School" },
  { key: "message", label: "What do you need?", icon: "chatbubble-ellipses-outline", placeholder: "ID cards, photos, lanyards…" },
];

/**
 * "Register your interest" — a bright card on the login page that opens a short form.
 * New schools / institutes leave their details and the admin calls them back.
 */
export function ServiceRegistration() {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [focus, setFocus] = useState<Key | null>(null);
  const [form, setForm] = useState<Record<Key, string>>({ name: "", phone: "", email: "", organization: "", message: "" });

  // Gentle pulse on the school icon.
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  async function submit() {
    if (!form.name.trim() || !form.phone.trim()) {
      setMessage("Please enter your name and phone number.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await api.post("/public/service-registration", form);
      setMessage(r.data?.message ?? "Thank you! We will call you soon.");
      setDone(true);
    } catch (e) {
      setMessage(getErrorMessage(e, "Could not register. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    if (busy) return;
    setOpen(false);
    if (done) {
      setDone(false);
      setMessage("");
      setForm({ name: "", phone: "", email: "", organization: "", message: "" });
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Register your interest" style={[st.card, isDark && { backgroundColor: colors.inputBg }]}>
        <LinearGradient colors={[...CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.cardIcon}>
          <Animated.View style={{ transform: [{ scale: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] }}>
            <Ionicons name="school" size={22} color="#FFFFFF" />
          </Animated.View>
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[st.cardTitle, isDark && { color: colors.textPrimary }]}>Register your interest</Text>
          <Text style={st.cardText}>New school or institute? We will call you.</Text>
        </View>
        <View style={st.cardBtn}>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </View>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={close} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: isDark ? colors.background : "#F6F7FC" }}>
          <LinearGradient colors={[...COOL]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.head, { paddingTop: insets.top + 14 }]}>
            <View style={st.headRow}>
              <View style={st.headIcon}>
                <Ionicons name="school" size={22} color="#FFFFFF" />
              </View>
              <Pressable onPress={close} style={st.closeBtn} accessibilityLabel="Close" hitSlop={8}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <Text style={st.headTitle}>Register your interest</Text>
            <Text style={st.headText}>Share your details and our team will contact you. This does not create a login.</Text>
            <RainbowBar style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
          </LinearGradient>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 14 }}>
              {done ? (
                <View style={st.done}>
                  <View style={st.doneIcon}>
                    <Ionicons name="checkmark" size={34} color="#FFFFFF" />
                  </View>
                  <Text style={st.doneTitle}>Thank you!</Text>
                  <Text style={st.doneText}>{message || "We have your details and will call you soon."}</Text>
                </View>
              ) : (
                FIELDS.map((f) => (
                  <View key={f.key}>
                    <Text style={st.label}>{f.label}</Text>
                    <View style={[st.field, focus === f.key && st.fieldOn, f.key === "message" && { alignItems: "flex-start", paddingTop: 12 }]}>
                      <Ionicons name={f.icon} size={18} color={focus === f.key ? "#1EA0E1" : MUTED} />
                      <TextInput
                        accessibilityLabel={f.label}
                        value={form[f.key]}
                        onChangeText={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                        onFocus={() => setFocus(f.key)}
                        onBlur={() => setFocus(null)}
                        editable={!busy}
                        placeholder={f.placeholder}
                        placeholderTextColor="#A3A7C2"
                        keyboardType={f.key === "phone" ? "phone-pad" : f.key === "email" ? "email-address" : "default"}
                        autoCapitalize={f.key === "email" ? "none" : "sentences"}
                        maxLength={f.key === "message" ? 2000 : 120}
                        multiline={f.key === "message"}
                        style={[st.input, f.key === "message" && { minHeight: 84, textAlignVertical: "top" }]}
                      />
                    </View>
                  </View>
                ))
              )}

              {!done && message ? (
                <View style={st.error}>
                  <Ionicons name="alert-circle" size={18} color="#E8243C" />
                  <Text style={st.errorText}>{message}</Text>
                </View>
              ) : null}

              {!done ? (
                <Pressable disabled={busy} onPress={() => void submit()} style={st.submit} accessibilityRole="button">
                  <LinearGradient colors={[...CTA]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.submitFill}>
                    <Ionicons name="paper-plane" size={18} color="#FFFFFF" />
                    <Text style={st.submitText}>{busy ? "Sending…" : "Send my details"}</Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
              <Pressable disabled={busy} onPress={close} style={st.ghost} accessibilityRole="button">
                <Text style={st.ghostText}>{done ? "Done" : "Cancel"}</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  card: { alignSelf: "stretch", marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 20, backgroundColor: "#FFF6EF", borderWidth: 1.5, borderColor: "#FCD9C2" },
  cardIcon: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 15, color: INK },
  cardText: { fontFamily: fonts.body, fontSize: 12.5, color: MUTED, marginTop: 1 },
  cardBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#F26A1B", alignItems: "center", justifyContent: "center" },

  head: { paddingHorizontal: 22, paddingBottom: 24, borderBottomLeftRadius: 26, borderBottomRightRadius: 26, overflow: "hidden" },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  headIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.headingExtraBold, fontSize: 25, color: "#FFFFFF", letterSpacing: -0.5 },
  headText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: "rgba(255,255,255,0.9)", marginTop: 4 },

  label: { fontFamily: fonts.headingSemiBold, fontSize: 13.5, color: INK, marginBottom: 6 },
  field: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1.5, borderColor: LINE, backgroundColor: "#FFFFFF" },
  fieldOn: { borderColor: "#1EA0E1" },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: INK, paddingVertical: 10 },
  error: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: 14, backgroundColor: "#FDECEE" },
  errorText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, color: "#E8243C" },
  submit: { borderRadius: 999, overflow: "hidden", marginTop: 4 },
  submitFill: { minHeight: 54, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  submitText: { fontFamily: fonts.headingBold, fontSize: 16, color: "#FFFFFF" },
  ghost: { minHeight: 50, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: LINE },
  ghostText: { fontFamily: fonts.headingSemiBold, fontSize: 15, color: INK },
  done: { alignItems: "center", paddingVertical: 28, gap: 8 },
  doneIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  doneTitle: { fontFamily: fonts.headingExtraBold, fontSize: 22, color: INK },
  doneText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: MUTED, textAlign: "center" },
});
