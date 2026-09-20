import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  type AppStateStatus,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Ellipse } from "react-native-svg";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LightSensor } from "expo-sensors";
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
  type TargetCameraPosition,
} from "react-native-vision-camera";
import {
  Camera,
  type Face,
} from "react-native-vision-camera-face-detector";
import type { RootStackParamList } from "../navigation/types";
import { isFaceAlignedInOval } from "../utils/faceAlignment";
import { colors, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { moderateScale } from "../theme/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

const OVAL_RED = "#C62828";
const OVAL_GREEN = "#2E7D32";
const LOW_LIGHT_LUX = 40;
const GREEN_STABLE_FRAMES = 3;

/**
 * VisionCamera + ML Kit face detection (custom development build only).
 *
 * Oval color is driven by onFacesDetected:
 * - RED: 0 faces, multiple faces, or 1 face not aligned in oval
 * - GREEN: 1 face stably aligned inside the oval
 */
export function VisionCameraScreen({ navigation, route }: Props) {
  const { student } = route.params;
  const isFocused = useIsFocused();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission, canRequestPermission, status } =
    useCameraPermission();

  const [facing, setFacing] = useState<TargetCameraPosition>("back");
  const [torchOn, setTorchOn] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active"
  );
  const [previewStarted, setPreviewStarted] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceOk, setFaceOk] = useState(false);
  const [faceCount, setFaceCount] = useState(0);
  const [lowLight, setLowLight] = useState(false);
  const [greenStreak, setGreenStreak] = useState(0);
  const [cameraKey, setCameraKey] = useState(0);

  const greenStreakRef = useRef(0);
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ quality: 1 });

  const ovalWidth = Math.min(screenW * 0.72, moderateScale(280));
  const ovalHeight = ovalWidth * 1.28;
  const oval = useMemo(
    () => ({
      centerX: screenW / 2,
      centerY: screenH / 2,
      width: ovalWidth,
      height: ovalHeight,
    }),
    [screenW, screenH, ovalWidth, ovalHeight]
  );

  const isActive = isFocused && appActive && hasPermission && !!device;
  const torchMode =
    (torchOn || lowLight) && facing === "back" && device?.hasTorch
      ? "on"
      : "off";

  useEffect(() => {
    if (!hasPermission && canRequestPermission) {
      void requestPermission().then((granted) => {
        console.log("[VisionCamera] permission", { granted, status });
      });
    }
  }, [hasPermission, canRequestPermission, requestPermission, status]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      setAppActive(next === "active");
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!isActive) return;
    let sub: { remove: () => void } | undefined;
    void (async () => {
      try {
        const available = await LightSensor.isAvailableAsync();
        if (!available) return;
        LightSensor.setUpdateInterval(800);
        sub = LightSensor.addListener(({ illuminance }) => {
          setLowLight(illuminance < LOW_LIGHT_LUX);
        });
      } catch {
        // ignore
      }
    })();
    return () => sub?.remove();
  }, [isActive]);

  useEffect(() => {
    greenStreakRef.current = 0;
    setGreenStreak(0);
    setFaceOk(false);
    setFaceCount(0);
    setPreviewStarted(false);
    setTorchOn(false);
  }, [facing, isFocused]);

  const onFacesDetected = useCallback(
    (faces: Face[]) => {
      const count = faces.length;
      setFaceCount(count);
      console.log("[VisionCamera] faces", count);

      if (count !== 1) {
        greenStreakRef.current = 0;
        setGreenStreak(0);
        setFaceOk(false);
        return;
      }

      const aligned = isFaceAlignedInOval(faces[0].bounds, oval);
      if (aligned) {
        const next = greenStreakRef.current + 1;
        greenStreakRef.current = next;
        setGreenStreak(next);
        setFaceOk(next >= GREEN_STABLE_FRAMES);
      } else {
        greenStreakRef.current = 0;
        setGreenStreak(0);
        setFaceOk(false);
      }
    },
    [oval]
  );

  const flipCamera = useCallback(() => {
    console.log("[VisionCamera] flip pressed, current=", facing);
    setFacing((prev) => (prev === "back" ? "front" : "back"));
    setCameraKey((k) => k + 1);
  }, [facing]);

  const toggleTorch = useCallback(() => {
    if (facing !== "back" || !device?.hasTorch) {
      Alert.alert("Torch unavailable", "Torch works on the back camera only.");
      return;
    }
    setTorchOn((v) => {
      console.log("[VisionCamera] torch →", !v);
      return !v;
    });
  }, [facing, device?.hasTorch]);

  async function handleCapture() {
    if (capturing) return;
    if (!faceOk) {
      Alert.alert(
        "Face not ready",
        faceCount === 0
          ? "No face detected — oval stays red until a face is in the oval."
          : faceCount > 1
            ? "Multiple faces detected — show one person only."
            : "Center and size the face in the oval until it turns green."
      );
      return;
    }
    if (!device) {
      Alert.alert("Capture failed", "No camera device available.");
      return;
    }

    setCapturing(true);
    setError(null);
    try {
      const flashMode =
        facing === "back" && device.hasFlash
          ? torchOn || lowLight
            ? "on"
            : "auto"
          : "off";

      const photo = await photoOutput.capturePhoto(
        { flashMode, enableShutterSound: true },
        {}
      );
      const path = await photo.saveToTemporaryFileAsync();
      photo.dispose();
      const photoUri = path.startsWith("file://") ? path : `file://${path}`;
      navigation.navigate("Preview", { student, photoUri });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      Alert.alert("Capture failed", detail);
    } finally {
      setCapturing(false);
    }
  }

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Camera access required</Text>
        <Text style={styles.permBody}>Status: {status}</Text>
        {canRequestPermission ? (
          <Pressable style={styles.permButton} onPress={() => void requestPermission()}>
            <Text style={styles.permButtonText}>Grant camera permission</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>No {facing} camera found</Text>
        <Pressable style={styles.permButton} onPress={flipCamera}>
          <Text style={styles.permButtonText}>Try flip</Text>
        </Pressable>
      </View>
    );
  }

  const ovalColor = faceOk ? OVAL_GREEN : OVAL_RED;

  return (
    <View style={styles.container}>
      {isFocused ? (
        <Camera
          key={`vc-${facing}-${cameraKey}`}
          style={styles.camera}
          device={device}
          isActive={isActive}
          outputs={[photoOutput]}
          enableLowLightBoost={device.supportsLowLightBoost}
          torchMode={torchMode}
          mirrorMode="auto"
          onPreviewStarted={() => setPreviewStarted(true)}
          onPreviewStopped={() => setPreviewStarted(false)}
          onError={(err) => {
            const msg = err instanceof Error ? err.message : "Camera error";
            setError(msg);
            Alert.alert("Camera error", msg);
          }}
          onFacesDetected={onFacesDetected}
          cameraFacing={facing}
          autoMode
          windowWidth={screenW}
          windowHeight={screenH}
          performanceMode="fast"
          trackingEnabled
          minFaceSize={0.12}
          outputResolution="preview"
        />
      ) : (
        <View style={styles.camera} />
      )}

      <View style={styles.ovalLayer} pointerEvents="none">
        <Svg width={screenW} height={screenH}>
          <Ellipse
            cx={screenW / 2}
            cy={screenH / 2}
            rx={ovalWidth / 2}
            ry={ovalHeight / 2}
            stroke={ovalColor}
            strokeWidth={3.5}
            fill="none"
          />
        </Svg>
      </View>

      <View
        style={[styles.topBar, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <View style={styles.facingBadge}>
          <Text style={styles.facingBadgeText}>
            {facing === "back" ? "Back" : "Front"}
            {faceOk ? " · Face OK" : " · No face"}
            {previewStarted ? " · Live" : ""}
          </Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.iconBtn} onPress={toggleTorch} hitSlop={12}>
            <Ionicons
              name={torchOn ? "flash" : "flash-off-outline"}
              size={22}
              color={colors.white}
            />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={flipCamera} hitSlop={12}>
            <Ionicons name="camera-reverse-outline" size={26} color={colors.white} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.bottomBlock,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        pointerEvents="box-none"
      >
        <Text style={styles.studentLabel} numberOfLines={1}>
          {student.student_name}
          {student.roll_no ? ` · Roll ${student.roll_no}` : ""}
        </Text>
        <Text style={styles.hint}>
          {faceOk
            ? "Face ready — tap Capture"
            : faceCount === 0
              ? "No face — oval is red"
              : faceCount > 1
                ? "Multiple faces — one person only"
                : "Align face in oval until green"}
          {Platform.OS === "android" && lowLight ? " · Low light" : ""}
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.shutter, (!faceOk || capturing) && styles.shutterDisabled]}
          onPress={() => void handleCapture()}
          disabled={capturing}
        >
          <View style={[styles.shutterRing, { borderColor: ovalColor }]}>
            <View style={styles.shutterInner} />
          </View>
        </Pressable>
        <Text style={styles.shutterLabel}>
          {capturing ? "Capturing…" : "Capture"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.cameraBg },
  camera: { flex: 1, width: "100%" },
  ovalLayer: { ...StyleSheet.absoluteFillObject },
  topBar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
  },
  facingBadge: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: spacing.md,
  },
  facingBadgeText: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.subtitle,
  },
  topActions: { flexDirection: "row", gap: spacing.sm - 2 },
  iconBtn: {
    backgroundColor: "rgba(0,0,0,0.55)",
    width: spacing.iconMd + 8,
    height: spacing.iconMd + 8,
    borderRadius: (spacing.iconMd + 8) / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  bottomBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: spacing.sm,
    gap: spacing.xs,
    zIndex: 20,
  },
  studentLabel: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.rowTitle,
    maxWidth: "85%",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  hint: {
    color: "rgba(255,255,255,0.95)",
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
    marginBottom: spacing.xs,
    textAlign: "center",
    paddingHorizontal: spacing.md,
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shutter: { marginTop: spacing.xxs },
  shutterDisabled: { opacity: 0.55 },
  shutterRing: {
    width: moderateScale(78),
    height: moderateScale(78),
    borderRadius: moderateScale(39),
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  shutterInner: {
    width: moderateScale(58),
    height: moderateScale(58),
    borderRadius: moderateScale(29),
    backgroundColor: colors.white,
  },
  shutterLabel: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.rowTitle,
  },
  error: {
    color: "#FFCDD2",
    fontFamily: fonts.medium,
    fontSize: typeScale.rowTitle,
    textAlign: "center",
    paddingHorizontal: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.xl,
    gap: spacing.cardGap,
  },
  permTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    color: colors.text,
    textAlign: "center",
  },
  permBody: {
    fontFamily: fonts.regular,
    fontSize: typeScale.rowTitle,
    color: colors.textMuted,
    textAlign: "center",
  },
  permButton: {
    backgroundColor: colors.primaryOrange,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: spacing.sm,
  },
  permButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typeScale.rowTitle,
  },
});
