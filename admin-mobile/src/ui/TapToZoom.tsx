import { useState } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import { Tap } from "./Pressable";
import { ImageViewer } from "./Sheet";

type Source = { uri: string; headers?: Record<string, string> } | null;

/** A picture that opens full screen (pinch / double-tap zoom) when tapped. */
export function TapToZoom({ source, style, contentFit = "cover", title = "Image" }: { source: Source; style?: StyleProp<ViewStyle>; contentFit?: ImageContentFit; title?: string }) {
  const [open, setOpen] = useState(false);
  if (!source) return null;
  return (
    <>
      <Tap onPress={() => setOpen(true)} style={[{ overflow: "hidden" }, style]} accessibilityLabel={`Open ${title}`}>
        <Image source={source} style={StyleSheet.absoluteFill} contentFit={contentFit} transition={120} />
      </Tap>
      <ImageViewer visible={open} onClose={() => setOpen(false)} items={[{ title, source }]} index={0} onIndex={() => undefined} />
    </>
  );
}
