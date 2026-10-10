import { Pressable } from "../components/Pressable";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { FullScreenImageViewer } from "../components/FullScreenImageViewer";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import api, { getErrorMessage } from "../api/client";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import type { RootStackParamList } from "../navigation/types";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { icons } from "../theme/responsive";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";

type BrochureItem = {
  id: string;
  name: string;
  fileUrl: string | null;
  createdAt: string | null;
};

type BrochuresResponse = {
  status: string;
  count: number;
  brochures: BrochureItem[];
};

const BROCHURES_CACHE_TTL_MS = 60_000;
let brochuresCache: { items: BrochureItem[]; ts: number } | null = null;

export function BrochureScreen() {
  const styles = useBrochureStyles();
  const { scale } = useResponsiveLayout();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const thumbWidth = width - spacing.md * 2;
  const previewMaxHeight = Math.max(scale(360), height - scale(200) - insets.top - insets.bottom);
  const initialCache =
    brochuresCache &&
    Date.now() - brochuresCache.ts < BROCHURES_CACHE_TTL_MS
      ? brochuresCache.items
      : null;
  const [loading, setLoading] = useState(() => !initialCache?.length);
  const [error, setError] = useState<string | null>(null);
  const [brochures, setBrochures] = useState<BrochureItem[]>(
    () => initialCache ?? []
  );
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const loadingRef = useRef(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const cached =
      brochuresCache &&
      Date.now() - brochuresCache.ts < BROCHURES_CACHE_TTL_MS
        ? brochuresCache.items
        : null;

    if (cached && cached.length > 0) {
      setBrochures(cached);
      setError(null);
      setLoading(false);
    } else if (!silent) {
      setLoading(true);
    }

    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);

    try {
      const { data } = await api.get<BrochuresResponse>("/teacher/brochures");
      const items = (data.brochures ?? []).filter((b) => b.fileUrl);
      if (items.length === 0) {
        setError("No brochures uploaded yet. Ask admin to upload some.");
        setBrochures([]);
        brochuresCache = null;
      } else {
        setBrochures(items);
        brochuresCache = { items, ts: Date.now() };
        const uris = items
          .map((b) => resolveMediaUrl(b.fileUrl))
          .filter((uri): uri is string => Boolean(uri));
        void Image.prefetch(uris.slice(0, 2));
        if (uris.length > 2) {
          setTimeout(() => {
            void Image.prefetch(uris.slice(2));
          }, 0);
        }
      }
    } catch (err) {
      try {
        const { data } = await api.get<{
          brochure: BrochureItem | null;
        }>("/teacher/brochure");
        if (data.brochure?.fileUrl) {
          const items = [data.brochure];
          setBrochures(items);
          brochuresCache = { items, ts: Date.now() };
          const uri = resolveMediaUrl(data.brochure.fileUrl);
          if (uri) void Image.prefetch(uri);
        } else {
          setError("No brochures uploaded yet. Ask admin to upload some.");
          setBrochures([]);
          brochuresCache = null;
        }
      } catch (fallbackErr) {
        if (!cached) {
          setError(getErrorMessage(fallbackErr, "Failed to fetch brochures."));
          setBrochures([]);
        }
      }
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCache?.length) return;
    void Image.prefetch(
      initialCache
        .map((b) => resolveMediaUrl(b.fileUrl))
        .filter((uri): uri is string => Boolean(uri))
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      const hasFreshCache = Boolean(
        brochuresCache &&
          Date.now() - brochuresCache.ts < BROCHURES_CACHE_TTL_MS &&
          brochuresCache.items.length > 0
      );
      void load({ silent: hasFreshCache });
    }, [load])
  );

  const previewImages = brochures
    .map((b) => resolveMediaUrl(b.fileUrl))
    .filter((uri): uri is string => Boolean(uri));

  return (
    <View style={[styles.safe, { backgroundColor: colors.background }]}>
      <OrangeGradientHeader title="Brochures" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {loading && brochures.length === 0 ? (
          <LoadingBlock label="Loading brochures…" />
        ) : error && brochures.length === 0 ? (
          <ErrorRetry message={error} onRetry={() => void load()} />
        ) : (
          brochures.map((item, index) => {
            const uri = resolveMediaUrl(item.fileUrl);
            if (!uri) return null;
            return (
              <Pressable
                key={item.id}
                style={[
                  styles.card,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={() => setPreviewIndex(index)}
              >
                <Image
                  source={{ uri }}
                  style={[styles.thumb, { width: thumbWidth }]}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={item.id}
                  priority={index < 2 ? "high" : "low"}
                  placeholder={{ blurhash: "L6PZfSi_.AyE_3t7t7R**0o#DgR4" }}
                  transition={120}
                />
                <Text style={[styles.tapHint, { color: colors.textMuted }]}>
                  Tap to preview
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <FullScreenImageViewer
        visible={previewIndex !== null}
        images={previewImages}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
        colors={colors}
        showSubmit={false}
      />
    </View>
  );
}

function useBrochureStyles() {
  return useResponsiveStyles(({ scale }) => ({
  safe: { flex: 1 ,
      backgroundColor: "#FAF8FF"
    },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,

      backgroundColor: "#FAF8FF"
    },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: spacing.sm,
    overflow: "hidden",

      backgroundColor: "#FFFFFF",
      borderColor: "#E2E8EF",
      shadowColor: "#005C55",
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2
    },
  title: {
    fontFamily: fonts.semiBold,
    fontSize: typeScale.sm,
    marginBottom: spacing.xs,
    textAlign: "center",

      color: "#131B2E"
    },
  thumb: {
    minHeight: scale(220),
    alignSelf: "center",
  },
  tapHint: {
    marginTop: spacing.xs,
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  modalCard: {
    borderRadius: 26,
    padding: spacing.md,
    width: "100%",
    alignSelf: "center",

      backgroundColor: "#FFFFFF"
    },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
  },
  counter: {
    marginTop: spacing.xxs,
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
    textAlign: "center",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.xxs,
  },
  arrowBtn: {
    padding: spacing.xxs,
  },
  previewScroll: {
    flex: 1,
  },
  previewScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xs,
  },
  previewImage: {
    minHeight: scale(280),
    aspectRatio: 0.75,
  },
  closeBtn: {
    marginTop: spacing.md,
    borderRadius: 18,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  closeBtnText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
  },
  }));
}
