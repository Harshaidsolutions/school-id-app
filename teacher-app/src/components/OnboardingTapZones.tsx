import { Pressable } from "./Pressable";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scale } from "../theme/responsive";

type Props = {
  onBack: () => void;
  onNext: () => void;
  canGoBack?: boolean;
  /** Must match onboarding footer band ratio (default 0.34). */
  footerRatio?: number;
};

/** Instagram Stories-style tap: left = previous, right = next (excludes footer band). */
export function OnboardingTapZones({
  onBack,
  onNext,
  canGoBack = true,
  footerRatio = 0.34,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const footerH = Math.round(height * footerRatio);
  const top = insets.top + scale(52);
  const zoneH = height - footerH - top;
  const zoneW = width * 0.38;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {canGoBack ? (
        <Pressable
          style={[styles.zone, { top, left: 0, width: zoneW, height: zoneH }]}
          onPress={onBack}
          accessibilityLabel="Previous screen"
        />
      ) : null}
      <Pressable
        style={[styles.zone, { top, right: 0, width: zoneW, height: zoneH }]}
        onPress={onNext}
        accessibilityLabel="Next screen"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: "absolute",
    zIndex: 5,
  },
});
