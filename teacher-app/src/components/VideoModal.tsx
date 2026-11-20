import { useEffect } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { AppPressable } from "./AppPressable";

/** Plays a model video inside the app (no external browser). */
export function VideoModal({
  uri,
  onClose,
}: {
  uri: string;
  onClose: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        /* player already released */
      }
    };
  }, [player]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          allowsFullscreen
          nativeControls
        />
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
