import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type AlertButton, type AlertOptions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { C, F, primaryGradient } from "../theme";
import { Tap } from "./Pressable";
import { RainbowBar } from "./Screen";

type Pending = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };

let show: ((p: Pending) => void) | null = null;
const queue: Pending[] = [];
const nativeAlert = Alert.alert.bind(Alert);

/**
 * Every Alert.alert in the app opens this styled popup instead of the plain grey
 * system dialog (same look as the website: white card, rainbow strip, pill buttons).
 */
Alert.alert = (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
  const p: Pending = { title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }], options };
  if (show) show(p);
  else if (queue.length < 20) queue.push(p);
  else nativeAlert(title, message, buttons, options);
};

export function AlertHost() {
  const [current, setCurrent] = useState<Pending | null>(null);
  const pending = useRef<Pending[]>([]);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    show = (p) => {
      setCurrent((cur) => {
        if (cur) {
          pending.current.push(p);
          return cur;
        }
        return p;
      });
    };
    if (queue.length) setCurrent(queue.shift() ?? null);
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
  }, [current, anim]);

  const close = (after?: () => void) => {
    setCurrent(pending.current.shift() ?? null);
    after?.();
  };

  if (!current) return null;
  const destructive = current.buttons.some((b) => b.style === "destructive");
  const dismissable = current.options?.cancelable !== false;
  const onBackdrop = () => {
    if (!dismissable) return;
    const cancel = current.buttons.find((b) => b.style === "cancel");
    close(() => {
      cancel?.onPress?.();
      current.options?.onDismiss?.();
    });
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onBackdrop}>
      <Pressable style={st.backdrop} onPress={onBackdrop} accessibilityLabel="Close">
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={[st.card, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
        >
          <RainbowBar style={{ position: "absolute", top: 0, left: 0, right: 0 }} />
          <View style={[st.icon, { backgroundColor: destructive ? C.dangerSoft : C.primarySoft }]}>
            <Ionicons name={destructive ? "alert-circle" : "information-circle"} size={28} color={destructive ? C.danger : C.primary} />
          </View>
          <Text style={st.title}>{current.title}</Text>
          {current.message ? <Text style={st.message}>{current.message}</Text> : null}
          <View style={[st.buttons, current.buttons.length > 2 && { flexDirection: "column" }]}>
            {current.buttons.map((b, i) => {
              const main = b.style === "destructive" || (b.style !== "cancel" && i === current.buttons.length - 1);
              return (
                <Tap key={`${b.text}-${i}`} onPress={() => close(() => b.onPress?.())} style={[st.btn, current.buttons.length <= 2 && { flex: 1 }, !main && st.btnSoft]}>
                  {main ? (
                    <LinearGradient
                      colors={b.style === "destructive" ? ["#F04B5E", "#E8243C", "#C81E33"] : primaryGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Text style={[st.btnText, !main && { color: C.ink }]}>{b.text ?? "OK"}</Text>
                </Tap>
              );
            })}
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.overlay, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, backgroundColor: C.white, borderRadius: 24, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 20, alignItems: "center", overflow: "hidden", elevation: 14, shadowColor: "#1B1F3B", shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  title: { fontFamily: F.h, fontSize: 19, color: C.ink, textAlign: "center", letterSpacing: -0.2 },
  message: { fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: C.muted, textAlign: "center", marginTop: 6 },
  buttons: { flexDirection: "row", gap: 10, marginTop: 20, alignSelf: "stretch" },
  btn: { minHeight: 48, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, overflow: "hidden" },
  btnSoft: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.line },
  btnText: { fontFamily: F.hSemi, fontSize: 15, color: C.white },
});
