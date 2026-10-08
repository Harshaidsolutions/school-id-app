import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { mergeOrgDetailsDraft } from "../utils/orgDetailsDraft";
import { useToast } from "../components/Toast";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { templatePreviewUrl } from "../utils/templateImage";
import type { TemplateItem, TemplatesResponse } from "../types";
import { TEMPLATE_TABS } from "../types";
import type { MainTabParamList, RootStackParamList } from "../navigation/types";
import { GradientButton } from "../components/GradientButton";
import { FullScreenImageViewer } from "../components/FullScreenImageViewer";
import { SelectConfirmModal } from "../components/SelectConfirmModal";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { gridItemWidth, icons } from "../theme/responsive";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import {
  getCachedImageAspectRatio,
  isLandscapeAspectRatio,
  probeImageAspectRatio,
  useImageAspectRatio,
} from "../hooks/useImageAspectRatio";

const TAB_LABELS: Record<string, string> = {
  vertical_single: "Vertical Single Side",
  vertical_both: "Vertical Both Side",
  horizontal_single: "Horizontal Single Side",
  horizontal_both: "Horizontal Both Side",
  staff_id: "Staff ID Card",
};

/** ISO ID-1 / CR80 card: 85.60 × 53.98 mm. */
const CARD_LANDSCAPE = 85.6 / 53.98;
const CARD_PORTRAIT = 53.98 / 85.6;

function templateMatchesTab(item: TemplateItem, tab: string): boolean {
  const name = (item.name ?? "").toLowerCase().trim();
  const o = (item.orientation ?? "").toLowerCase();

  if (tab === "staff_id") {
    return o === "staff_id" || /staff/i.test(name);
  }

  const slug = name.replace(/\./g, " ");
  const isBothSide =
    slug.includes("both") ||
    slug.includes("v b s") ||
    slug.includes("h b s") ||
    /\bb\s*s\b/.test(slug);
  const isSingleSide =
    slug.includes("single") ||
    slug.includes("v s s") ||
    slug.includes("h s s") ||
    /\bs\s*s\b/.test(slug);
  const isVertical =
    o.startsWith("vertical") || slug.includes("vertical") || slug.startsWith("v ");
  const isHorizontal =
    o.startsWith("horizontal") || slug.includes("horizontal") || slug.startsWith("h ");

  switch (tab) {
    case "vertical_single":
      if (isBothSide) return false;
      return o === "vertical_single" || (isSingleSide && isVertical);
    case "vertical_both":
      return o === "vertical_both" || (isBothSide && isVertical);
    case "horizontal_single":
      if (isBothSide) return false;
      return o === "horizontal_single" || (isSingleSide && isHorizontal);
    case "horizontal_both":
      return o === "horizontal_both" || (isBothSide && isHorizontal);
    default:
      return o === tab;
  }
}

