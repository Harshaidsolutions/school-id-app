import type { RefObject } from "react";
import type { ScrollView } from "react-native";

let lastScrollTarget: number | null = null;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;

/** Scroll parent so a focused field sits above the keyboard (once per focus). */
export function scrollToFocusedInput(
  scrollRef: RefObject<ScrollView | null>,
  nativeTarget: number,
  extraOffset = 24
): void {
  const scroll = scrollRef.current;
  if (!scroll || !nativeTarget) return;
  if (lastScrollTarget === nativeTarget) return;
  lastScrollTarget = nativeTarget;
  if (scrollTimer) clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scroll.scrollResponderScrollNativeHandleToKeyboard(
      nativeTarget,
      extraOffset,
      true
    );
    scrollTimer = null;
  }, 100);
}

export function resetFocusedInputScrollLock(): void {
  lastScrollTarget = null;
}
