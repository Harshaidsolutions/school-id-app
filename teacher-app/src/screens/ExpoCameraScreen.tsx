import { Pressable } from "../components/Pressable";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Ellipse } from "react-native-svg";
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
  type FlashMode,
} from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { colors, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { moderateScale } from "../theme/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

const OVAL_RED = "#C62828";
const OVAL_GREEN = "#2E7D32";

/**
 * Expo camera — chrome + gallery only; capture path unchanged.
 */
export function ExpoCameraScreen({ navigation, route }: Props) {
  const { student, photoOnly, fromModal, photoSource = "camera" } = route.params;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [flashMode, setFlashMode] = useState<FlashMode>("auto");
  const [torchOn, setTorchOn] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const isFocused = useIsFocused();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const ovalWidth = Math.min(screenW * 0.72, moderateScale(280));
  const ovalHeight = ovalWidth * 1.28;

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!isFocused) setCameraReady(false);
  }, [isFocused]);

  const flipCamera = useCallback(() => {
    setCameraReady(false);
    setTorchOn(false);
    setFacing((prev) => (prev === "back" ? "front" : "back"));
    setCameraEpoch((n) => n + 1);
  }, []);

  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => {
      if (prev === "off") {
        setTorchOn(false);
        return "auto";
      }
      if (prev === "auto") {
        setTorchOn(facing === "back");
        return "on";
      }
      setTorchOn(false);
      return "off";
    });
  }, [facing]);

  async function handleCapture() {
    if (capturing || !cameraRef.current) return;
    if (!permission?.granted) {
      void requestPermission();
      return;
    }

    setCapturing(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1,
        skipProcessing: false,
        shutterSound: true,
      });
      if (!photo?.uri) throw new Error("Empty photo uri");
      navigation.navigate("Preview", {
        student,
        photoUri: photo.uri,
        photoOnly,
        fromModal,
        photoSource,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      Alert.alert("Capture failed", detail);
    } finally {
      setCapturing(false);
    }
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>Camera access required</Text>
        <Pressable style={styles.permButton} onPress={() => void requestPermission()}>
          <Text style={styles.permButtonText}>Grant camera permission</Text>
        </Pressable>
      </View>
    );
  }

  const flashIcon =
    flashMode === "off"
      ? "flash-off-outline"
      : flashMode === "on"
        ? "flash"
        : "flash-outline";

  return (
    <View style={styles.container}>
      <CameraView
        key={`expo-cam-${facing}-${cameraEpoch}`}
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flashMode}
        enableTorch={torchOn && facing === "back"}
        mode="picture"
        mirror={facing === "front"}
        animateShutter
        active={isFocused}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(e) => {
          const msg = (e as { message?: string })?.message ?? "Camera failed";
          setError(msg);
          Alert.alert("Camera error", msg);
        }}
      />

      <View style={styles.ovalLayer} pointerEvents="none">
        <Svg width={screenW} height={screenH}>
          <Ellipse
            cx={screenW / 2}
            cy={screenH / 2}
            rx={ovalWidth / 2}
            ry={ovalHeight / 2}
            stroke={OVAL_RED}
            strokeWidth={3.5}
            fill="none"
          />
        </Svg>
      </View>

      <View
        style={[styles.topBar, { top: insets.top + spacing.sm }]}
        pointerEvents="box-none"
      >
        <Pressable
          style={styles.iconBtn}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </Pressable>
        <View style={styles.titleBlock}>
          <Text style={styles.titleName} numberOfLines={1}>
            {student.student_name}
          </Text>
          {student.roll_no ? (
            <Text style={styles.titleRoll}>Roll {student.roll_no}</Text>
          ) : null}
        </View>
        <Pressable
          style={[styles.iconBtn, flashMode !== "off" && styles.iconBtnActive]}
          onPress={toggleFlash}
          hitSlop={12}
          accessibilityLabel="Toggle flash"
        >
          <Ionicons name={flashIcon} size={22} color={colors.white} />
        </Pressable>
      </View>

      <View
        style={[
          styles.bottomBlock,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
        pointerEvents="box-none"
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.controls}>
          <View style={styles.sideBtn}>
            <View style={styles.sideSpacer} />
          </View>

          <Pressable
            style={[styles.shutter, capturing && styles.shutterDisabled]}
            onPress={() => void handleCapture()}
            disabled={capturing}
            accessibilityLabel="Capture"
          >
            <View style={[styles.shutterRing, { borderColor: OVAL_GREEN }]}>
              <View style={styles.shutterInner} />
            </View>
          </Pressable>

          <Pressable
            style={styles.sideBtn}
            onPress={flipCamera}
            accessibilityLabel="Flip camera"
          >
            <Ionicons name="camera-reverse-outline" size={24} color={colors.white} />
            <Text style={styles.sideLabel}>Flip</Text>
          </Pressable>
        </View>
        {!cameraReady ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <Text style={styles.hint}>Starting in-app camera…</Text>
          </View>
        ) : null}
        <Text style={styles.hint}>
          {cameraReady
            ? "Align face in the oval, then tap shutter"
            : " "}
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
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm - 2,
    zIndex: 20,
  },
  titleBlock: { flex: 1, alignItems: "center" },
  titleName: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    textShadowColor: "rgba(75,60,112,0.75)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  titleRoll: {
    marginTop: spacing.xxs / 2,
    color: "rgba(255,255,255,0.9)",
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
  },
  iconBtn: {
    backgroundColor: "rgba(0,92,85,0.72)",
    width: spacing.chipSize,
    height: spacing.chipSize,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  iconBtnActive: {
    borderColor: "#FFD54F",
    backgroundColor: "rgba(255,193,7,0.35)",
  },
  bottomBlock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingTop: spacing.sm,
    gap: spacing.sm - 2,
    zIndex: 20,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: spacing.xl + 4,
  },
  sideBtn: { alignItems: "center", gap: spacing.xxs, minWidth: spacing.avatarMd + 8 ,
      backgroundColor: "rgba(0,92,85,0.72)",
      borderRadius: 18
    },
  sideSpacer: { width: spacing.xl, height: spacing.xl },
  sideLabel: {
    color: colors.white,
    fontFamily: fonts.semiBold,
    fontSize: typeScale.subtitle,
  },
  shutter: {},
  shutterDisabled: { opacity: 0.55 },
  shutterRing: {
    width: moderateScale(78),
    height: moderateScale(78),
    borderRadius: moderateScale(39),
    borderWidth: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(75,60,112,0.35)",

      borderColor: "#6CF8BB"
    },
  shutterInner: {
    width: moderateScale(58),
    height: moderateScale(58),
    borderRadius: moderateScale(29),
    backgroundColor: "#FFFFFF",
  },
  hint: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: fonts.regular,
    fontSize: typeScale.subtitle,
    textAlign: "center",
    minHeight: spacing.md,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(75,60,112,0.35)",
  },
  error: {
    color: "#FFCDD2",
    fontFamily: fonts.medium,
    fontSize: typeScale.rowTitle,
    textAlign: "center",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    padding: spacing.xl,
    gap: spacing.cardGap,
  },
  muted: { color: colors.textMuted, fontFamily: fonts.regular },
  permTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    color: colors.text,
  },
  permButton: {
    backgroundColor: "#005C55",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 18,
  },
  permButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: typeScale.rowTitle,
  },
});
