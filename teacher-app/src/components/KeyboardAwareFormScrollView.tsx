import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
} from "react-native";
import { resetFocusedInputScrollLock } from "../utils/scrollToFocusedInput";

type Props = Omit<ScrollViewProps, "children"> & {
  children: ReactNode;
  scrollRef?: RefObject<ScrollView | null>;
};

/** Scroll container for Add/Edit student/member forms — keyboard-safe on iOS and Android. */
export function KeyboardAwareFormScrollView({
  children,
  scrollRef: scrollRefProp,
  style,
  contentContainerStyle,
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
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
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
