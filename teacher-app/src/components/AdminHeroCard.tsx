import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { FloatingShapes } from "./FloatingShapes";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

type Props = {
  /** Admin who created this school / institute. */
  adminName: string;
  photoUrl?: string | null;
  loading?: boolean;
};

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "ID";
}

/** Home hero: stylish gradient card with the managing admin's name and logo/photo. */
export function AdminHeroCard({ adminName, photoUrl, loading }: Props) {
  const { headerGradient, colors } = useTheme();
  const { scale } = useResponsiveLayout();
  const avatar = scale(64);
  const isHarsha = /harsha\s*id/i.test(adminName);

  if (loading) {
    return <View style={[styles.card, { minHeight: scale(132), backgroundColor: colors.track }]} />;
  }

  return (
    <LinearGradient colors={[...headerGradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { padding: scale(18), borderRadius: scale(28) }]}>
      <FloatingShapes />
      <View style={styles.row}>
        <View style={[styles.avatar, { width: avatar, height: avatar, borderRadius: avatar / 2 }]}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={{ width: avatar - 8, height: avatar - 8, borderRadius: (avatar - 8) / 2 }} resizeMode="contain" accessibilityLabel={`${adminName} logo`} />
          ) : (
            <Text style={[styles.initials, { fontSize: scale(22) }]}>{initials(adminName)}</Text>
          )}
        </View>
        <View style={styles.textCol}>
          <View style={styles.chip}>
            <Ionicons name="shield-checkmark" size={scale(12)} color="#FFFFFF" />
            <Text style={[styles.chipText, { fontSize: scale(11) }]}>Your ID card partner</Text>
          </View>
          {/* Harsha ID Solutions stays on one line; any other admin name wraps when it is long. */}
          <Text
            style={[styles.name, { fontSize: scale(24), lineHeight: scale(30) }]}
            numberOfLines={isHarsha ? 1 : 3}
            adjustsFontSizeToFit={isHarsha}
            minimumFontScale={0.7}
          >
            {adminName}
          </Text>
          {isHarsha ? <Text style={[styles.harshaSub, { fontSize: scale(12.5), lineHeight: scale(16) }]}>A Complete ID World</Text> : null}
          <Text style={[styles.brand, { fontSize: scale(16), lineHeight: scale(21) }]}>My School ID Card</Text>
          <Text style={[styles.sub, { fontSize: scale(13.5), lineHeight: scale(18), marginTop: 0 }]}>Get Your Identity Here...</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 28,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.55)",
  },
  initials: { fontFamily: fonts.headingBold, color: "#1F2937", letterSpacing: 0.5 },
  textCol: { flex: 1, minWidth: 0 },
  harshaSub: { fontFamily: fonts.bodyMedium, color: "rgba(255,255,255,0.92)", letterSpacing: 0.4, marginTop: -2, marginBottom: 2 },
  brand: { fontFamily: fonts.headingBold, color: "#FFFFFF", marginTop: 4 },
  chip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 6,
  },
  chipText: { fontFamily: fonts.bodySemiBold, color: "#FFFFFF" },
  name: { fontFamily: fonts.headingBold, color: "#FFFFFF" },
  sub: { fontFamily: fonts.bodyMedium, color: "rgba(255,255,255,0.88)", marginTop: 4 },
});
