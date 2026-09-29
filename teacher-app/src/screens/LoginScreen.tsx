import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
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
  buildHelpSupportMessage,
} from "../constants/support";
import { openWhatsApp } from "../utils/whatsappBusiness";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

const REMEMBER_KEY = "teacher_remember_username";
const REMEMBER_FLAG = "teacher_remember_me";
const LOGIN_BG = "#F9F9F7";

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
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        email: username.trim(),
        password,
      });

      if (data.user.role !== "teacher" && data.user.role !== "institute_staff") {
        setError("This app is for school and institute accounts only.");
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
      setError(getErrorMessage(err, "Login failed. Check your credentials."));
    } finally {
      setLoading(false);
    }
  }

  function handleWhatsAppPress() {
    void openWhatsApp(buildHelpSupportMessage("Your School"));
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
            <AppIcon size={logoSize} />
            <BrandLockup variant="hero" showTagline={false} style={{ marginTop: spacing.sm }} />

            <Text style={styles.title}>Welcome Back!</Text>
            <Text style={styles.subtitle}>Login to continue</Text>

            <View style={styles.formGroup}>
              <View style={styles.formRow}>
                <Ionicons name="person-outline" size={18} color="#9CA3AF" />
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
              <View style={styles.formDivider} />
              <View style={styles.formRow}>
                <Ionicons name="lock-closed-outline" size={18} color="#9CA3AF" />
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
                    color="#9CA3AF"
                  />
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable
              onPress={() => void handleLogin()}
              disabled={loading}
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            >
              <Text style={styles.loginBtnText}>
                {loading ? "Logging in…" : "Login"}
              </Text>
            </Pressable>

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
              <Ionicons name="globe-outline" size={18} color="#F5811F" />
              <Text style={styles.contactText}>www.harshaidsolutions.in</Text>
            </Pressable>

            <Pressable style={styles.contactRow} onPress={openMail}>
              <Ionicons name="mail" size={18} color="#F5811F" />
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
    const formW = wp(92);
    return {
      safe: { flex: 1, backgroundColor: LOGIN_BG },
      flex: { flex: 1 },
      scroll: {
        flexGrow: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: spacing.pagePad,
        paddingVertical: spacing.lg,
      },
      title: {
        marginTop: spacing.sm,
        fontSize: scale(28),
        fontFamily: fonts.headingBold,
        textAlign: "center",
        color: "#F5811F",
      },
      subtitle: {
        marginTop: scale(4),
        marginBottom: spacing.md,
        fontFamily: fonts.body,
        fontSize: typeScale.subtitle,
        color: "#8A8F98",
        textAlign: "center",
      },
      formGroup: {
        width: formW,
        alignSelf: "center",
        backgroundColor: "#FFFFFF",
        borderRadius: radius.lg,
        marginBottom: spacing.sm,
        overflow: "hidden",
        ...cardShadow,
      },
      formRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
        minHeight: scale(52),
      },
      formDivider: {
        height: 1,
        backgroundColor: "#9CA3AF",
        marginHorizontal: spacing.md,
      },
      input: {
        flex: 1,
        ...textStyles.input,
        color: "#2C2C2C",
        paddingVertical: Platform.OS === "ios" ? spacing.sm : spacing.xs,
      },
      error: {
        marginBottom: spacing.xs,
        fontFamily: fonts.body,
        fontSize: typeScale.body,
        color: "#DC2626",
        textAlign: "center",
        width: formW,
      },
      loginBtn: {
        width: formW,
        alignSelf: "center",
        backgroundColor: "#F5811F",
        borderRadius: radius.buttonPill,
        minHeight: scale(50),
        alignItems: "center",
        justifyContent: "center",
        marginTop: spacing.xs,
        elevation: 2,
        shadowColor: "#F5811F",
        shadowOpacity: 0.25,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      loginBtnDisabled: { opacity: 0.65 },
      loginBtnText: {
        ...textStyles.button,
        color: "#FFFFFF",
      },
      contactPrompt: {
        textAlign: "center",
        fontFamily: fonts.body,
        fontSize: typeScale.subtitle,
        color: "#F5811F",
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
        backgroundColor: "#25D366",
      },
      callBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing.xs,
        paddingVertical: spacing.sm,
        borderRadius: radius.buttonPill,
        backgroundColor: "#F5811F",
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
        color: "#2C2C2C",
      },
    };
  });
}
