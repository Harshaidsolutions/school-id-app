import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { resetFocusedInputScrollLock } from "../utils/scrollToFocusedInput";

type Props = Omit<ScrollViewProps, "children"> & {
  children: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
  /** Extra bottom padding so lower fields stay scrollable above the Android keyboard. */
  keyboardFormPadding?: number;
};

/** Scroll container for Add/Edit student/member forms — keyboard-safe on iOS and Android. */
const DEFAULT_KEYBOARD_FORM_PADDING = 280;

function withKeyboardBottomPadding(
  contentContainerStyle: StyleProp<ViewStyle> | undefined,
  extra: number
): StyleProp<ViewStyle> {
  const flat = StyleSheet.flatten(contentContainerStyle) ?? {};
  const base =
    typeof flat.paddingBottom === "number" ? flat.paddingBottom : 0;
  return [contentContainerStyle, { paddingBottom: base + extra }];
}

export function KeyboardAwareFormScrollView({
  children,
  scrollRef: scrollRefProp,
  style,
  contentContainerStyle,
  keyboardFormPadding = DEFAULT_KEYBOARD_FORM_PADDING,
  ...scrollProps
}: Props) {
  const internalRef = useRef<ScrollView>(null);
  const scrollRef = scrollRefProp ?? internalRef;

  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidHide", resetFocusedInputScrollLock);
    return () => sub.remove();
  }, []);

  const scrollView = (
    <ScrollView
      ref={scrollRef}
      style={[styles.flex, style]}
      contentContainerStyle={withKeyboardBottomPadding(
        contentContainerStyle,
        keyboardFormPadding
      )}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator
      automaticallyAdjustKeyboardInsets
      nestedScrollEnabled={false}
      {...scrollProps}
    >
      {children}
    </ScrollView>
  );

  if (Platform.OS === "ios") {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {scrollView}
      </KeyboardAvoidingView>
    );
  }

  return scrollView;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
