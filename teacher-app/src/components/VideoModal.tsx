import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView, type VideoPlayerStatus } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable } from "./AppPressable";

/**
 * Plays a model video inside the app (no external browser).
 * Defensive on purpose: a bad/unsupported URL shows an error card instead of
 * letting a native playback failure crash the app back to the home screen.
 */
export function VideoModal({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const valid = typeof uri === "string" && /^https?:\/\//i.test(uri.trim());
  const [status, setStatus] = useState<VideoPlayerStatus>("loading");
  const [failed, setFailed] = useState(!valid);

  // Only create a real player for a valid http(s) URL. Passing junk to
  // useVideoPlayer is what can take the whole app down natively.
  const player = useVideoPlayer(valid ? uri.trim() : null, (p) => {
    try {
      p.loop = false;
      p.play();
    } catch {
      /* ignore – surfaced via the status listener below */
    }
  });

  useEffect(() => {
    if (!valid) return;
    const sub = player.addListener("statusChange", (payload) => {
      setStatus(payload.status);
      if (payload.status === "error") setFailed(true);
    });
    return () => {
      try {
        sub.remove();
        player.pause();
      } catch {
        /* player already released */
      }
    };
  }, [player, valid]);

  const loading = valid && !failed && status === "loading";

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
          <>
            <VideoView
              player={player}
              style={styles.video}
              contentFit="contain"
              allowsFullscreen
              nativeControls
            />
            {loading ? (
              <View style={styles.loader} pointerEvents="none">
                <ActivityIndicator size="large" color="#FFFFFF" />
              </View>
            ) : null}
          </>
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
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  video: {
    width: "100%",
    height: 300,
    backgroundColor: "#000000",
  },
  loader: { position: "absolute", left: 0, right: 0, height: 300, alignItems: "center", justifyContent: "center" },
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
