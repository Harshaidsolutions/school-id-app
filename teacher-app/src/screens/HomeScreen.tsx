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
  const productCardWidth = Math.floor((screenW - gridPad - spacing.sm) / 2);
  const schoolColWidth = Math.floor((screenW - gridPad - spacing.xs * 2) / 3);

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[...headerGradient]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[
          styles.header,
          { paddingTop: insets.top + scale(4), paddingBottom: scale(4) },
        ]}
      >
        <View style={{...styles.headerLogoWrap, width: headerLogo * 1.5, height: headerLogo * 1.5, borderRadius: headerLogo * .75}}>
          <AppIcon size={headerLogo} variant="default" />
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
          style={[styles.iconBtn, { width: logoSize, height: logoSize }]}
          onPress={() => navigation.navigate("Notifications")}
        >
          <Ionicons
            name="notifications-outline"
            size={icons.xl}
            color="#FFFFFF"
          />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.brandGreen }]}>
              <Text style={styles.badgeText}>
                {unread > 9 ? "9+" : String(unread)}
              </Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          style={[styles.iconBtn, { width: logoSize, height: logoSize }]}
          onPress={() => navigation.navigate("DrawerMenu" as any)}
        >
          <Ionicons name="menu" size={icons.xl} color="#FFFFFF" />
        </Pressable>
      </LinearGradient>

      <OfferMarqueeBanner />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.primaryOrange}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {!ready ? null : childBrand ? (
            brand.photoUrl ? <Image source={{uri:brand.photoUrl}} accessibilityLabel="Your admin logo" resizeMode="contain" style={{width:"80%",height:scale(115),alignSelf:"center"}} /> : <BrandLockup variant="homeHero" showTagline />
          ) : (
            <BrandLockup variant="homeHero" showTagline />
          )}
        </View>
        {brandError && !ready ? (
          <Text style={[styles.footer, { color: colors.textMuted }]}>{brandError}</Text>
        ) : null}

        <View
          onLayout={(e) => {
            instructionsY.current = e.nativeEvent.layout.y;
          }}
        >
          <View style={[styles.sectionRule, { backgroundColor: colors.primaryOrange }]} />
          <SectionTitle title="INSTRUCTIONS" accent={colors.primaryOrange} />
        </View>
        {INSTRUCTIONS.map((text, i) => (
          <View
            key={text.slice(0, 20)}
            style={[
              styles.instructionRow,
              {
                backgroundColor: colors.surface,
                borderColor: colors.borderLight,
              },
            ]}
          >
            <View
              style={[
                styles.instructionNum,
                { backgroundColor: colors.primaryOrange },
              ]}
            >
              <Text style={styles.instructionNumText}>{i + 1}</Text>
            </View>
            <Text
              style={[styles.instructionText, { color: colors.textBody }]}
            >
              {text}
            </Text>
          </View>
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
              <Image
                source={p.image}
                style={[styles.productImage, { height: productImageHeight }]}
                resizeMode="contain"
              />
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
                <Pressable accessibilityRole="button" disabled={booking || !ready} style={[styles.lightboxClose,{backgroundColor:colors.brandGreen,flex:1}]} onPress={()=>void bookProduct()}><Text style={styles.lightboxCloseText}>{booking?"Opening…":"Book Now"}</Text></Pressable>
                <Pressable
                  style={[styles.lightboxClose, { backgroundColor: colors.primaryOrange }]}
                  onPress={() => setPreviewIndex(null)}
                >
                  <Text style={styles.lightboxCloseText}>Close</Text>
                </Pressable>
                </View>
                <Text style={{color:colors.textMuted,fontFamily:fonts.regular,fontSize:12,textAlign:"center",marginTop:8}}>Book Now includes the product image and message. If WhatsApp omits the caption, paste the copied message.</Text>
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
  return (
    <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
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
          <Ionicons key={i} name={name} size={scale(10)} color="#F5A524" />
        );
      })}
    </View>
  );
}

function useHomeStyles() {
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
  },
  headerLogoWrap: {
      backgroundColor:"#FFFFFF",
      borderRadius:10,
      paddingVertical:3,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxs,
    minWidth: scale(36),
    minHeight: scale(40),
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
    paddingRight: spacing.xxs,
  },
  headerTitle: {
    fontFamily: fonts.extraBold,
    fontSize: typeScale.md,
    color: "#FFFFFF",
    letterSpacing: 0.2,
    includeFontPadding:false,
    lineHeight:typeScale.md*1.15,
  },
  headerSubtitle: {
    fontFamily: fonts.regular,
    fontSize: typeScale.xs,
    color: "rgba(255,255,255,0.92)",
    marginTop: 0,
    includeFontPadding:false,
    lineHeight:typeScale.xs*1.15,
  },
  iconBtn: {
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
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: typeScale.xs,
    fontFamily: fonts.bold,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.pagePad, paddingTop: 0, paddingBottom: spacing.pagePad },
  hero: {
    alignItems: "center",
    paddingVertical: spacing.md,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    ...textStyles.h2,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionRule: {
    height: scale(1.5),
    width: "100%",
    marginBottom: spacing.xs,
    opacity: 0.55,
  },
  sectionEnd: {
    height: scale(1.5),
    width: "100%",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    opacity: 0.55,
  },
  stars: {
    flexDirection: "row",
    marginTop: scale(2),
    justifyContent: "center",
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: radius.card,
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
    borderRadius: scale(16),
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
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    overflow: "hidden",
    ...cardShadow,
  },
  productImage: {
    width: "100%",
    borderRadius: radius.sm,
  },
  productText: {
    marginTop: spacing.xs,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
    textAlign: "center",
  },
  fabStack: {
    position: "absolute",
    right: spacing.md,
    gap: spacing.sm,
    zIndex: 20,
  },
  fab: {
    width: spacing.fabSize,
    height: spacing.fabSize,
    borderRadius: spacing.fabSize / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: scale(6),
    shadowOffset: { width: 0, height: scale(3) },
  },
  lightbox: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  lightboxCard: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: spacing.md,
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
    borderRadius: radius.md,
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
  }));
}
