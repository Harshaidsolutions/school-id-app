import { useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable } from "./AppPressable";

/**
 * Plays a model video inside the app using a WebView HTML5 player.
 *
 * WebView is used instead of expo-video because expo-video's native VideoView
 * was crashing the app to the home screen on tap (Android, New Architecture).
 * A WebView with a plain <video> element is robust across devices and formats,
 * and a bad/unsupported URL shows a message instead of crashing.
 */
export function VideoModal({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const valid = typeof uri === "string" && /^https?:\/\//i.test(uri.trim());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(!valid);

  const safeUri = valid ? uri.trim().replace(/"/g, "&quot;") : "";
  const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}
.wrap{display:flex;align-items:center;justify-content:center;height:100%}
video{width:100%;height:100%;object-fit:contain;background:#000}</style>
</head><body><div class="wrap">
<video src="${safeUri}" controls autoplay playsinline webkit-playsinline preload="auto"></video>
</div></body></html>`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {failed ? (
          <View style={styles.message}>
            <Ionicons name="alert-circle-outline" size={40} color="#FFFFFF" />
            <Text style={styles.messageText}>
              This video couldn&apos;t be played. It may be missing or in an
              unsupported format.
            </Text>
          </View>
        ) : (
          <View style={styles.frame}>
            <WebView
              source={{ html }}
              style={styles.web}
              originWhitelist={["*"]}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              allowsFullscreenVideo
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => setLoading(false)}
              onError={() => {
                setFailed(true);
                setLoading(false);
              }}
            />
            {loading ? (
              <View style={styles.loader} pointerEvents="none">
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : null}
          </View>
        )}
        <AppPressable style={styles.close} onPress={onClose} accessibilityLabel="Close video">
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </AppPressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: { width: "100%", height: 320, backgroundColor: "#000000" },
  web: { flex: 1, backgroundColor: "#000000" },
  loader: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  message: { paddingHorizontal: 32, alignItems: "center", gap: 14 },
  messageText: { color: "#FFFFFF", fontSize: 15, lineHeight: 22, textAlign: "center" },
  close: {
    position: "absolute",
    top: 44,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
});