function templateSides(item: TemplateItem): { front: string | null; back: string | null } {
  const cfg =
    item.config_json && typeof item.config_json === "object"
      ? (item.config_json as Record<string, unknown>)
      : {};
  const pick = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = cfg[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  return {
    front: pick(["frontUrl", "front_url", "front_image_url", "frontImage"]) ?? item.image_url,
    back: pick(["backUrl", "back_url", "back_image_url", "backImage"]),
  };
}

function templateImageUris(item: TemplateItem): string[] {
  const { front, back } = templateSides(item);
  return [front, back].filter((uri): uri is string => Boolean(uri));
}

function resolveTemplateOrientation(tab: string, item: TemplateItem): string {
  if (tab !== "staff_id") return tab;
  const orientation = (item.orientation ?? "").toLowerCase();
  if (orientation.includes("horizontal")) return "horizontal_single";
  if (orientation.includes("vertical")) return "vertical_single";
  return "vertical_single";
}

function resolveStaffOrientation(
  tab: string,
  item: TemplateItem,
  aspectRatio: number | null
): string {
  if (tab !== "staff_id") return resolveTemplateOrientation(tab, item);
  if (aspectRatio != null) {
    return isLandscapeAspectRatio(aspectRatio)
      ? "horizontal_single"
      : "vertical_single";
  }
  return resolveTemplateOrientation(tab, item);
}

function prefetchTemplateImages(items: TemplateItem[]) {
  const seen = new Set<string>();
  for (const item of items) {
    for (const uri of templateImageUris(item)) {
      if (seen.has(uri)) continue;
      seen.add(uri);
      void Image.prefetch(uri);
      probeImageAspectRatio(uri);
    }
  }
}

function TemplatePreview({
  item,
  orientation,
  colors,
  large = false,
  detectOrientation = false,
}: {
  item: TemplateItem;
  orientation: string;
  colors: { surface: string; textSubtle: string };
  large?: boolean;
  detectOrientation?: boolean;
}) {
  const styles = useTemplateStyles();
  const { front, back } = templateSides(item);
  const aspectRatio = useImageAspectRatio(detectOrientation ? front : null);
  const resolvedOrientation = detectOrientation
    ? resolveStaffOrientation("staff_id", item, aspectRatio)
    : orientation;
  const both = resolvedOrientation.includes("both");
  const horizontal = resolvedOrientation.startsWith("horizontal");
  const pad = large ? 4 : 10;

  if (both && front && back) {
    if (horizontal) {
      return (
        <View style={[styles.pairCol, { padding: pad }]}>
          <Image source={{ uri: front }} style={[styles.sideImage, { aspectRatio: CARD_LANDSCAPE }]} resizeMode="contain" fadeDuration={0} />
          <Image source={{ uri: back }} style={[styles.sideImage, { aspectRatio: CARD_LANDSCAPE, marginTop: 8 }]} resizeMode="contain" fadeDuration={0} />
        </View>
      );
    }
    return (
      <View style={[styles.pairRow, { padding: pad }]}>
        <Image source={{ uri: front }} style={[styles.sideImageFlex, { aspectRatio: CARD_PORTRAIT }]} resizeMode="contain" fadeDuration={0} />
        <Image source={{ uri: back }} style={[styles.sideImageFlex, { aspectRatio: CARD_PORTRAIT }]} resizeMode="contain" fadeDuration={0} />
      </View>
    );
  }

  const combinedRatio = both
    ? horizontal
      ? CARD_LANDSCAPE / 2
      : CARD_PORTRAIT * 2
    : detectOrientation
      ? horizontal
        ? CARD_LANDSCAPE
        : CARD_PORTRAIT
      : horizontal
        ? CARD_LANDSCAPE
        : CARD_PORTRAIT;

  if (!front) {
    return (
      <View style={[styles.placeholder, { aspectRatio: combinedRatio }]}>
        <Ionicons name="id-card-outline" size={32} color={colors.textSubtle} />
        <Text style={[styles.placeholderText, { color: colors.textSubtle }]}>No preview</Text>
      </View>
    );
  }

  return (
    <View style={{ width: "100%", aspectRatio: combinedRatio, padding: pad }}>
      <Image source={{ uri: front }} style={styles.image} resizeMode="contain" fadeDuration={0} />
    </View>
  );
}

export function TemplateScreen() {
  const styles = useTemplateStyles();
  const { scale } = useResponsiveLayout();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const tabWidth = Math.floor((width - spacing.sm - spacing.xl) / 2.5);
  const [tab, setTab] = useState<string>(TEMPLATE_TABS[0].key);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectConfirmOpen, setSelectConfirmOpen] = useState(false);
  const [pendingSelectItem, setPendingSelectItem] = useState<TemplateItem | null>(
    null
  );
  const listRef = useRef<FlatList<TemplateItem>>(null);

  const gap = spacing.cardGap;
  const pad = spacing.md;
  const columns = tab.includes("both") ? 1 : 2;
  const cardWidth =
    columns === 1 ? width - pad * 2 : gridItemWidth(2, pad, gap, width);

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<TemplatesResponse>(
          "/teacher/templates",
          tab === "staff_id" ? undefined : { params: { orientation: tab } }
        );
        const list = (data.templates ?? []).filter((t) =>
          templateMatchesTab(t, tab)
        );
        setTemplates(list);
        const sel = data.selectedTemplateId;
        setSelectedId(list.some((t) => t.id === sel) ? sel : null);
      } catch (err) {
        setError(getErrorMessage(err, "Failed to load templates."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tab]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [load])
  );

  useEffect(() => {
    if (templates.length === 0) return;
    prefetchTemplateImages(templates.slice(0, 8));
  }, [templates]);

  useEffect(() => {
    if (previewIndex === null || templates.length === 0) return;
    const len = templates.length;
    const neighbors = [
      templates[(previewIndex + len - 1) % len],
      templates[(previewIndex + 1) % len],
    ];
    prefetchTemplateImages(neighbors);
  }, [previewIndex, templates]);

  const route = useRoute<RouteProp<MainTabParamList, "Template">>();
  const returnToOrgDetails = route.params?.returnToOrgDetails === true;

  async function saveSelection(item: TemplateItem) {
    if (selecting) return;
    setSelecting(true);
    try {
      setSelectedId(item.id);
      setPreviewIndex(null);
      if (returnToOrgDetails) {
        const preview = templatePreviewUrl(item);
        const params = {
          pendingTemplatePreviewUrl: preview ?? undefined,
          pendingTemplateId: item.id,
        };
        if (userId) {
          await mergeOrgDetailsDraft(userId, {
            templateId: item.id,
            templatePreviewUrlState: preview,
          });
        }
        navigation.dispatch(
          CommonActions.navigate({
            name: "OrganizationDetails",
            params,
            merge: true,
          })
        );
      } else {
        const preview = templatePreviewUrl(item);
        if (userId) {
          await mergeOrgDetailsDraft(userId, {
            templateId: item.id,
            templatePreviewUrlState: preview,
          });
        }
        try {
          await api.post(`/teacher/templates/${item.id}/select`);
          showToast("Selection saved successfully.");
        } catch (err) {
          showToast(getErrorMessage(err, "Could not select template."));
        }
      }
    } finally {
      setSelecting(false);
    }
  }

  const templateViewerItems = useMemo(
    () =>
      templates
        .map((item) => ({
          item,
          name: item.name,
          uri: templatePreviewUrl(item),
        }))
        .filter(
          (
            entry
          ): entry is {
            item: TemplateItem;
            name: string;
            uri: string;
          } => Boolean(entry.uri)
        ),
    [templates]
  );
  const previewImages = templateViewerItems.map((entry) => entry.uri);

  return (
    <View style={[styles.container, { backgroundColor: colors.surfaceMuted }]}>
      <OrangeGradientHeader
        title="TEMPLATES"
        subtitle="Select one design."
        onBack={() => navigation.navigate("Home" as never)}
      />

      <View style={[styles.tabsWrap, { backgroundColor: colors.surface }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
          decelerationRate="fast"
          snapToAlignment="start"
        >
          {TEMPLATE_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  styles.tab,
                  {
                    width: tabWidth,
                    backgroundColor: active
                      ? colors.primaryOrange
                      : colors.surface,
                    borderColor: active ? colors.primaryOrange : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? "#FFFFFF" : colors.text },
                  ]}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {TAB_LABELS[t.key] ?? t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <LinearGradient
          colors={["transparent", colors.surface]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.tabsFade}
          pointerEvents="none"
        />
      </View>

      {loading && templates.length === 0 ? (
        <LoadingBlock label="Loading templates…" />
      ) : error && templates.length === 0 ? (
        <ErrorRetry message={error} onRetry={() => void load()} />
      ) : (
        <FlatList
          ref={listRef}
          key={`${tab}-${columns}`}
          data={templates}
          keyExtractor={(item) => item.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.brandGreen}
            />
          }
          contentContainerStyle={[
            styles.grid,
            templates.length === 0 && styles.gridEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View
                style={[
                  styles.emptyIconCircle,
                  { backgroundColor: colors.orangeSoft },
                ]}
              >
                <Ionicons
                  name="grid-outline"
                  size={40}
                  color={colors.primaryOrange}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No templates yet
              </Text>
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                No templates available for this orientation. Ask your admin to
                upload templates, or try another tab.
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isSelected = selectedId === item.id;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.card,
                  {
                    width: cardWidth,
                    backgroundColor: colors.surface,
                    borderColor: isSelected
                      ? colors.brandGreen
                      : colors.borderLight,
                    borderWidth: isSelected ? 2 : 1,
                  },
                  pressed && { opacity: 0.94 },
                ]}
                onPress={() => {
                  const uri = templatePreviewUrl(item);
                  if (!uri) return;
                  const vi = templateViewerItems.findIndex(
                    (entry) => entry.item.id === item.id
                  );
                  if (vi >= 0) setPreviewIndex(vi);
                }}
                onLongPress={() => {
                  if (!returnToOrgDetails) {
                    saveSelection(item);
                  }
                }}
              >
                <TemplatePreview
                  item={item}
                  orientation={resolveTemplateOrientation(tab, item)}
                  detectOrientation={tab === "staff_id"}
                  colors={{
                    surface: colors.surface,
                    textSubtle: colors.textSubtle,
                  }}
                />
                <View style={styles.cardBottom}>
                  <Text
                    style={[styles.name, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </View>
                {isSelected ? (
                  <View style={styles.selectedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.brandGreen}
                    />
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <FullScreenImageViewer
        visible={previewIndex !== null}
        images={previewImages}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setViewerIndex}
        title={(idx) => templateViewerItems[idx]?.name ?? null}
        colors={colors}
        showSubmit
        submitLabel="Select"
        submitLoading={selecting}
        onSubmit={() => {
          const item = templateViewerItems[viewerIndex]?.item;
          if (item) {
            setPendingSelectItem(item);
            setSelectConfirmOpen(true);
          }
        }}
        imageLayout={(_, idx) => {
          if (tab !== "staff_id") return "default";
          const item = templateViewerItems[idx]?.item;
          if (!item) return "default";
          const { front } = templateSides(item);
          if (!front) return "default";
          const ratio = getCachedImageAspectRatio(front);
          if (ratio == null) {
            probeImageAspectRatio(front);
            const orientation = resolveTemplateOrientation(tab, item);
            return orientation.startsWith("horizontal") ? "landscape" : "default";
          }
          return isLandscapeAspectRatio(ratio) ? "landscape" : "default";
        }}
      />

      <SelectConfirmModal
        visible={selectConfirmOpen}
        colors={colors}
        loading={selecting}
        onCancel={() => {
          setSelectConfirmOpen(false);
          setPendingSelectItem(null);
        }}
        onConfirm={() => {
          if (pendingSelectItem) {
            void saveSelection(pendingSelectItem).finally(() => {
              setSelectConfirmOpen(false);
              setPendingSelectItem(null);
            });
          } else {
            setSelectConfirmOpen(false);
          }
        }}
      />
    </View>
  );
}

function useTemplateStyles() {
  return useResponsiveStyles(({ scale, modalWidth }) => ({
    container: { flex: 1 },
    tabsWrap: {
      position: "relative",
      flexGrow: 0,
    },
    tabsScroll: {
      flexGrow: 0,
    },
    tabsFade: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 0,
      width: scale(36),
    },
    tabs: {
      flexDirection: "row",
      paddingLeft: spacing.sm,
      paddingRight: spacing.xl,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      alignItems: "center",
    },
    tab: {
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      elevation: 1,
      shadowColor: "#65568D",
      shadowOpacity: 0.05,
      shadowRadius: scale(3),
      shadowOffset: { width: 0, height: scale(1) },
      justifyContent: "center",
      minHeight: scale(40),
    },
    previewCard: {
      width: "100%",
      maxWidth: "98%",
      maxHeight: "94%",
      borderRadius: radius.lg,
      padding: spacing.md,
    },
    fullscreenModal: {
      flex: 1,
    },
    fullscreenHeader: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    fullscreenHeaderCenter: {
      flex: 1,
      alignItems: "center",
    },
    fullscreenHeaderSpacer: {
      width: scale(28),
    },
    fullscreenPreviewRow: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing.xxs,
    },
    fullscreenPreviewScroll: {
      flex: 1,
    },
    fullscreenPreviewContent: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: spacing.xs,
    },
    fullscreenActions: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      alignItems: "center",
    },
    fullscreenCloseBtn: {
      minWidth: scale(100),
      alignItems: "center",
    },
    previewNav: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: spacing.sm,
    },
    previewCounter: {
      marginTop: spacing.xxs,
      textAlign: "center",
      fontFamily: fonts.medium,
      fontSize: typeScale.sm,
    },
    previewArrow: {
      flexShrink: 0,
      zIndex: 4,
      elevation: 8,
      padding: spacing.sm,
      minWidth: scale(48),
      minHeight: scale(48),
      alignItems: "center",
      justifyContent: "center",
    },
    previewBody: {
      flex: 1,
      flexShrink: 1,
      minWidth: 0,
      minHeight: scale(320),
      overflow: "hidden",
    },
    previewImageClip: {
      width: "100%",
      overflow: "hidden",
    },
    previewActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
      alignItems: "center",
    },
    yesBtnWrap: { flex: 1 },
    tabText: {
      fontSize: typeScale.xs * 0.72,
      fontFamily: fonts.semiBold,
      textAlign: "center",
      lineHeight: typeScale.xs * 0.95,
    },
    grid: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm + 2,
      paddingBottom: spacing.xl + 4,
    },
    gridEmpty: { flexGrow: 1, justifyContent: "center" },
    row: { justifyContent: "space-between", marginBottom: spacing.sm + 2 },
    card: {
      borderRadius: radius.lg,
      overflow: "hidden",
      position: "relative",
      elevation: 2,
      shadowColor: "#65568D",
      shadowOpacity: 0.06,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    cardPressed: { opacity: 0.9 },
    pairCol: { width: "100%" },
    pairRow: {
      width: "100%",
      flexDirection: "row",
      gap: scale(8),
      alignItems: "stretch",
    },
    sideImage: { width: "100%" },
    sideImageFlex: { flex: 1 },
    image: { width: "100%", height: "100%" },
    placeholder: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xxs + 2,
      padding: spacing.md,
    },
    placeholderText: {
      fontFamily: fonts.medium,
      fontSize: typeScale.xs,
    },
    selectedBadge: {
      position: "absolute",
      top: spacing.xs,
      right: spacing.xs,
    },
    cardBottom: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: spacing.sm - 2,
      paddingVertical: spacing.sm - 2,
    },
    name: {
      flex: 1,
      fontFamily: fonts.semiBold,
      fontSize: typeScale.sm,
    },
    emptyWrap: {
      alignItems: "center",
      paddingHorizontal: spacing.xl + 4,
      paddingVertical: spacing.xl,
    },
    emptyIconCircle: {
      width: spacing.avatarMd + 4,
      height: spacing.avatarMd + 4,
      borderRadius: (spacing.avatarMd + 4) / 2,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.md,
    },
    emptyTitle: {
      fontFamily: fonts.bold,
      fontSize: typeScale.lg,
      marginBottom: spacing.xs,
      textAlign: "center",
    },
    empty: {
      textAlign: "center",
      fontFamily: fonts.regular,
      fontSize: typeScale.sm,
      lineHeight: typeScale.sm * 1.45,
    },
    modalBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.sm,
    },
    modalCard: {
      width: "100%",
      maxWidth: modalWidth,
      borderRadius: radius.lg,
      padding: spacing.lg + 2,
    },
    modalTitle: {
      fontSize: typeScale.lg,
      fontFamily: fonts.bold,
    },
    modalBody: {
      marginTop: spacing.sm - 2,
      lineHeight: typeScale.sm * 1.45,
      fontFamily: fonts.regular,
      fontSize: typeScale.sm,
    },
    modalActions: {
      marginTop: spacing.lg,
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: spacing.sm - 2,
    },
    cancelBtn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm - 1,
      borderRadius: radius.md,
    },
    cancelText: {
      fontFamily: fonts.bold,
      fontSize: typeScale.sm,
    },
    yesBtn: {
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm - 1,
      borderRadius: radius.md,
      minWidth: "22%",
      alignItems: "center",
    },
    yesDisabled: { opacity: 0.65 },
    yesText: {
      fontFamily: fonts.bold,
      color: "#FFFFFF",
      fontSize: typeScale.sm,
    },
  }));
}
