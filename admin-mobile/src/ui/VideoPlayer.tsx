import { Modal, StatusBar, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { authedSource } from "../api/client";
import { F } from "../theme";
import { Tap } from "./Pressable";

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Plays a model video inside the app (no browser, no external link). */
export function VideoPlayer({ url, title, onClose }: { url: string | null; title?: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const src = authedSource(url);
  const html = src
    ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center}video{width:100%;max-height:100%;background:#000}</style></head><body><video src="${esc(src.uri)}" controls autoplay playsinline controlsList="nodownload"></video></body></html>`
    : "";
  return (
    <Modal visible={Boolean(src)} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={[st.wrap, { paddingTop: insets.top }]}>
        <View style={st.bar}>
          <Text style={st.title} numberOfLines={1}>
            {title ?? "Video"}
          </Text>
          <Tap onPress={onClose} hitSlop={12} accessibilityLabel="Close video" style={st.close}>
            <Ionicons name="close" size={24} color="#fff" />
          </Tap>
        </View>
        {src ? (
          <WebView
            style={{ flex: 1, backgroundColor: "#000" }}
            originWhitelist={["*"]}
            source={src.headers ? { uri: src.uri, headers: src.headers } : { html, baseUrl: src.uri }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            javaScriptEnabled
          />
        ) : null}
        <View style={{ height: insets.bottom, backgroundColor: "#000" }} />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#000" },
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
  title: { flex: 1, color: "#fff", fontFamily: F.hSemi, fontSize: 16 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
});
