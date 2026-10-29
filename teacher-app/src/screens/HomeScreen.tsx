import { AdminHeroCard } from "../components/AdminHeroCard";
import { BRAND as THEME } from "../theme/brandTheme";
import { ScreenBackdrop } from "../components/ScreenBackdrop";
import { CONTENT_MAX_WIDTH, contentMaxStyle } from "../theme/responsive";
import {ManagedInstructions} from "../components/ManagedInstructions";
import { Entrance } from "../components/Entrance";
import { useCallback, useRef, useState } from "react";
import {
  Image,
  Alert,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Pressable } from "../components/Pressable";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import api from "../api/client";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { OfferMarqueeBanner } from "../components/OfferMarqueeBanner";
import { chipForIndex } from "../theme/chips";
import { radius, cardShadow, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { icons } from "../theme/responsive";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { ABOUT_US_PARAS } from "../constants/about";
import { InfoParagraph } from "../components/InfoModal";
import {
  missingContact,
  openBrandWhatsApp,
  useCustomerBrand,
} from "../hooks/useCustomerBrand";
import { SUPPORT_PHONE } from "../constants/support";
import { openWhatsApp } from "../utils/whatsappBusiness";
import { bookProductViaWhatsApp } from "../utils/productBooking";
import { whatsAppDigits } from "../hooks/useCustomerBrand";
import { SUPPORT_PHONE_E164 } from "../constants/support";
import { HOME_PRODUCTS } from "../constants/products";
import { BEST_SCHOOLS } from "../constants/schools";
import { BrandLockup } from "../components/BrandLockup";
import { AppIcon } from "../components/AppIcon";
import { headerLogoSize } from "../constants/headerLogo";
import { BRAND } from "../constants/brand";
import type { NotificationsResponse } from "../types";
import {
  notificationIsRead,
  subscribeNotificationBadgeRefresh,
} from "../utils/notificationReadState";

/** Bundled locally — same assets as v1.0.38. */
const SCHOOL_BUILDING = require("../../assets/school-building.jpg");

/** Exact copy from https://faithful-front-flame.lovable.app/home */
const INSTRUCTIONS = [
  "Take clear and proper photos in good lighting.",
  "Upload correct student data.",
  "Choose the right template and model.",
  "Upload logo, signature and other requirements.",
  "Check all details before submitting.",
  "ID cards will be printed as per the provided data.",
  "No changes allowed after final submission.",
  "Contact support for any assistance.",
  "Use this app only for authorized purpose.",
  "Follow all the above steps for best results.",
];

const PRODUCTS = HOME_PRODUCTS;

export function HomeScreen() {
  const styles = useHomeStyles();
  const { scale, wp, width } = useResponsiveLayout();
  const headerLogo = headerLogoSize(width);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, "Home">>();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const { colors, headerGradient, isDark } = useTheme();
  const [unread, setUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [booking,setBooking]=useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { brand, ready, error: brandError, reload: reloadBrand } = useCustomerBrand();
  const childBrand = ready && brand.source === "child";
  const scrollRef = useRef<ScrollView>(null);
  const instructionsY = useRef(0);
  const copyright = !ready
    ? ""
    : childBrand
      ? `© All Rights Reserved to ${brand.adminName}`
      : "© All Rights Reserved to Harsha ID Solutions 💚";

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const notifRes = await api.get<NotificationsResponse>(
        "/teacher/notifications"
      );
      const unreadFromApi =
        typeof notifRes.data.unreadCount === "number"
          ? notifRes.data.unreadCount
          : notifRes.data.notifications.filter((n) => !notificationIsRead(n))
              .length;
      setUnread(unreadFromApi);
    } catch {
      /* ignore */
    } finally {
      await reloadBrand();
      setRefreshing(false);
    }
  }, [reloadBrand]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const unsub = subscribeNotificationBadgeRefresh(() => {
        void load();
      });
      if (route.params?.scrollTo === "instructions") {
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            y: Math.max(0, instructionsY.current - 8),
            animated: true,
          });
        });
      } else {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      return unsub;
    }, [load, route.params?.scrollTo])
  );

  async function bookProduct() {
    if(booking || previewIndex===null || !ready)return;
    const product=PRODUCTS[previewIndex];
    const phone=childBrand?whatsAppDigits(brand.whatsapp || brand.phone):(whatsAppDigits(brand.whatsapp || brand.phone) || SUPPORT_PHONE_E164);
    if(!phone){missingContact();return;}
    setBooking(true);
    try {await bookProductViaWhatsApp(product,phone);
    }catch(error){if(!String(error).toLowerCase().includes("cancel"))Alert.alert("Book now","Could not open WhatsApp with the product image. Please check that WhatsApp is installed and try again.");}
    finally{setBooking(false);}
  }

  const productImageHeight = scale(108);
  const schoolPhotoSize = scale(72);
  const logoSize = scale(36);
  const lightboxImageHeight = Math.min(scale(320), wp(78));
  const gridPad = spacing.pagePad * 2;
  const contentW = Math.min(screenW, CONTENT_MAX_WIDTH);
  const productColumns = Math.max(2, Math.floor((contentW - gridPad) / 180));
  const productCardWidth = Math.floor((contentW - gridPad - spacing.sm * (productColumns - 1)) / productColumns);
  const schoolColumns = Math.max(3, Math.floor((contentW - gridPad) / 150));
  const schoolColWidth = Math.floor((contentW - gridPad - spacing.xs * (schoolColumns - 1)) / schoolColumns);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}><ScreenBackdrop />
      <LinearGradient
        colors={[colors.surface, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.header,
          { paddingTop: insets.top + scale(10), paddingBottom: scale(14), borderColor: colors.border },
        ]}
      >
        <View style={styles.headerLogoWrap}>
          <AppIcon size={Math.min(screenW * .48,220)} variant="header" />
        </View>
        <View style={styles.headerTextWrap}>
          <Text
            style={styles.headerTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {BRAND.appName}
          </Text>
          <Text
            style={styles.headerSubtitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {BRAND.headerSubtitle}
          </Text>
        </View>
        <Pressable
          style={[styles.iconBtn, { width: Math.max(44, logoSize), height: Math.max(44, logoSize) }]}
          accessibilityLabel="Notifications"
          onPress={() => navigation.navigate("Notifications")}
        >
          <Ionicons
            name="notifications-outline"
            size={icons.xl}
            color={colors.primaryOrange}
          />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.brandOrange, borderColor: colors.surface }]}>
              <Text style={[styles.badgeText, { color: colors.onAccent }]}>
                {unread > 9 ? "9+" : String(unread)}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[styles.iconBtn, { width: Math.max(44, logoSize), height: Math.max(44, logoSize) }]}
          accessibilityLabel="Open menu"
          onPress={() => navigation.navigate("DrawerMenu" as any)}
        >
          <Ionicons name="menu" size={icons.xl} color={colors.primaryOrange} />
        </Pressable>
      </LinearGradient>

      <OfferMarqueeBanner />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, contentMaxStyle]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primaryOrange}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <Entrance style={styles.hero}>
          <AdminHeroCard
            loading={!ready}
            adminName={childBrand ? brand.adminName : "Harsha ID Solutions"}
            photoUrl={childBrand ? brand.photoUrl : null}
          />
        </Entrance>
        {brandError && !ready ? (
          <Text style={[styles.footer, { color: colors.textMuted }]}>{brandError}</Text>
        ) : null}

        <View
          onLayout={(e) => {
            instructionsY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionTitle title="INSTRUCTIONS" accent={colors.primaryOrange} />
        </View>
        <ManagedInstructions />
        {INSTRUCTIONS.map((text, i) => (
          <Entrance
            key={text.slice(0, 20)}
            delay={i * 40}
            style={[
              styles.instructionRow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
                borderLeftColor: chipForIndex(i).fg,
              },
            ]}
          >
            <View
              style={[
                styles.instructionNum,
                { backgroundColor: chipForIndex(i).fg },
              ]}
            >
              <Text style={styles.instructionNumText}>{i + 1}</Text>
            </View>
            <Text
              style={[styles.instructionText, { color: colors.textBody }]}
            >
              {text}
            </Text>
          </Entrance>
        ))}
        <SectionEnd accent={colors.primaryOrange} />

        {!ready || childBrand ? null : (
          <>
            {ABOUT_US_PARAS.map((para) => (
              <InfoParagraph key={para.slice(0, 24)} text={para} colors={colors} />
            ))}
            <SectionEnd accent={colors.primaryOrange} />
          </>
        )}

        <SectionTitle title="OUR PRODUCTS" accent={colors.primaryOrange} />
        <View style={styles.productGrid}>
          {PRODUCTS.map((p, i) => (
            <Pressable
              key={p.name}
              style={[
                styles.productCard,
                {
                  width: productCardWidth,
                  backgroundColor: colors.surface,
                  borderColor: colors.borderLight,
                },
              ]}
              onPress={() => setPreviewIndex(i)}
            >
              <View style={[styles.productWell, { backgroundColor: chipForIndex(i).bg }]}>
                <Image
                  source={p.image}
                  style={[styles.productImage, { height: productImageHeight }]}
                  resizeMode="contain"
                />
              </View>
              <Text style={[styles.productText, { color: colors.text }]} numberOfLines={2}>
                {p.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <SectionEnd accent={colors.primaryOrange} />

        <SectionTitle title="OUR BEST SCHOOLS" accent={colors.primaryOrange} />
        <View style={styles.schoolGrid}>
          {BEST_SCHOOLS.map((school) => (
            <View key={school.name} style={[styles.schoolItem, { width: schoolColWidth }]}>
              <Image
                source={SCHOOL_BUILDING}
                style={[
                  styles.schoolPhoto,
                  { width: schoolPhotoSize, height: schoolPhotoSize },
                ]}
                resizeMode="contain"
              />
              <Text
                style={[styles.schoolName, { color: colors.textMuted }]}
                numberOfLines={2}
              >
                {school.name}
              </Text>
              <StarRating value={school.stars} />
            </View>
          ))}
        </View>
        <SectionEnd accent={colors.primaryOrange} />

        <Text style={[styles.footer, { color: colors.textSubtle }]}>
          {copyright}
        </Text>
      </ScrollView>

      <View style={[styles.fabStack, { bottom: spacing.xl + insets.bottom }]}>
        <Pressable
          style={[styles.fab, { backgroundColor: colors.whatsappGreen }]}
          onPress={() => {
            if (!ready) return;
            if (!childBrand) {
              void openWhatsApp("").catch(() => undefined);
              return;
            }
            void openBrandWhatsApp(brand).catch(() => missingContact());
          }}
          accessibilityLabel="WhatsApp support"
        >
          <Ionicons name="logo-whatsapp" size={icons.lg} color="#FFFFFF" />
        </Pressable>
        <Pressable
          style={[styles.fab, { backgroundColor: colors.primaryOrange }]}
          onPress={() => {
            if (!ready) return;
            const phone = childBrand ? brand.phone : SUPPORT_PHONE;
            if (!phone) {
              missingContact();
              return;
            }
            void Linking.openURL(`tel:${phone}`);
          }}
          accessibilityLabel="Call support"
        >
          <Ionicons name="call" size={icons.lg} color="#FFFFFF" />
        </Pressable>
      </View>

      <Modal
        visible={previewIndex !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewIndex(null)}
      >
        <Pressable style={styles.lightbox} onPress={() => setPreviewIndex(null)}>
          <Pressable style={styles.lightboxCard} onPress={(e) => e.stopPropagation()}>
            {previewIndex !== null && PRODUCTS[previewIndex] ? (
              <>
                <Text style={[styles.lightboxTitle, { color: colors.text }]}>
                  {PRODUCTS[previewIndex].name}
                </Text>
                <View style={styles.lightboxNav}>
                  <Pressable
                    style={styles.lightboxArrow}
                    onPress={() =>
                      setPreviewIndex((i) =>
                        i === null
                          ? 0
                          : (i + PRODUCTS.length - 1) % PRODUCTS.length
                      )
                    }
                  >
                    <Ionicons name="chevron-back" size={icons.xxl} color={colors.primaryOrange} />
                  </Pressable>
                  <Image
                    source={PRODUCTS[previewIndex].image}
                    style={[styles.lightboxImage, { height: lightboxImageHeight }]}
                    resizeMode="contain"
                  />
                  <Pressable
                    style={styles.lightboxArrow}
                    onPress={() =>
                      setPreviewIndex((i) =>
                        i === null ? 0 : (i + 1) % PRODUCTS.length
                      )
                    }
                  >
                    <Ionicons name="chevron-forward" size={icons.xxl} color={colors.primaryOrange} />
                  </Pressable>
                </View>
                <View style={{flexDirection:"row",gap:12,alignItems:"center"}}>
                <Pressable accessibilityRole="button" disabled={booking || !ready} style={[styles.lightboxClose,{backgroundColor:colors.brandGreen,flex:1}]} onPress={()=>void bookProduct()}><Text style={styles.lightboxCloseText}>{booking?"Opening…":"Order Now"}</Text></Pressable>
                <Pressable
                  style={[styles.lightboxClose, { backgroundColor: colors.primaryOrange }]}
                  onPress={() => setPreviewIndex(null)}
                >
                  <Text style={styles.lightboxCloseText}>Close</Text>
                </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function SectionTitle({ title, accent }: { title: string; accent: string }) {
  const styles = useHomeStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <LinearGradient colors={[accent, colors.headerYellowEnd]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.sectionTitleBar} />
      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
    </View>
  );
}

function SectionEnd({ accent }: { accent: string }) {
  const styles = useHomeStyles();
  return <View style={[styles.sectionEnd, { backgroundColor: accent }]} />;
}

function StarRating({ value }: { value: number }) {
  const styles = useHomeStyles();
  const { scale } = useResponsiveLayout();
  const full = Math.floor(value);
  const half = value % 1 >= 0.5;
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => {
        const name =
          i < full ? "star" : i === full && half ? "star-half" : "star-outline";
        return (
          <Ionicons key={i} name={name} size={scale(10)} color="#F59E0B" />
        );
      })}
    </View>
  );
}

function useHomeStyles() {
  const { colors } = useTheme();
  return useResponsiveStyles(({ scale }) => ({
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingBottom: 0,
    gap: spacing.xs,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    borderBottomWidth: 1,
    shadowColor: THEME.primaryDeep,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    zIndex: 2,
  },
  headerLogoWrap: {
      backgroundColor:"transparent",
      paddingVertical:2,
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: spacing.xxs,
    minWidth: scale(36),
    minHeight: scale(40),
  },
  headerTextWrap: {
    display:"none",
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: spacing.xxs,
  },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: typeScale.md + 2,
    color: "#FFFFFF",
    letterSpacing: 0.2,
    includeFontPadding:false,
    lineHeight:(typeScale.md + 2)*1.15,
  },
  headerSubtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.xs,
    color: "rgba(255,255,255,0.92)",
    marginTop: 3,
    includeFontPadding:false,
    lineHeight:typeScale.xs*1.15,
  },
  iconBtn: {
    backgroundColor: colors.blueSoft,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: spacing.xxs / 2,
    right: 0,
    minWidth: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxs - 1,
    borderWidth: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: typeScale.xs,
    fontFamily: fonts.bold,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.pagePad, paddingTop: 0, paddingBottom: spacing.pagePad + scale(120) },
  hero: {
    backgroundColor: "transparent",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionTitleBar: {
    width: scale(6),
    height: scale(22),
    borderRadius: scale(3),
  },
  sectionTitle: {
    ...textStyles.h2,
    letterSpacing: 0.6,
  },
  sectionRule: {
    height: scale(1.5),
    width: scale(36),
    borderRadius: 4,
    marginBottom: spacing.xs,
    opacity: 0.8,
  },
  sectionEnd: {
    height: scale(1),
    width: "100%",
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    opacity: 0.12,
  },
  stars: {
    flexDirection: "row",
    marginTop: scale(2),
    justifyContent: "center",
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: radius.lg,
    borderLeftWidth: 5,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.cardGap,
    gap: spacing.iconTextGap,
    borderWidth: 1,
    ...cardShadow,
  },
  instructionNum: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 0,
  },
  instructionNumText: {
    ...textStyles.badge,
    textAlign: "center",
    includeFontPadding: false,
    lineHeight: scale(32),
  },
  instructionText: {
    flex: 1,
    fontFamily: fonts.interRegular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.4,
  },
  about: {
    fontFamily: fonts.interRegular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.55,
    marginBottom: spacing.sm,
  },
  productGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  productCard: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    overflow: "hidden",
    ...cardShadow,
  },
  productWell: {
    width: "100%",
    borderRadius: radius.lg,
    padding: spacing.xs,
  },
  productImage: {
    width: "100%",
    borderRadius: radius.sm,
  },
  productText: {
    minHeight: typeScale.sm * 2.8,
    lineHeight: typeScale.sm * 1.4,
    marginTop: spacing.xs,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
    textAlign: "center",
  },
  fabStack: {
    position: "absolute",
    right: spacing.sm,
    gap: spacing.xs,
    zIndex: 20,
  },
  fab: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: THEME.primaryDeep,
    shadowOpacity: 0.28,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: scale(5) },
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(8,17,41,0.62)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  lightboxCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.xl,
    padding: spacing.lg,
    maxHeight: "86%",
  },
  lightboxTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  lightboxNav: {
    flexDirection: "row",
    alignItems: "center",
  },
  lightboxArrow: {
    paddingHorizontal: spacing.xxs,
  },
  lightboxImage: {
    flex: 1,
    minHeight: 0,
  },
  lightboxClose: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12,
    marginTop: spacing.md,
    borderRadius: radius.buttonPill,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  lightboxCloseText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
  },
  schoolGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  schoolItem: {
    alignItems: "center",
  },
  schoolPhoto: {
    borderRadius: radius.sm,
    marginBottom: spacing.xs / 2,
  },
  schoolName: {
    fontFamily: fonts.medium,
    fontSize: typeScale.xs,
    textAlign: "center",
  },
  footer: {
    marginTop: spacing.xl,
    textAlign: "center",
    fontFamily: fonts.medium,
    fontSize: typeScale.xs,
  },
  }), [colors]);
}
