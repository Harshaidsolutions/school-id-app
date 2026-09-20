import { Animated, StyleSheet, View, type Animated as AnimatedType } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { scale } from "../theme/responsive";

const TRACK_W = scale(64);
const SHINE_W = scale(18);

type Props = {
  scrollX: AnimatedType.Value;
  pageWidth: number;
  pageCount: number;
};

/** Short line with a shimmer segment that tracks horizontal swipe progress. */
export function OnboardingSwipeIndicator({
  scrollX,
  pageWidth,
  pageCount,
}: Props) {
  const maxOffset = Math.max(0, TRACK_W - SHINE_W);
  const maxScroll = pageWidth * Math.max(pageCount - 1, 1);

  const translateX = scrollX.interpolate({
    inputRange: [0, maxScroll],
    outputRange: [0, maxOffset],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.track}>
      <Animated.View style={[styles.shineWrap, { transform: [{ translateX }] }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0.35)", "#FFFFFF", "rgba(255,255,255,0.35)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shine}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
    alignSelf: "center",
  },
  shineWrap: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: SHINE_W,
  },
  shine: {
    flex: 1,
    borderRadius: 2,
  },
});
