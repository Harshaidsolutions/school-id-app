import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView, type VideoPlayerStatus } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable } from "./AppPressable";

/**
 * Plays a model video inside the app as a full-screen overlay.
 *
 * Deliberately NOT a React Native <Modal>: expo-video's VideoView can crash the
 * app to the home screen when hosted inside a Modal on Android (New Arch),
 * especially with fullscreen enabled. An absolute overlay avoids that. A bad or
 * unsupported URL shows an error card instead of crashing.
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

  const player = useVideoPlayer(valid ? uri.trim() : null, (p) => {
    try {
      p.loop = false;
      p.play();
    } catch {
      /* surfaced via the status listener */
    }
  });

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

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
        /* already released */
      }
    };
  }, [player, valid]);

  const loading = valid && !failed && status === "loading";

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.backdrop} />
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.94)",
  },
  video: { width: "100%", height: 320, backgroundColor: "#000000" },
  loader: { position: "absolute", left: 0, right: 0, height: 320, alignItems: "center", justifyContent: "center" },
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
