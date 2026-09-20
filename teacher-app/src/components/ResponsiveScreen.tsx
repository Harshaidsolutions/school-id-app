import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  type Edge,
} from "react-native-safe-area-context";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: Edge[];
  scroll?: boolean;
  keyboardAvoid?: boolean;
  centerContent?: boolean;
  scrollProps?: Omit<ScrollViewProps, "contentContainerStyle" | "style" | "children">;
};

/**
 * Standard screen shell: safe areas, optional scroll + keyboard avoidance.
 */
export function ResponsiveScreen({
  children,
  style,
  contentStyle,
  edges = ["top", "bottom"],
  scroll = false,
  keyboardAvoid = false,
  centerContent = false,
  scrollProps,
}: Props) {
  const { pagePad } = useResponsiveLayout();

  const body = scroll ? (
    <ScrollView
      {...scrollProps}
      style={styles.flex}
      contentContainerStyle={[
        { paddingHorizontal: pagePad },
        centerContent && styles.scrollCenter,
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, { paddingHorizontal: pagePad }, contentStyle]}>{children}</View>
  );

  const wrapped = keyboardAvoid ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  ) : (
    body
  );

  return (
    <SafeAreaView style={[styles.flex, style]} edges={edges}>
      {wrapped}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scrollCenter: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
