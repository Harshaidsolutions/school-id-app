import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppColors } from "../theme/palettes";
import { radius, spacing, submitGradient } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SWIPE_THRESHOLD = 48;

export type ViewerImageLayout =
  | "default"
  | "portrait"
  | "landscape"
  | "rotatePortrait";

type Props = {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
  colors: AppColors;
  showCounter?: boolean;
  showNavButtons?: boolean;
  showSubmit?: boolean;
  onSubmit?: () => void;
  submitLoading?: boolean;
  submitLabel?: string;
  onIndexChange?: (index: number) => void;
  imageLayout?: ViewerImageLayout | ((uri: string, index: number) => ViewerImageLayout);
  title?: string | ((index: number) => string | null | undefined);
  subtitle?: string | ((index: number) => string | null | undefined);
  /** Shown under the image. Used by the Models description. */
  caption?: string | ((index: number) => string | null | undefined);
};

function resolveLayout(
  layout: Props["imageLayout"],
  uri: string | null,
  index: number
): ViewerImageLayout {
  if (!layout) return "default";
  return typeof layout === "function" ? layout(uri ?? "", index) : layout;
}

function ViewerActionButton({
  label,
  disabled,
  onPress,
  loading,
  flex,
  icon,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  loading?: boolean;
  flex?: number;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      style={[styles.navBtnWrap, { flex: flex ?? 1 }, inactive && styles.navBtnDisabled]}
    >
      <LinearGradient
        colors={inactive ? ["#666666", "#555555"] : [...submitGradient]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.navBtn}
      >
        {loading ? (
          <Text style={styles.navBtnText}>…</Text>
        ) : (
          <>
            {icon ? (
              <Ionicons name={icon} size={15} color="#FFFFFF" />
            ) : null}
            <Text
              style={[styles.navBtnText, inactive && styles.navBtnTextDisabled]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
            >
              {label}
            </Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function FullScreenImageViewer({
  visible,
  images,
  initialIndex = 0,
  onClose,
  colors: _colors,
  showCounter = true,
  showNavButtons = true,
  showSubmit = false,
  onSubmit,
  submitLoading = false,
  submitLabel = "Select",
  onIndexChange,
  imageLayout = "default",
  title,
  subtitle,
  caption,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);

  const indexRef = useRef(index);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const pinchBaseScaleRef = useRef(1);
  const panBaseXRef = useRef(0);
  const panBaseYRef = useRef(0);

  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);

  const swipeRef = useRef({
    startX: 0,
    startY: 0,
    tracking: false,
  });

  const goPrevRef = useRef<() => void>(() => {});
  const goNextRef = useRef<() => void>(() => {});

  const headerHeight = insets.top + spacing.sm + 44;
  const footerHeight = 52;
  const footerReserve =
    footerHeight + insets.bottom + spacing.lg + (showSubmit ? spacing.sm : 0);

  const resetTransform = useCallback(() => {
    scaleRef.current = 1;
    pinchBaseScaleRef.current = 1;
    panXRef.current = 0;
    panYRef.current = 0;
    panBaseXRef.current = 0;
    panBaseYRef.current = 0;
    scaleAnim.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [scaleAnim, translateX, translateY]);

  const setViewerIndex = useCallback(
    (next: number) => {
      indexRef.current = next;
      setIndex(next);
      onIndexChange?.(next);
      resetTransform();
    },
    [onIndexChange, resetTransform]
  );

  const goPrev = useCallback(() => {
    if (indexRef.current > 0) {
      setViewerIndex(indexRef.current - 1);
    }
  }, [setViewerIndex]);

  const goNext = useCallback(() => {
    if (indexRef.current < images.length - 1) {
      setViewerIndex(indexRef.current + 1);
    }
  }, [images.length, setViewerIndex]);

  goPrevRef.current = goPrev;
  goNextRef.current = goNext;

  useEffect(() => {
    if (visible) {
      const clamped = Math.min(
        Math.max(initialIndex, 0),
        Math.max(0, images.length - 1)
      );
      indexRef.current = clamped;
      setIndex(clamped);
      onIndexChange?.(clamped);
      resetTransform();
    }
  }, [visible, initialIndex, images.length, onIndexChange, resetTransform]);

  const clampScale = (value: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

  const onPinchGestureEvent = useCallback(
    (event: PinchGestureHandlerGestureEvent) => {
      if (event.nativeEvent.state !== State.ACTIVE) return;
      const nextScale = clampScale(
        pinchBaseScaleRef.current * event.nativeEvent.scale
      );
      scaleRef.current = nextScale;
      scaleAnim.setValue(nextScale);
    },
    [scaleAnim]
  );

  const onPinchHandlerStateChange = useCallback(
    (event: PinchGestureHandlerStateChangeEvent) => {
      const { state, oldState, scale } = event.nativeEvent;
      if (state === State.BEGAN) {
        pinchBaseScaleRef.current = scaleRef.current;
      }
      if (oldState === State.ACTIVE) {
        const nextScale = clampScale(pinchBaseScaleRef.current * scale);
        scaleRef.current = nextScale;
        pinchBaseScaleRef.current = nextScale;
        scaleAnim.setValue(nextScale);
        if (nextScale <= 1.02) {
          scaleRef.current = 1;
          pinchBaseScaleRef.current = 1;
          panXRef.current = 0;
          panYRef.current = 0;
          panBaseXRef.current = 0;
          panBaseYRef.current = 0;
          scaleAnim.setValue(1);
          translateX.setValue(0);
          translateY.setValue(0);
        }
      }
    },
    [scaleAnim, translateX, translateY]
  );

  const onPanGestureEvent = useCallback(
    (event: PanGestureHandlerGestureEvent) => {
      const { state, translationX, translationY } = event.nativeEvent;
      if (state !== State.ACTIVE) return;

      if (scaleRef.current > 1.05) {
        translateX.setValue(panBaseXRef.current + translationX);
        translateY.setValue(panBaseYRef.current + translationY);
        return;
      }

      if (swipeRef.current.tracking) {
        translateX.setValue(translationX * 0.35);
      }
    },
    [translateX, translateY]
  );

  const onPanHandlerStateChange = useCallback(
    (event: PanGestureHandlerStateChangeEvent) => {
      const { state, oldState, translationX, translationY, x, y } =
        event.nativeEvent;

      if (state === State.BEGAN) {
        swipeRef.current.tracking = scaleRef.current <= 1.05;
        swipeRef.current.startX = x;
        swipeRef.current.startY = y;
        panBaseXRef.current = panXRef.current;
        panBaseYRef.current = panYRef.current;
      }

      if (oldState === State.ACTIVE) {
        if (scaleRef.current > 1.05) {
          panXRef.current = panBaseXRef.current + translationX;
          panYRef.current = panBaseYRef.current + translationY;
          translateX.setValue(panXRef.current);
          translateY.setValue(panYRef.current);
          return;
        }

        translateX.setValue(0);

        if (
          swipeRef.current.tracking &&
          Math.abs(translationX) >= SWIPE_THRESHOLD &&
          Math.abs(translationX) > Math.abs(translationY) * 1.15
        ) {
          if (translationX > 0) goPrevRef.current();
          else goNextRef.current();
        }

        swipeRef.current.tracking = false;
      }
    },
    [translateX, translateY]
  );

  const uri = images[index] ?? null;
  if (!visible) return null;

  const layout = resolveLayout(imageLayout, uri, index);
  const rotated = layout === "rotatePortrait";
  const stageHeight = height - headerHeight - footerReserve - spacing.md;

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;
  const showFooterNav = showNavButtons && (images.length > 1 || showSubmit);
  const showSelect = showSubmit && Boolean(onSubmit);

  let frameWidth = width - spacing.lg;
  let frameHeight = stageHeight;
  if (layout === "portrait" || rotated) {
    frameWidth = Math.min(width * 0.78, 340);
    frameHeight = Math.min(stageHeight * 0.85, stageHeight - spacing.lg);
  } else if (layout === "landscape") {
    frameWidth = width - spacing.lg;
    frameHeight = Math.min(stageHeight * 0.82, frameWidth / 1.58);
  } else {
    frameHeight = Math.min(stageHeight * 0.86, stageHeight - spacing.md);
  }

  const imageBoxWidth = rotated ? frameHeight : frameWidth;
  const imageBoxHeight = rotated ? frameWidth : frameHeight;

  return (
    <Modal
      visible
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root}>
          <View
            style={[
              styles.header,
              {
                paddingTop: insets.top + spacing.sm,
                paddingHorizontal: spacing.sm,
                minHeight: headerHeight,
              },
            ]}
            pointerEvents="box-none"
          >
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={styles.closeBtn}
              accessibilityLabel="Close viewer"
            >
              <Ionicons name="close" size={28} color="#FFFFFF" />
            </Pressable>

            <View style={styles.headerCenter} pointerEvents="box-none">
              {(() => {
                const titleText =
                  typeof title === "function" ? title(index) : title;
                const subtitleText =
                  typeof subtitle === "function" ? subtitle(index) : subtitle;
                return (
                  <>
                    {titleText ? (
                      <Text style={styles.viewerTitle} numberOfLines={2}>
                        {titleText}
                      </Text>
                    ) : null}
                    {subtitleText ? (
                      <Text style={styles.viewerSubtitle} numberOfLines={3}>
                        {subtitleText}
                      </Text>
                    ) : null}
                    {showCounter && images.length > 1 ? (
                      <Text style={styles.counter}>
                        {index + 1} / {images.length}
                      </Text>
                    ) : null}
                  </>
                );
              })()}
            </View>

            <View style={styles.headerSide} />
          </View>

          <View style={[styles.stage, { paddingBottom: spacing.sm }]}>
            {uri ? (
              <PinchGestureHandler
                ref={pinchRef}
                onGestureEvent={onPinchGestureEvent}
                onHandlerStateChange={onPinchHandlerStateChange}
                simultaneousHandlers={panRef}
              >
                <Animated.View style={styles.gestureWrap}>
                  <PanGestureHandler
                    ref={panRef}
                    minPointers={1}
                    maxPointers={1}
                    onGestureEvent={onPanGestureEvent}
                    onHandlerStateChange={onPanHandlerStateChange}
                    simultaneousHandlers={pinchRef}
                    avgTouches
                  >
                    <Animated.View
                      collapsable={false}
                      style={{
                        transform: [
                          { translateX },
                          { translateY },
                          { scale: scaleAnim },
                          ...(rotated ? [{ rotate: "-90deg" as const }] : []),
                        ],
                        width: imageBoxWidth,
                        height: imageBoxHeight,
                      }}
                    >
                      <View pointerEvents="none" style={styles.imageWrap}>
                        <Image
                          source={{ uri }}
                          style={styles.image}
                          resizeMode="contain"
                          fadeDuration={0}
                        />
                      </View>
                    </Animated.View>
                  </PanGestureHandler>
                </Animated.View>
              </PinchGestureHandler>
            ) : null}
          </View>

          {(() => {
            const captionText = typeof caption === "function" ? caption(index) : caption;
            if (!captionText) return null;
            return (
              <Text style={styles.modelCaption} numberOfLines={4}>
                {captionText}
              </Text>
            );
          })()}

          {showFooterNav ? (
            <View
              style={[
                styles.footer,
                { paddingBottom: insets.bottom + spacing.sm },
              ]}
              pointerEvents="box-none"
            >
              <ViewerActionButton
                label="BACK"
                disabled={!hasPrev}
                onPress={goPrev}
                icon="chevron-back"
              />
              {showSelect ? (
                <ViewerActionButton
                  label={submitLabel.toUpperCase()}
                  onPress={onSubmit!}
                  loading={submitLoading}
                  disabled={submitLoading}
                  icon="checkmark"
                />
              ) : (
                <View style={{ flex: 1 }} />
              )}
              <ViewerActionButton
                label="NEXT"
                disabled={!hasNext}
                onPress={goNext}
                icon="chevron-forward"
              />
            </View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#65568D" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xs,
  },
  headerSide: {
    width: 44,
    height: 44,
  },
  counter: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  viewerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xxs,
  },
  viewerSubtitle: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modelCaption: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  gestureWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  imageWrap: {
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  footer: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    minHeight: 52,
  },
  navBtnWrap: {
    borderRadius: radius.buttonPill,
    overflow: "hidden",
    elevation: 3,
    maxWidth: "34%",
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    minHeight: 44,
    paddingVertical: spacing.sm - 2,
    paddingHorizontal: spacing.sm,
  },
  navBtnDisabled: {
    opacity: 0.45,
  },
  navBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.xs,
    letterSpacing: 0.4,
  },
  navBtnTextDisabled: {
    color: "rgba(255,255,255,0.75)",
  },
});
