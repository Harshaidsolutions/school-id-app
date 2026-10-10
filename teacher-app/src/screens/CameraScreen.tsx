import { Pressable } from "../components/Pressable";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RootStackParamList } from "../navigation/types";
import { radius, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { GradientButton } from "../components/GradientButton";
import { useTheme } from "../theme/ThemeContext";
import { moderateScale } from "../theme/responsive";

type Props = NativeStackScreenProps<RootStackParamList, "Camera">;

/**
 * Photo source chooser — Take with camera OR pick from gallery.
 * Both paths continue to Preview with the selected photoUri.
 */
export function CameraScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const { student, photoOnly, autoLaunch, fromModal } = route.params;
  const [busy, setBusy] = useState<"camera" | "gallery" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goToPreview = useCallback(
    (photoUri: string) => {
      navigation.navigate("Preview", {
        student,
        photoUri,
        photoOnly,
        fromModal,
      });
    },
    [navigation, photoOnly, student, fromModal]
  );

  const openSystemCamera = useCallback(async () => {
    setBusy("camera");
    setError(null);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError("Camera permission is required to take the student photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
        exif: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      goToPreview(result.assets[0].uri);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      Alert.alert("Camera error", detail);
    } finally {
      setBusy(null);
    }
  }, [goToPreview]);

  const openGallery = useCallback(async () => {
    setBusy("gallery");
    setError(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(
          "Photo library permission is required to pick a student photo."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
        exif: false,
        selectionLimit: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      goToPreview(result.assets[0].uri);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      Alert.alert("Gallery error", detail);
    } finally {
      setBusy(null);
    }
  }, [goToPreview]);

  useEffect(() => {
    if (autoLaunch === "camera") {
      void openSystemCamera();
    } else if (autoLaunch === "gallery") {
      void openGallery();
    }
    // Intentionally once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = busy !== null;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.surfaceMuted }]}
      edges={["top", "bottom"]}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable
          style={styles.back}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          disabled={isBusy}
        >
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>

        <View
          style={[styles.iconCircle, { backgroundColor: colors.greenSoft }]}
        >
          <Ionicons name="camera" size={moderateScale(72)} color={colors.brandGreen} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>
          Add Student Photo
        </Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Photo for{" "}
          <Text style={[styles.name, { color: colors.text }]}>
            {student.student_name}
          </Text>
          {student.roll_no ? ` · Roll ${student.roll_no}` : ""}
        </Text>
        <Text style={[styles.hint, { color: colors.textSubtle }]}>
          Take a new photo with the camera, or choose an existing photo from
          the gallery.
        </Text>

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        {isBusy ? (
          <ActivityIndicator
            size="large"
            color={colors.brandGreen}
            style={{ marginTop: 24 }}
          />
        ) : (
          <View style={styles.actions}>
            <GradientButton
              label="Take Photo"
              icon="camera"
              variant="orange"
              onPress={() => void openSystemCamera()}
              style={styles.btn}
            />
            <GradientButton
              label="Choose from Gallery"
              icon="images"
              variant="orangeOutline"
              onPress={() => void openGallery()}
              style={styles.btn}
            />
          </View>
        )}

        {busy === "camera" ? (
          <Text style={[styles.busyHint, { color: colors.textMuted }]}>
            Opening camera…
          </Text>
        ) : null}
        {busy === "gallery" ? (
          <Text style={[styles.busyHint, { color: colors.textMuted }]}>
            Opening gallery…
          </Text>
        ) : null}

        {student.photo_url ? (
          <View style={styles.existing}>
            <Text style={[styles.existingLabel, { color: colors.textBody }]}>
              Current photo
            </Text>
            <Image
              source={{ uri: student.photo_url }}
              style={[
                styles.thumb,
                { borderColor: colors.brandGreenLight },
              ]}
            />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.pagePad,
  },
  // Camera state information stays legible without changing capture behavior.
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D8EADB",
  },
  back: {
    alignSelf: "flex-start",
    marginBottom: spacing.xs,
  },
  iconCircle: {
    width: spacing.avatarMd - 8,
    height: spacing.avatarMd - 8,
    borderRadius: (spacing.avatarMd - 8) / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: typeScale.xl,
    textAlign: "center",
  },
  sub: {
    marginTop: spacing.sm - 2,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    textAlign: "center",
    lineHeight: typeScale.body * 1.4,
  },
  name: {
    fontFamily: fonts.headingSemiBold,
  },
  hint: {
    marginTop: spacing.sm + 2,
    fontFamily: fonts.body,
    fontSize: typeScale.subtitle,
    lineHeight: typeScale.subtitle * 1.45,
    textAlign: "center",
  },
  error: {
    marginTop: spacing.sm,
    fontFamily: fonts.body,
    fontSize: typeScale.body,
    textAlign: "center",
  },
  actions: {
    marginTop: spacing.xxl,
    width: "100%",
    gap: spacing.md,
  },
  btn: {
    width: "100%",
  },
  busyHint: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyMedium,
    fontSize: typeScale.subtitle,
  },
  existing: {
    marginTop: spacing.lg,
    alignItems: "center",
    gap: spacing.xs,
  },
  existingLabel: {
    ...textStyles.body,
  },
  thumb: {
    width: spacing.avatarMd + 8,
    height: spacing.avatarMd + 8,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
});
