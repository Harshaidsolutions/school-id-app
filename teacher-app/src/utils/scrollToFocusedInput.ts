import type { RefObject } from "react";
import { Keyboard, Platform, type ScrollView } from "react-native";

let lastScrollTarget: number | null = null;
let scrollTimer: ReturnType<typeof setTimeout> | null = null;
let keyboardShowSub: { remove: () => void } | null = null;

function clearKeyboardShowSub(): void {
  keyboardShowSub?.remove();
  keyboardShowSub = null;
}

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
  clearKeyboardShowSub();

  const runScroll = (): void => {
    const active = scrollRef.current;
    if (!active || lastScrollTarget !== nativeTarget) return;
    active.scrollResponderScrollNativeHandleToKeyboard(
      nativeTarget,
      extraOffset,
      true
    );
  };

  if (Platform.OS === "android") {
    return;
  }

  scrollTimer = setTimeout(() => {
    runScroll();
    scrollTimer = null;
  }, 100);
}

export function resetFocusedInputScrollLock(): void {
  lastScrollTarget = null;
  if (scrollTimer) {
    clearTimeout(scrollTimer);
    scrollTimer = null;
  }
  clearKeyboardShowSub();
}
