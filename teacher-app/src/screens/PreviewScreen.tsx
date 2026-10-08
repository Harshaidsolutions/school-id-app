import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../components/Toast";
import { getErrorMessage } from "../api/client";
import { uploadStudentPhoto } from "../utils/uploadStudentPhoto";
import type { RootStackParamList } from "../navigation/types";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";
import { returnToClassList } from "../navigation/returnToClass";
import {
  pickStudentPhoto,
  pickStudentPhotoFromCamera,
  type PhotoSource,
} from "../utils/studentPhotoPicker";

type Props = NativeStackScreenProps<RootStackParamList, "Preview">;

export function PreviewScreen({ navigation, route }: Props) {
  const styles = usePreviewStyles();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const {
    student,
    photoOnly,
    fromModal,
    photoSource = "camera",
    returnToEdit,
    returnToFlow,
  } = route.params;
  const insets = useSafeAreaInsets();
  const [photoUri, setPhotoUri] = useState(route.params.photoUri);
  const [busy, setBusy] = useState(false);
  const [retaking, setRetaking] = useState(false);
  const confirmedRef = useRef(false);

  async function handleUsePhoto() {
    if (busy || confirmedRef.current) return;
    setBusy(true);
    confirmedRef.current = true;
    try {
      if (photoOnly) {
        const updated = await uploadStudentPhoto(student.id, photoUri);
        showToast(
          returnToEdit ? "Photo updated successfully." : "Submitted successfully."
        );

        if (returnToEdit) {
          navigation.navigate({
            name: "EditStudent",
            params: {
              student: updated,
              returnToFlow,
            },
          });
          return;
        }

        if (fromModal) {
          navigation.navigate({
            name: "StudentList",
            params: {
              classSection: student.class_section ?? "",
              patchStudent: updated,
            },
            merge: true,
          });
          navigation.goBack();
        } else {
          returnToClassList(navigation, student.class_section);
        }
        return;
      }
      navigation.navigate("AddDetails", { student, photoUri });
    } catch (err) {
      confirmedRef.current = false;
      showToast(getErrorMessage(err, "Failed to upload photo."));
      setBusy(false);
    }
  }

  async function handleRetake(source: PhotoSource = photoSource) {
    if (retaking || busy) return;
    setRetaking(true);
    try {
      const uri =
        photoOnly && source === "camera"
          ? await pickStudentPhotoFromCamera()
          : await pickStudentPhoto(source);
      if (uri) {
        confirmedRef.current = false;
        setPhotoUri(uri);
      }
    } catch {
      /* picker cancelled or permission denied */
    } finally {
      setRetaking(false);
    }
  }

  if (photoOnly) {
    return (
      <>
        <View style={[styles.confirmRoot, { backgroundColor: "#65568D" }]}>
          <Image source={{ uri: photoUri }} style={styles.fullPhoto} resizeMode="contain" />

          <View
            style={[
              styles.overlayActions,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <Pressable
              style={styles.actionBtn}
              onPress={() => void handleRetake()}
              disabled={busy || retaking}
            >
              <View style={[styles.actionCircle, { backgroundColor: colors.danger }]}>
                {retaking ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name="close" size={28} color="#FFFFFF" />
                )}
              </View>
            </Pressable>

            <Pressable
              style={styles.actionBtn}
              onPress={() => void handleUsePhoto()}
              disabled={busy || retaking}
            >
              <View style={[styles.actionCircle, { backgroundColor: colors.brandGreen }]}>
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark" size={28} color="#FFFFFF" />
                )}
              </View>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  return (
    <View style={[styles.confirmRoot, { backgroundColor: colors.background }]}>
      <Image source={{ uri: photoUri }} style={styles.fullPhoto} resizeMode="contain" />
      <View
        style={[
          styles.overlayActions,
          { paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <Pressable
          style={styles.actionBtn}
          onPress={() => void handleRetake("camera")}
          disabled={busy}
        >
          <View style={[styles.actionCircle, { backgroundColor: colors.primaryOrange }]}>
            <Ionicons name="close" size={32} color="#FFFFFF" />
          </View>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => void handleUsePhoto()}
          disabled={busy}
        >
          <View style={[styles.actionCircle, { backgroundColor: colors.brandGreen }]}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name="checkmark" size={32} color="#FFFFFF" />
            )}
          </View>
        </Pressable>
      </View>
    </View>
  );
}

function usePreviewStyles() {
  return useResponsiveStyles(({ scale }) => {
    const actionSize = scale(56);
    return {
      confirmRoot: {
        flex: 1,
      },
      fullPhoto: {
        ...StyleSheet.absoluteFillObject,
      },
      overlayActions: {
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        flexDirection: "row",
        justifyContent: "center",
        gap: scale(spacing.xxl + spacing.md),
        paddingTop: spacing.md,
        paddingHorizontal: scale(16),
      },
      actionBtn: { alignItems: "center" },
      actionCircle: {
        width: actionSize,
        height: actionSize,
        borderRadius: actionSize / 2,
        alignItems: "center",
        justifyContent: "center",
      },
    };
  });
}
