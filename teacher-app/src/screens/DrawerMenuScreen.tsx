import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Pressable } from "../components/Pressable";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../auth/AuthContext";
import { AppIcon } from "../components/AppIcon";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { IconChip } from "../components/IconChip";
import { RateUsModal } from "../components/RateUsModal";
import type { RootStackParamList } from "../navigation/types";
import { cardShadow, radius, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { ABOUT_US_PARAS } from "../constants/about";
import { APP_INSTRUCTIONS } from "../constants/instructions";
import { PHOTO_EXAMPLES } from "./InstructionsScreen";
import { TERMS_AND_CONDITIONS } from "../constants/terms";
import {
  InfoModal,
  InfoBulletList,
  InfoParagraph,
} from "../components/InfoModal";
import api from "../api/client";
import {
  missingContact,
  openBrandWhatsApp,
  useCustomerBrand,
} from "../hooks/useCustomerBrand";
import {
  buildReferShareMessage,
  SOCIAL_FACEBOOK,
  SOCIAL_INSTAGRAM,
  SOCIAL_YOUTUBE,
  SUPPORT_EMAIL,
  SUPPORT_WEBSITE,
  buildHelpSupportMessage,
} from "../constants/support";
import { openWhatsApp, openWhatsAppShare } from "../utils/whatsappBusiness";

type Props = NativeStackScreenProps<RootStackParamList, "DrawerMenu">;

type MenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
};

