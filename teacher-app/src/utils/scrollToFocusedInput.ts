import type { RefObject } from "react";
import type { ScrollView } from "react-native";

/** Scroll parent so a focused field sits above the keyboard. */
export function scrollToFocusedInput(
  scrollRef: RefObject<ScrollView | null>,
  nativeTarget: number,
  extraOffset = 24
): void {
  const scroll = scrollRef.current;
  if (!scroll || !nativeTarget) return;
  setTimeout(() => {
    scroll.scrollResponderScrollNativeHandleToKeyboard(
      nativeTarget,
      extraOffset,
      true
    );
  }, 80);
}
