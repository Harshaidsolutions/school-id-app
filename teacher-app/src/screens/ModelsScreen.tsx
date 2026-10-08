import { Pressable } from "../components/Pressable";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { mergeOrgDetailsDraft } from "../utils/orgDetailsDraft";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { modelImageUrl, modelVideoUrl } from "../utils/modelImage";
import { useToast } from "../components/Toast";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { PRODUCT_MODELS, MODEL_TABS, MODEL_CATEGORY, type TeacherModel } from "../types";
import { FullScreenImageViewer } from "../components/FullScreenImageViewer";
import { SelectConfirmModal } from "../components/SelectConfirmModal";
import type { RootStackParamList, MainTabParamList } from "../navigation/types";
import { cardShadow, radius, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { gridItemWidth } from "../theme/responsive";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

/** Handoff: model image + filename + 200–300 word description */
const MODEL_DESCRIPTIONS: Record<string, string> = {
  "ID Cards":
    "Our flagship student and staff ID card model is designed for schools that need a durable, professional identity solution. Each card layout supports school logo, student photograph, name, class, roll number, blood group, parent contact and barcode or QR options depending on the selected template. The print-ready design uses high-contrast typography and balanced spacing so every field remains readable after lamination. Teachers capture photos in the app and submit data once; the production team then prints cards to the approved specification. This model works for primary, middle and high schools and supports both vertical and horizontal orientations. Choose this model when your institute needs complete school identity cards with consistent branding across all classes.",
  Belts:
    "The Belts model covers school identity belts and related wearables that carry institute branding. Use this option when your order includes fabric or PVC belts with school name, logo embroidery or print, and optional size variants. The description and selected model help the production team prepare artwork and quantity planning alongside ID cards. Capture school logo and brand colours in Required Details so belt artwork matches the rest of your identity kit. Belts are often ordered together with ID cards and badges for a complete uniform identity package. Select Belts when your school requires branded belts as part of the annual identity order.",
  Ties:
    "The Ties model is for school ties and neckwear with institute colours, stripes or logo placement. This model helps the production workflow track tie artwork separately from ID cards while still linking to the same school profile. Provide clear logo and colour guidance in Required Details so printed or woven ties match your approved brand. Ties are commonly ordered for senior classes and staff. Use this model when your package includes school ties along with cards or badges.",
  Diaries:
    "School diaries and academic planners use this model for cover design, inside layout notes and branding. The diary model typically includes school name, logo, academic year and optional house or motto artwork. Teachers and admins can attach organisation details so the production team uses the correct school identity. Diaries are often ordered at the start of the academic year together with ID cards. Select Diaries when your institute needs branded student diaries as part of the order.",
  "Progress Cards":
    "Progress Cards cover report cards and academic progress documents that need school branding and structured layout. This model is selected when the institute requires printed progress reports with logo, student identity fields and grade tables. Align template choice and school details so every progress card matches institutional standards. Progress Cards complement ID cards for a complete student documentation set. Choose this model when report cards or progress sheets are part of your current print request.",
  Certificates:
    "Certificates cover achievement, participation and academic certificates with formal school branding. The model supports crest or logo placement, student name fields and certificate title styling. Provide signature and logo uploads in Required Details so certificates can be printed with authorised signatories. Certificates are frequently ordered for annual day, exams and sports events. Select Certificates when your school needs branded certificate printing.",
  "Student Files":
    "Student Files cover file folders, document covers and student record jackets branded with school identity. This model helps organise artwork for file covers that show school name, logo and optional class labelling. Use organisation photo and logo uploads for richer cover designs. Student Files are useful for admission kits and office record management. Choose this model when file covers or student folders are included in the order.",
  "Rank Badges":
    "Rank Badges are metal or fabric badges for ranks, prefects, houses and special roles. The model tracks badge artwork separately so production can prepare sizes, colours and pin or clip hardware notes. Pair with school logo and colour guidance from Required Details. Rank Badges are often ordered with ID cards for leadership students. Select Rank Badges when your institute needs role or house badges.",
  "Cloth Badges":
    "Cloth Badges include embroidered or printed fabric badges for uniforms, blazers and bags. This model focuses on stitch-friendly artwork, logo clarity and colour matching for textile production. Upload a clear school logo for best embroidery results. Cloth Badges pair well with belts, ties and ID cards for a full uniform identity kit. Choose Cloth Badges when fabric badges are part of the order.",
  "Key Chains":
    "Key Chains cover acrylic, metal or PVC keychain products with school branding and optional student photo variants. This model is used when promotional or identity keychains are ordered with or without ID cards. Provide logo and colour details so artwork stays consistent with the school brand. Key Chains are popular for events and admission gifts. Select Key Chains when branded keychains are required.",
  "Book Covers":
    "Book Covers include notebook, textbook and diary cover wraps with school branding. The model supports full-bleed artwork, logo placement and academic year labelling. Use organisation details and logo uploads to keep covers consistent across subjects. Book Covers are typically ordered in bulk at term start. Choose Book Covers when branded notebook or book wraps are part of your print request.",
};


export function ModelsScreen() {
  const styles = useModelsStyles();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<MainTabParamList, "Models">>();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { width } = useWindowDimensions();
  const gap = spacing.cardGap;
  const pad = spacing.md;
  const cardWidth = gridItemWidth(2, pad, gap, width);

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedTagNames, setSelectedTagNames] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectConfirmOpen, setSelectConfirmOpen] = useState(false);
  const [pendingSelectName, setPendingSelectName] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [catalogModels, setCatalogModels] = useState<TeacherModel[]>([]);
  const [catalogTags, setCatalogTags] = useState<TeacherModel[]>([]);
  const [modelTab, setModelTab] = useState<(typeof MODEL_TABS)[number]["key"]>(
    "id_cards"
  );
  const listRef = useRef<FlatList<string>>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [orgRes, modelsRes] = await Promise.all([
        api.get<{ school: { model: string | null; tags?: string | null } }>(
          "/teacher/organization"
        ),
        api.get<{ models: TeacherModel[]; tags?: TeacherModel[] }>(
          "/teacher/models"
        ),
      ]);
      setSelectedModel(orgRes.data.school.model);
      const tagCsv = orgRes.data.school.tags ?? "";
      setSelectedTagNames(
        tagCsv
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      );
      const models = (modelsRes.data.models ?? []).map((m) => ({
        ...m,
        image_url: modelImageUrl(m),
      }));
      const tags = (modelsRes.data.tags ?? []).map((m) => ({
        ...m,
        image_url: modelImageUrl(m),
      }));
      setCatalogModels(models);
      setCatalogTags(tags);
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (route.params?.tab) {
        setModelTab(route.params.tab);
      }
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
    }, [load, route.params?.tab])
  );

  async function saveSelection(name: string) {
    if (saving) return;
    setPreviewIndex(null);
    const fromOrgDetails = route.params?.returnToOrgDetails === true;
    const previewUrl = modelImageUrl(
      (modelTab === "tags" ? catalogTags : catalogModels).find((m) => m.name === name) ?? null
    );

    if (fromOrgDetails) {
      if (modelTab === "tags") {
        setSelectedTagNames([name]);
      } else {
        setSelectedModel(name);
      }
      const params =
        modelTab === "tags"
          ? {
              pendingTagsPreviewUrl: previewUrl ?? undefined,
              pendingTagsName: name,
            }
          : {
              pendingModelPreviewUrl: previewUrl ?? undefined,
              pendingModelName: name,
            };
      if (userId) {
        await mergeOrgDetailsDraft(
          userId,
          modelTab === "tags"
            ? { tags: name, tagsPreviewUrl: previewUrl }
            : { model: name, modelPreviewUrl: previewUrl }
        );
      }
      navigation.dispatch(
        CommonActions.navigate({
          name: "OrganizationDetails",
          params,
          merge: true,
        })
      );
      return;
    }

    setSaving(true);
    try {
      if (userId) {
        await mergeOrgDetailsDraft(
          userId,
          modelTab === "tags"
            ? { tags: name, tagsPreviewUrl: previewUrl }
            : { model: name, modelPreviewUrl: previewUrl }
        );
      }
      const form = new FormData();
      if (modelTab === "tags") {
        form.append("tags", name);
      } else {
        form.append("model", name);
      }
      await api.put("/teacher/organization", form, {
        transformRequest: (body) => body,
      });
      if (modelTab === "tags") {
        setSelectedTagNames([name]);
      } else {
        setSelectedModel(name);
      }
      showToast("Selection saved successfully.");
    } catch (err) {
      showToast(getErrorMessage(err, "Could not save selection."));
    } finally {
      setSaving(false);
    }
  }

  const tabCatalog = modelTab === "tags" ? catalogTags : catalogModels;

  const modelNames =
    tabCatalog.length > 0
      ? tabCatalog.map((m) => m.name)
      : [...PRODUCT_MODELS].filter(
          (name) => (MODEL_CATEGORY[name] ?? "id_cards") === modelTab
        );

  function descriptionFor(name: string): string {
    const fromApi = tabCatalog.find((m) => m.name === name)?.description;
    if (fromApi && fromApi.trim()) return fromApi;
    return MODEL_DESCRIPTIONS[name] ?? "";
  }

  function imageFor(name: string): string | null {
    const match = tabCatalog.find((m) => m.name === name);
    return modelImageUrl(match ?? null);
  }

  function videoFor(name: string): string | null {
    const match = tabCatalog.find((m) => m.name === name);
    return modelVideoUrl(match ?? null);
  }

  const modelViewerItems = useMemo(
    () =>
      modelNames
        .map((name) => ({
          name,
          uri: imageFor(name),
          description: descriptionFor(name),
        }))
        .filter(
          (
            entry
          ): entry is { name: string; uri: string; description: string } =>
            Boolean(entry.uri)
        ),
    [modelNames, tabCatalog, modelTab]
  );
  const previewImages = modelViewerItems.map((entry) => entry.uri);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <OrangeGradientHeader
        title="MODELS"
        subtitle="Select One Model and Tag"
        onBack={() => navigation.navigate("Home" as never)}
      />

      <View style={[styles.tabsWrap, { backgroundColor: colors.surface }]}>
        <View style={styles.tabsRow}>
          {MODEL_TABS.map((t) => {
            const active = modelTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setModelTab(t.key)}
                style={[
                  styles.modelTab,
                  {
                    backgroundColor: active
                      ? colors.primaryOrange
                      : colors.surface,
                    borderColor: active ? colors.primaryOrange : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.modelTabText,
                    { color: active ? "#FFFFFF" : colors.text },
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FlatList
        key={modelTab}
        ref={listRef}
        data={modelNames}
        keyExtractor={(item) => item}
        numColumns={modelTab === "tags" ? 1 : 2}
        columnWrapperStyle={modelTab === "tags" ? undefined : styles.row}
        contentContainerStyle={styles.grid}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.brandGreen}
          />
        }
        ListEmptyComponent={
          modelTab === "tags" ? (
            <View style={styles.tagPlaceholderGrid}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.tagPlaceholderCard,
                    {
                      width: cardWidth,
                      backgroundColor: colors.surface,
                      borderColor: colors.borderLight,
                    },
                  ]}
                />
              ))}
            </View>
          ) : (
            <Text style={[styles.modelPreview, { color: colors.textMuted, padding: spacing.md }]}>
              No models available yet.
            </Text>
          )
        }
        renderItem={({ item, index }) => {
          if (modelTab === "tags") {
            const isSelected = selectedTagNames.includes(item);
            const imageUrl = imageFor(item);
            return (
              <Pressable
                style={[
                  styles.tagCard,
                  {
                    width: width - pad * 2,
                    backgroundColor: colors.surface,
                    borderColor: isSelected ? colors.brandGreen : colors.borderLight,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                onPress={() => {
                  const uri = imageFor(item);
                  if (!uri) return;
                  const vi = modelViewerItems.findIndex((e) => e.name === item);
                  if (vi >= 0) setPreviewIndex(vi);
                }}
                onLongPress={() => {
                  if (!route.params?.returnToOrgDetails) {
                    void saveSelection(item);
                  }
                }}
              >
                <View
                  style={[
                    styles.tagImageWrap,
                    { backgroundColor: colors.graySoft },
                  ]}
                >
                  {imageUrl ? (
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.tagImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <View
                      style={[
                        styles.tagRowBadge,
                        { backgroundColor: colors.orangeSoft },
                      ]}
                    >
                      <Ionicons
                        name="pricetag"
                        size={28}
                        color={colors.primaryOrange}
                      />
                    </View>
                  )}
                </View>
                <Text
                  style={[styles.tagCardLabel, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item}
                </Text>
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
          }

          const isSelected = selectedModel === item;
          const imageUrl = imageFor(item);
          const videoUrl = videoFor(item);
          return (
            <Pressable
              style={[
                styles.card,
                {
                  width: cardWidth,
                  backgroundColor: colors.surface,
                  borderColor: isSelected ? colors.brandGreen : colors.border,
                  borderWidth: isSelected ? 2 : 1,
                },
              ]}
              onPress={() => {
                if (videoUrl && !imageUrl) {
                  void Linking.openURL(videoUrl);
                  return;
                }
                const uri = imageFor(item);
                if (!uri) return;
                const vi = modelViewerItems.findIndex((e) => e.name === item);
                if (vi >= 0) setPreviewIndex(vi);
              }}
              onLongPress={() => {
                if (!route.params?.returnToOrgDetails) {
                  void saveSelection(item);
                }
              }}
            >
              <View
                style={[
                  styles.cardTop,
                  { backgroundColor: colors.graySoft },
                ]}
              >
                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={styles.modelImageFull}
                    resizeMode="contain"
                  />
                ) : videoUrl ? (
                  <View style={{ alignItems: "center" }}>
                    <Ionicons name="play-circle" size={36} color={colors.primaryOrange} />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>
                      Play video
                    </Text>
                  </View>
                ) : (
                  <Ionicons
                    name="cube-outline"
                    size={28}
                    color={colors.primaryOrange}
                  />
                )}
                {isSelected && (
                  <View style={styles.selectedBadge}>
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.brandGreen}
                    />
                  </View>
                )}
              </View>
              <View style={styles.cardBottom}>
                <Text
                  style={[styles.modelName, { color: colors.text }]}
                  numberOfLines={2}
                >
                  {item}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />

      <FullScreenImageViewer
        visible={previewIndex !== null}
        images={previewImages}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        onIndexChange={setViewerIndex}
        title={(idx) => modelViewerItems[idx]?.name ?? null}
        caption={(idx) =>
          modelTab === "tags"
            ? null
            : modelViewerItems[idx]?.description?.trim() || null
        }
        colors={colors}
        showSubmit
        submitLabel="Select"
        submitLoading={saving}
        onSubmit={() => {
          const name = modelViewerItems[viewerIndex]?.name;
          if (name) {
            setPendingSelectName(name);
            setSelectConfirmOpen(true);
          }
        }}
        imageLayout={modelTab === "tags" ? "rotatePortrait" : "default"}
      />

      <SelectConfirmModal
        visible={selectConfirmOpen}
        colors={colors}
        loading={saving}
        onCancel={() => {
          setSelectConfirmOpen(false);
          setPendingSelectName(null);
        }}
        onConfirm={() => {
          if (pendingSelectName) {
            void saveSelection(pendingSelectName).finally(() => {
              setSelectConfirmOpen(false);
              setPendingSelectName(null);
            });
          } else {
            setSelectConfirmOpen(false);
          }
        }}
      />
    </View>
  );
}

function useModelsStyles() {
  return useResponsiveStyles(({ hp, scale }) => ({
  container: { flex: 1 },
  grid: { padding: spacing.md, paddingBottom: spacing.xl + 4 },
  row: { justifyContent: "space-between", marginBottom: spacing.cardGap },
  card: {
    borderRadius: radius.lg,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#65568D",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTop: {
    aspectRatio: 1.35,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xs,
    overflow: "hidden",
  },
  selectedBadge: { position: "absolute", top: spacing.xs, right: spacing.xs },
  modelImageFull: {
    width: "100%",
    height: "100%",
  },
  cardBottom: {
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: spacing.sm - 2,
    gap: spacing.xxs,
  },
  modelName: {
    ...textStyles.h3,
  },
  modelPreview: {
    ...textStyles.body,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  detailCard: {
    width: "100%",
    maxHeight: "80%",
    borderRadius: radius.lg,
    padding: spacing.lg - 2,
  },
  detailScroll: { maxHeight: hp(45), marginTop: spacing.sm - 2 },
  previewImage: {
    width: "100%",
    height: hp(48),
    marginTop: spacing.sm,
    borderRadius: radius.md,
  },
  tagPreviewImage: {
    height: hp(52),
    backgroundColor: "#F1F3FA",
  },
  tabsWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabsRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  modelTab: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    alignItems: "center",
  },
  modelTabText: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.body,
  },
  detailBody: {
    fontFamily: fonts.regular,
    fontSize: typeScale.sm,
    lineHeight: typeScale.sm * 1.55,
  },
  modalCard: {
    width: "100%",
    maxWidth: "92%",
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: {
    fontSize: typeScale.xl,
    fontFamily: fonts.bold,
  },
  modalModelName: {
    marginTop: spacing.sm,
    fontSize: typeScale.lg,
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  modalBody: {
    marginTop: spacing.sm - 2,
    lineHeight: typeScale.sm * 1.5,
    fontFamily: fonts.regular,
    fontSize: typeScale.sm,
  },
  modalActions: {
    marginTop: spacing.lg - 2,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm - 2,
  },
  cancelBtn: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.md,
  },
  cancelText: { fontFamily: fonts.semiBold, fontSize: typeScale.sm },
  yesBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 1,
    borderRadius: radius.md,
    minWidth: "22%",
    alignItems: "center",
  },
  yesDisabled: { opacity: 0.65 },
  yesText: {
    fontFamily: fonts.semiBold,
    color: "#FFFFFF",
    fontSize: typeScale.sm,
  },
  tagCard: {
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: spacing.sm,
    position: "relative",
  },
  tagImageWrap: {
    width: "100%",
    height: scale(88),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tagImage: {
    width: "100%",
    height: "100%",
  },
  tagCardLabel: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
  },
  tagRowBadge: {
    width: scale(56),
    height: scale(40),
    borderRadius: scale(6),
    alignItems: "center",
    justifyContent: "center",
  },
  tagsFooter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tagPlaceholderGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.cardGap,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  tagPlaceholderCard: {
    borderRadius: radius.card,
    borderWidth: 1,
    minHeight: hp(14),
    marginBottom: spacing.cardGap,
    ...cardShadow,
  },
  }));
}
