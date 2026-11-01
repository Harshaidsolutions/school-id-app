import { useEffect, useState } from "react";
import { AppState, Image, Linking, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "./Pressable";
import api from "../api/client";
import { useTheme } from "../theme/ThemeContext";
import { fonts } from "../theme/typography";

type Media = { type: "photo" | "video"; url: string; caption: string };
type Content = { title: string; body: string; media: Media[] };

/** One instruction photo, shown whole (no cropping) at its real proportions. */
function InstructionPhoto({ m }: { m: Media }) {
  const { colors } = useTheme();
  const [ratio, setRatio] = useState(4 / 3);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Image.getSize(
      m.url,
      (w, h) => {
        if (w > 0 && h > 0) setRatio(w / h);
      },
      () => undefined
    );
  }, [m.url]);
  if (failed) {
    return (
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.dangerSoft }}>
        <Text style={{ color: colors.danger, fontFamily: fonts.bodyMedium }}>This photo could not be loaded.</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: m.url }}
      resizeMode="contain"
      onError={() => setFailed(true)}
      accessibilityLabel={m.caption || "Instruction photo"}
      style={{ width: "100%", aspectRatio: ratio, maxHeight: 520, backgroundColor: colors.background }}
    />
  );
}

/**
 * "School App Instructions" written by the admin on the Admin Website (title, text,
 * photos and videos). Shown only after login, in the Instructions section.
 */
export function ManagedInstructions() {
  const { colors } = useTheme();
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const load = () =>
      api
        .get("/app-instructions")
        .then((r) => {
          if (live) {
            setContent(r.data.content);
            setError("");
          }
        })
        .catch(() => {
          if (live) setError("Admin instructions could not be loaded. Please reopen this page when connected.");
        });
    void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  if (!content) return error ? <Text style={{ color: colors.textMuted, fontFamily: fonts.body, marginBottom: 12 }}>{error}</Text> : null;
  const media = Array.isArray(content.media) ? content.media : [];
  if (!content.body?.trim() && !media.length) return null;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        padding: 18,
        borderRadius: 20,
        gap: 14,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.blueSoft }}>
          <Ionicons name="book" size={18} color={colors.primaryOrange} />
        </View>
        <Text style={{ flex: 1, fontSize: 19, fontFamily: fonts.headingBold, color: colors.textPrimary }}>{content.title || "Instructions"}</Text>
      </View>
      {content.body?.trim() ? (
        <Text style={{ color: colors.textBody, lineHeight: 24, fontSize: 15, fontFamily: fonts.body }}>{content.body}</Text>
      ) : null}
      {media.map((m, i) => (
        <View key={`${m.url}-${i}`} style={{ gap: 8 }}>
          {m.type === "photo" ? (
            <InstructionPhoto m={m} />
          ) : (
            <Pressable
              style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.primaryOrange }}
              onPress={() => Linking.openURL(m.url).catch(() => setError("The video could not be opened."))}
              accessibilityRole="button"
              accessibilityLabel={`Watch video ${m.caption}`}
            >
              <Ionicons name="play-circle" size={24} color="#FFFFFF" />
              <Text style={{ color: "#FFFFFF", fontFamily: fonts.headingSemiBold, fontSize: 15 }}>Watch video</Text>
            </Pressable>
          )}
          {m.caption ? <Text style={{ color: colors.textSecondary, fontFamily: fonts.bodyMedium, fontSize: 13 }}>{m.caption}</Text> : null}
        </View>
      ))}
      {error ? <Text style={{ color: colors.danger, fontFamily: fonts.body }}>{error}</Text> : null}
    </View>
  );
}
