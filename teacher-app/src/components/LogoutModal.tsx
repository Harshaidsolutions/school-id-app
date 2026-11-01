import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable } from "./Pressable";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

/** Modern logout confirmation (replaces the plain system alert). */
export function LogoutModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) {
      anim.setValue(0);
      return;
    }
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }).start();
  }, [visible, anim]);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, pulse]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24 }} onPress={onCancel} accessibilityLabel="Close">
        <Animated.View
          onStartShouldSetResponder={() => true}
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 26,
            backgroundColor: colors.surface === "rgba(255,255,255,0.86)" ? "#FFFFFF" : colors.inputBg,
            paddingHorizontal: 22,
            paddingTop: 26,
            paddingBottom: 20,
            alignItems: "center",
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 14 },
            elevation: 14,
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
          }}
        >
          <View style={{ alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <Animated.View
              style={{
                position: "absolute",
                width: 86,
                height: 86,
                borderRadius: 43,
                backgroundColor: colors.dangerSoft,
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.12] }) }],
              }}
            />
            <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.danger }}>
              <Ionicons name="log-out-outline" size={30} color="#FFFFFF" />
            </View>
          </View>
          <Text style={{ fontFamily: fonts.headingBold, fontSize: 21, color: colors.textPrimary, textAlign: "center" }}>Logout?</Text>
          <Text style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, textAlign: "center", marginTop: 6 }}>
            Are you sure you want to logout? You can login again any time with your username and password.
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 22, alignSelf: "stretch" }}>
            <Pressable
              onPress={onCancel}
              style={{ flex: 1, minHeight: 50, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}
              accessibilityRole="button"
            >
              <Text style={{ fontFamily: fonts.headingSemiBold, fontSize: 16, color: colors.primaryOrange }}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} style={{ flex: 1, minHeight: 50, borderRadius: 15, overflow: "hidden" }} accessibilityRole="button">
              <LinearGradient
                colors={[colors.danger, "#B91C1C"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}
              >
                <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
                <Text style={{ fontFamily: fonts.headingSemiBold, fontSize: 16, color: "#FFFFFF" }}>Logout</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}
