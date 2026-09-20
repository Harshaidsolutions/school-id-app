import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { fonts, type as typeScale } from "../theme/typography";
import { spacing } from "../theme/colors";
import { useTheme } from "../theme/ThemeContext";

const OFFER =
  "Refer a New School & Get 10% OFF on Your Current Bill";
const SEP = "   •   ";

/**
 * Seamless full-bleed horizontal marquee — no side gaps or loop seam.
 */
export function OfferMarqueeBanner({
  backgroundColor,
  textColor,
}: {
  backgroundColor?: string;
  textColor?: string;
}) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const tx = useRef(new Animated.Value(0)).current;
  const [segW, setSegW] = useState(0);

  useEffect(() => {
    if (segW <= 0) return;
    tx.setValue(0);
    const duration = Math.max(8000, segW * 18);
    const loop = Animated.loop(
      Animated.timing(tx, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [tx, segW]);

  const translateX = tx.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -segW],
  });

  const color = textColor ?? colors.offerOrange;
  const bg = backgroundColor ?? colors.orangeSoft;
  const segment = (
    <Text style={[styles.text, { color }]} numberOfLines={1}>
      {OFFER}
      {SEP}
    </Text>
  );

  return (
    <View style={[styles.wrap, { backgroundColor: bg, width: screenW }]}>
      <Animated.View
        style={[
          styles.track,
          { width: segW > 0 ? segW * 3 : screenW * 3, transform: [{ translateX }] },
        ]}
      >
        <View
          style={styles.seg}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w > 0 && Math.abs(w - segW) > 1) setSegW(w);
          }}
        >
          {segment}
        </View>
        <View style={styles.seg}>{segment}</View>
        <View style={styles.seg}>{segment}</View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    paddingVertical: spacing.sm,
    alignSelf: "stretch",
  },
  track: {
    flexDirection: "row",
    flexWrap: "nowrap",
  },
  seg: {
    flexDirection: "row",
    flexShrink: 0,
  },
  text: {
    fontFamily: fonts.headingSemiBold,
    fontSize: typeScale.body,
    flexShrink: 0,
  },
});
