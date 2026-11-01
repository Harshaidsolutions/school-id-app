import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { C, F, headerGradient } from "../theme";
import { Tap } from "./Pressable";
import { Avatar } from "./kit";
import { RainbowBar } from "./Screen";

/** Logout confirmation: gradient top with the admin's photo, pulsing exit badge, pill buttons. */
export function LogoutModal({
  visible,
  name,
  photo,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  name: string;
  photo?: { uri: string; headers?: Record<string, string> } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      pop.setValue(0);
      return;
    }
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pop, pulse]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <Pressable style={st.backdrop} onPress={onCancel} accessibilityLabel="Close">
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[st.card, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] }]}
        >
          <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={st.top}>
            <View style={st.bubble} />
            <View>
              <View style={st.avatarRing}>
                <Avatar name={name} uri={photo?.uri} headers={photo?.headers} size={72} />
              </View>
              <Animated.View style={[st.badge, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }] }]}>
                <Ionicons name="log-out" size={16} color={C.white} />
              </Animated.View>
            </View>
            <RainbowBar style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
          </LinearGradient>
          <View style={st.body}>
            <Text style={st.title}>Log out, {name.split(" ")[0]}?</Text>
            <Text style={st.text}>You will need your username and password to log in again on this phone.</Text>
            <View style={st.row}>
              <Tap onPress={onCancel} style={[st.btn, st.stay]} accessibilityRole="button">
                <Text style={[st.btnText, { color: C.ink }]}>Stay</Text>
              </Tap>
              <Tap onPress={onConfirm} style={st.btn} accessibilityRole="button">
                <LinearGradient colors={["#F04B5E", "#E8243C", "#C81E33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                <Ionicons name="log-out-outline" size={18} color={C.white} />
                <Text style={st.btnText}>Logout</Text>
              </Tap>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.overlay, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: C.white, borderRadius: 26, overflow: "hidden", elevation: 16, shadowColor: "#1B1F3B", shadowOpacity: 0.22, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } },
  top: { alignItems: "center", paddingTop: 26, paddingBottom: 26, overflow: "hidden" },
  bubble: { position: "absolute", width: 160, height: 160, borderRadius: 80, top: -60, right: -40, backgroundColor: "rgba(255,255,255,0.12)" },
  avatarRing: { padding: 3, borderRadius: 30, backgroundColor: "rgba(255,255,255,0.9)" },
  badge: { position: "absolute", right: -8, bottom: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: C.danger, borderWidth: 3, borderColor: C.white, alignItems: "center", justifyContent: "center" },
  body: { padding: 22, paddingTop: 18, alignItems: "center" },
  title: { fontFamily: F.hX, fontSize: 21, color: C.ink, textAlign: "center", letterSpacing: -0.3 },
  text: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.muted, textAlign: "center", marginTop: 6 },
  row: { flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" },
  btn: { flex: 1, minHeight: 50, borderRadius: 999, overflow: "hidden", flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  stay: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  btnText: { fontFamily: F.hSemi, fontSize: 15.5, color: C.white },
});
