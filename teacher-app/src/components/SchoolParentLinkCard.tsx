import { useCallback, useState } from "react";
import { Alert, AppState, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { Pressable } from "./Pressable";
import api from "../api/client";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../auth/AuthContext";

/** The authenticated school's existing parent form; never a link from another account. */
export function SchoolParentLinkCard() {
  const { user } = useAuth();
  const {colors}=useTheme();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLink(null);
      setCopied(false);
      let fetching = false;
      const refresh = async () => {
        if (fetching || AppState.currentState !== "active") return;
        fetching = true;
        try {
          const { data } = await api.get<{ link: string | null; enabled?:boolean }>(
            "/teacher/parent-link",
          );
          if (active) setLink(data.enabled===true?data.link:null);
        } catch {
          if (active) setLink(null);
        } finally { fetching = false; }
      };
      void refresh();
      const timer = setInterval(() => void refresh(), 2000);
      const subscription = AppState.addEventListener("change", state => { if (state === "active") void refresh(); });
      return () => {
        subscription.remove();
        active = false;
        clearInterval(timer);
      };
    }, [user?.id]),
  );
  if (!link) return null;
  return (
    <View style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.brandGreen}]}>
      <Text style={[styles.title,{color:colors.brandGreen}]}>Parent student form</Text>
      <Text style={[styles.description,{color:colors.textMuted}]}>
        Share this link with parents to add student details and a photo.
      </Text>
      <Text selectable numberOfLines={2} style={[styles.link,{color:colors.text}]}>
        {link}
      </Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          style={[styles.button,{backgroundColor:colors.primaryOrange}]}
          onPress={() => {
            void Clipboard.setStringAsync(link)
              .then(() => setCopied(true))
              .catch(() =>
                Alert.alert(
                  "Copy link",
                  "Please select and copy the link above.",
                ),
              );
          }}
        >
          <Text style={styles.buttonText}>
            {copied ? "Copied!" : "Copy link"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={[styles.button, styles.share,{backgroundColor:colors.brandGreen}]}
          onPress={() => {
            void Share.share({
              message: `Please fill in your child's school details and photo: ${link}`,
            }).catch(() =>
              Alert.alert(
                "Share link",
                "Please copy the link and share it with the parent.",
              ),
            );
          }}
        >
          <Text style={styles.buttonText}>Share</Text>
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: "#EFF6FF",
    borderColor: "#BFDBFE",
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
  },
  title: { color: "#3730A3", fontSize: 17, fontFamily: fonts.semiBold },
  description: {fontFamily:fonts.regular, color: "#475569", fontSize: 13, lineHeight: 19, marginTop: 5 },
  link: {fontFamily:fonts.regular, color: "#2563EB", fontSize: 13, lineHeight: 19, marginVertical: 12 },
  actions: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "#4F46E5",
    padding: 10,
  },
  share: { backgroundColor: "#15803D" },
  buttonText: { color: "#FFFFFF", fontSize: 14, fontFamily: fonts.semiBold },
});
