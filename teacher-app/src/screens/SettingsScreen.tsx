import { setNotificationPreference, useNotificationPreference } from "../utils/notificationPreference";
import { useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "../navigation/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import {
  PLAY_STORE_MARKET_URL,
  PLAY_STORE_URL,
} from "../constants/support";
import api from "../api/client";
import { openBrandWhatsApp, useCustomerBrand } from "../hooks/useCustomerBrand";
import { buildHelpSupportMessage } from "../constants/support";
import { openWhatsApp } from "../utils/whatsappBusiness";
import { TERMS_AND_CONDITIONS } from "../constants/terms";
import { InfoModal, InfoParagraph } from "../components/InfoModal";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

function appVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    "1.0.41"
  );
}

export function SettingsScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const { mode, setMode, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const version = appVersion();
  const notificationsOn = useNotificationPreference();
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const { brand, ready } = useCustomerBrand();
  const [schoolName, setSchoolName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<{ school: { name: string } }>(
          "/teacher/organization"
        );
        if (!cancelled && data.school?.name?.trim()) {
          setSchoolName(data.school.name.trim());
          return;
        }
      } catch {
        /* try home */
      }
      try {
        const { data } = await api.get<{ schoolName: string }>("/teacher/home");
        if (!cancelled && data.schoolName?.trim()) {
          setSchoolName(data.schoolName.trim());
        }
      } catch {
        /* leave blank */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function confirmLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: "destructive", onPress: () => void logout() },
    ]);
  }

  async function checkForUpdate() {
    Alert.alert(
      "Check for Update",
      `You are on version ${version}. Open the Play Store to see if a newer version is available.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Open Play Store",
          onPress: () => {
            void (async () => {
              try {
                const ok = await Linking.canOpenURL(PLAY_STORE_MARKET_URL);
                await Linking.openURL(ok ? PLAY_STORE_MARKET_URL : PLAY_STORE_URL);
              } catch {
                await Linking.openURL(PLAY_STORE_URL);
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OrangeGradientHeader
        title="Settings"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: spacing.xxl + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionHeader, { color: colors.primaryOrange }]}>
          APPEARANCE
        </Text>
        <View style={styles.themeRow}>
          <Pressable
            style={[
              styles.themeOption,
              { borderColor: colors.border },
              mode === "light" && {
                borderColor: colors.primaryOrange,
                backgroundColor: colors.orangeSoft,
              },
            ]}
            onPress={() => setMode("light")}
          >
            <Ionicons
              name="sunny-outline"
              size={18}
              color={mode === "light" ? colors.primaryOrange : colors.textMuted}
            />
            <Text
              style={[
                styles.themeText,
                { color: colors.textMuted },
                mode === "light" && { color: colors.primaryOrange },
              ]}
            >
              Light
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.themeOption,
              { borderColor: colors.border },
              mode === "dark" && {
                borderColor: colors.primaryOrange,
                backgroundColor: colors.orangeSoft,
              },
            ]}
            onPress={() => setMode("dark")}
          >
            <Ionicons
              name="moon-outline"
              size={18}
              color={mode === "dark" ? colors.primaryOrange : colors.textMuted}
            />
            <Text
              style={[
                styles.themeText,
                { color: colors.textMuted },
                mode === "dark" && { color: colors.primaryOrange },
              ]}
            >
              Dark
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.sectionHeader, { color: colors.primaryOrange }]}>NOTIFICATIONS</Text>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={20} color={colors.textMuted} />
          <View style={{flex:1}}>
            <Text style={[styles.rowLabel, {color:colors.text}]}>Push notifications</Text>
            <Text style={{color:colors.textMuted, fontSize:12}}>{notificationsBusy ? "Saving…" : notificationsOn ? "On for this phone" : "Off for this phone"}</Text>
          </View>
          <Switch accessibilityLabel="Push notifications" value={notificationsOn === true} disabled={notificationsBusy || notificationsOn === null}
            trackColor={{true:colors.brandGreen}} onValueChange={next => {
              setNotificationsBusy(true);
              void setNotificationPreference(next).catch(error => Alert.alert("Notifications", error instanceof Error ? error.message : "Could not update notifications. Please try again online.")).finally(() => setNotificationsBusy(false));
            }} />
        </View>
        <Text style={[styles.sectionHeader, { color: colors.primaryOrange }]}>
          SUPPORT
        </Text>
        <SettingRow
          colors={colors}
          icon="logo-whatsapp"
          label="Help & Support"
          onPress={() => {
            if (!ready) return;
            void (brand.source === "child"
              ? openBrandWhatsApp(brand, buildHelpSupportMessage(schoolName))
              : openWhatsApp(buildHelpSupportMessage(schoolName))
            ).catch((err) =>
              Alert.alert(
                "WhatsApp",
                err instanceof Error ? err.message : "Could not open WhatsApp."
              )
            );
          }}
        />
        <SettingRow
          colors={colors}
          icon="document-text-outline"
          label="Terms & Conditions"
          onPress={() => setTermsOpen(true)}
        />

        <Text style={[styles.sectionHeader, { color: colors.primaryOrange }]}>
          ABOUT
        </Text>
        <SettingRow
          colors={colors}
          icon="information-circle-outline"
          label="App Version"
          value={version}
        />
        <SettingRow
          colors={colors}
          icon="refresh-outline"
          label="Check for Update"
          onPress={() => void checkForUpdate()}
        />

        <Pressable
          style={[styles.logoutBtn, { borderColor: colors.primaryOrange }]}
          onPress={confirmLogout}
        >
          <Text style={[styles.logoutText, { color: colors.primaryOrange }]}>
            Logout
          </Text>
        </Pressable>
      </ScrollView>
      <InfoModal
        visible={termsOpen}
        title="Terms and Conditions"
        onClose={() => setTermsOpen(false)}
        colors={colors}
      >
        {TERMS_AND_CONDITIONS.map((p) => (
          <InfoParagraph key={p.slice(0, 24)} text={p} colors={colors} />
        ))}
      </InfoModal>
    </View>
  );
}

function SettingRow({
  colors,
  icon,
  label,
  value,
  onPress,
}: {
  colors: {
    text: string;
    textMuted: string;
    textSubtle: string;
    graySoft: string;
  };
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: colors.graySoft },
      ]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color={colors.textMuted} />
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: colors.textMuted }]}>
          {value}
        </Text>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {},
  sectionHeader: {
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    gap: spacing.iconTextGap,
  },
  rowLabel: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: typeScale.sm,
  },
  rowValue: {
    fontFamily: fonts.regular,
    fontSize: typeScale.subtitle,
  },
  themeRow: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    gap: spacing.cardGap,
    marginBottom: spacing.xxs,
  },
  themeOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  themeText: {
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
  },
  logoutBtn: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: "center",
  },
  logoutText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
  },
});
