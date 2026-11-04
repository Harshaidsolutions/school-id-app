import { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

/**
 * The student's generated ID card (made in the admin's ID Card Generator), shown at its
 * real proportions instead of the plain photo.
 */
export function GeneratedIdCard({ uri, maxWidth, maxHeight }: { uri: string; maxWidth: number; maxHeight: number }) {
  const { colors } = useTheme();
  const [ratio, setRatio] = useState(54 / 85.6);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Image.getSize(
      uri,
      (w, h) => {
        if (live && w > 0 && h > 0) setRatio(w / h);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [uri]);
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  if (failed) return null;
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={{
          width,
          height,
          borderRadius: 8,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
          shadowColor: "#1B1F3B",
          shadowOpacity: 0.18,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 6,
        }}
      >
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" onError={() => setFailed(true)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
        <Ionicons name="card" size={14} color={colors.primaryOrange} />
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.textMuted }}>ID card generated</Text>
      </View>
    </View>
  );
}