export function DrawerMenuScreen({ navigation }: Props) {
  const styles = useDrawerMenuStyles();
  const { scale, wp } = useResponsiveLayout();
  const { logout } = useAuth();
  const { colors, headerGradient } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.round(width * 0.78);
  const drawerLogoSize = wp(9.5);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [schoolName, setSchoolName] = useState("Your School");
  const { brand, ready } = useCustomerBrand();
  const childBrand = ready && brand.source === "child";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<{ school: { name: string } }>(
          "/teacher/organization"
        );
        if (!cancelled && data.school?.name?.trim()) {
          setSchoolName(data.school.name.trim());
        }
      } catch {
        try {
          const { data } = await api.get<{ schoolName: string }>("/teacher/home");
          if (!cancelled && data.schoolName?.trim()) {
            setSchoolName(data.schoolName.trim());
          }
        } catch {
          /* keep default */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function openUrl(url: string) {
    void Linking.openURL(url);
  }

  function openChildLink(url: string | null) {
    if (!url) {
      missingContact();
      return;
    }
    openUrl(url);
  }

  async function openHelpSupport() {
    if (!ready) return;
    try {
      const message = buildHelpSupportMessage(schoolName);
      if (childBrand) await openBrandWhatsApp(brand, message);
      else await openWhatsApp(message);
    } catch (err) {
      Alert.alert(
        "WhatsApp",
        err instanceof Error ? err.message : "Could not open WhatsApp."
      );
    }
  }

  async function openReferUs() {
    if (!ready) return;
    try {
      await openWhatsAppShare(buildReferShareMessage());
    } catch (err) {
      Alert.alert(
        "WhatsApp",
        err instanceof Error ? err.message : "Could not open WhatsApp."
      );
    }
  }

  function confirmLogout() {
    Alert.alert("Logout", "Are you sure you want to logout?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: "destructive",
        onPress: () => {
          navigation.goBack();
          void logout();
        },
      },
    ]);
  }

  const menuItems: MenuItem[] = ([
    {
      icon: "logo-google-playstore",
      label: "Rate Us",
      onPress: () => setRateOpen(true),
    },
    {
      icon: "gift",
      label: "Refer Us",
      onPress: () => void openReferUs(),
    },
    {
      icon: "logo-youtube",
      label: "YouTube",
      onPress: () => {
        if (!ready) return;
        if (childBrand) openChildLink(brand.youtube);
        else openUrl(SOCIAL_YOUTUBE);
      },
    },
    {
      icon: "logo-instagram",
      label: "Instagram",
      onPress: () => {
        if (!ready) return;
        if (childBrand) openChildLink(brand.instagram);
        else openUrl(SOCIAL_INSTAGRAM);
      },
    },
    {
      icon: "logo-facebook",
      label: "Facebook",
      onPress: () => {
        if (!ready) return;
        if (childBrand) openChildLink(brand.facebook);
        else openUrl(SOCIAL_FACEBOOK);
      },
    },
    {
      icon: "mail",
      label: "Email",
      onPress: () => {
        if (!ready) return;
        if (childBrand) openChildLink(brand.email ? `mailto:${brand.email}` : null);
        else openUrl(`mailto:${SUPPORT_EMAIL}`);
      },
    },
    {
      icon: "help-circle",
      label: "Help & Support",
      onPress: () => void openHelpSupport(),
    },
    {
      icon: "globe",
      label: childBrand ? "Call" : "Website",
      onPress: () => {
        if (!ready) return;
        if (!childBrand) {
          openUrl(SUPPORT_WEBSITE);
          return;
        }
        if (!brand.phone) {
          missingContact();
          return;
        }
        openUrl(`tel:${brand.phone}`);
      },
    },
    {
      icon: "newspaper-outline",
      label: "Brochure",
      onPress: () => navigation.navigate("Brochure"),
    },
    {
      icon: "document-text",
      label: "Instructions",
      onPress: () => setInstructionsOpen(true),
    },
    {
      icon: "reader-outline",
      label: "Terms and Conditions",
      onPress: () => setTermsOpen(true),
    },
    {
      icon: "information-circle",
      label: "About Us",
      onPress: () => setAboutOpen(true),
    },
    {
      icon: "settings",
      label: "Settings",
      onPress: () => {
        navigation.goBack();
        navigation.navigate("Settings" as never);
      },
    },
  ] as MenuItem[]).filter(
    (item) => item.label !== "About Us" || (ready && !childBrand)
  );

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => navigation.goBack()} />
      <View
        style={[
          styles.panel,
          {
            width: panelW,
            backgroundColor: colors.background,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <LinearGradient
          colors={[...headerGradient]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[
            styles.header,
            {
              paddingTop: insets.top + scale(4),
              paddingBottom: scale(4),
            },
          ]}
        >
          <View style={styles.headerLogoWrap}>
            <AppIcon size={drawerLogoSize} variant="header" />
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {menuItems.map((item, index) => (
            <Pressable
              key={item.label}
              style={({ pressed }) => [
                styles.menuCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
                pressed && { backgroundColor: colors.orangeSoft },
              ]}
              onPress={item.onPress}
            >
              <IconChip name={item.icon} index={index} />
              <Text
                style={[styles.menuLabel, { color: colors.text }]}
                numberOfLines={2}
              >
                {item.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textSubtle}
              />
            </Pressable>
          ))}

          <Pressable
            style={[
              styles.logoutBtn,
              {
                borderColor: colors.danger,
                backgroundColor: colors.surface,
              },
            ]}
            onPress={confirmLogout}
          >
            <Ionicons name="log-out" size={20} color={colors.danger} />
            <Text style={[styles.logoutText, { color: colors.danger }]}>
              Logout
            </Text>
          </Pressable>
        </ScrollView>
        <RateUsModal visible={rateOpen} onClose={() => setRateOpen(false)} />
        <InfoModal
          visible={instructionsOpen}
          title="Instructions"
          onClose={() => setInstructionsOpen(false)}
          colors={colors}
        >
          {PHOTO_EXAMPLES.map((example) => (
            <View key={example.caption} style={{ marginBottom: spacing.md }}>
              <Text style={{ color: example.ok ? colors.brandGreen : colors.danger, fontFamily: fonts.semiBold, marginBottom: 6 }}>
                {example.title}
              </Text>
              <Image source={example.source} resizeMode="contain" style={{ width: "100%", height: 180, borderRadius: 8 }} />
              <Text style={{ marginTop: 6, color: colors.text }}>{example.caption}</Text>
            </View>
          ))}
          <InfoBulletList items={APP_INSTRUCTIONS} colors={colors} />
        </InfoModal>
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
        <InfoModal
          visible={aboutOpen}
          title="ABOUT US"
          onClose={() => setAboutOpen(false)}
          colors={colors}
          compact
          prominentTitle
        >
          {ABOUT_US_PARAS.filter(
            (p) => p.trim().toUpperCase() !== "ABOUT US"
          ).map((p) => (
            <InfoParagraph key={p.slice(0, 24)} text={p} colors={colors} />
          ))}
        </InfoModal>
      </View>
    </View>
  );
}

function useDrawerMenuStyles() {
  return useResponsiveStyles(({ scale }) => ({
    root: { flex: 1, flexDirection: "row" },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(26,34,51,0.45)",
    },
    panel: {
      height: "100%",
      elevation: 16,
      shadowColor: "#1A2233",
      shadowOpacity: 0.25,
      shadowRadius: 16,
      shadowOffset: { width: 4, height: 0 },
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      paddingHorizontal: spacing.sm,
      position: "relative",
      borderBottomLeftRadius: radius.xl,
      borderBottomRightRadius: radius.xl,
    },
    headerLogoWrap: {
      flexShrink: 0,
      alignItems: "flex-start",
      justifyContent: "center",
      paddingHorizontal: spacing.xxs,
      minWidth: scale(36),
      minHeight: scale(40),
    },
    closeBtn: {
      position: "absolute",
      right: spacing.sm,
      top: "50%",
      marginTop: -(spacing.iconSm + 4) / 2,
      width: spacing.iconSm + 4,
      height: spacing.iconSm + 4,
      borderRadius: (spacing.iconSm + 4) / 2,
      backgroundColor: "rgba(255,255,255,0.25)",
      alignItems: "center",
      justifyContent: "center",
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.cardGap,
    },
    menuCard: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      gap: spacing.iconTextGap,
      borderRadius: radius.card,
      borderWidth: 1,
      ...cardShadow,
    },
    menuLabel: {
      ...textStyles.h3,
      flex: 1,
      lineHeight: typeScale.rowTitle * 1.25,
    },
    logoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs,
      marginTop: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.buttonPill,
      borderWidth: 1.5,
      minHeight: spacing.buttonHeight,
    },
    logoutText: {
      ...textStyles.button,
    },
  }));
}
