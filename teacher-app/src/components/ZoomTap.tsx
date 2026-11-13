import { useState, type ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable } from "./Pressable";
import { FullScreenImageViewer } from "./FullScreenImageViewer";
import { useTheme } from "../theme/ThemeContext";

/**
 * Wraps a picture so a tap opens it full screen with pinch / double-tap zoom.
 * `images` can hold several pictures (e.g. ID card and photo) to swipe between.
 */
export function ZoomTap({ images, title, style, children, startAt = 0 }: { images: (string | null | undefined)[]; title?: string; style?: StyleProp<ViewStyle>; children: ReactNode; startAt?: number }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const list = images.filter((u): u is string => Boolean(u && u.trim()));
  if (!list.length) return <>{children}</>;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={style} accessibilityLabel={title ? `Open ${title}` : "Open picture"}>
        {children}
      </Pressable>
      <FullScreenImageViewer
        visible={open}
        images={list}
        initialIndex={Math.min(startAt, list.length - 1)}
        onClose={() => setOpen(false)}
        colors={colors}
        title={title}
        showNavButtons={list.length > 1}
      />
    </>
  );
}
