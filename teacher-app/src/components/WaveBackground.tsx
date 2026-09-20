import { View, StyleSheet, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { wp, hp } from "../theme/responsive";

/** Decorative wave blobs matching Harsha reference screens. */
export function WaveBackground({ style }: { style?: ViewStyle }) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <LinearGradient
        colors={["#E8F5E9", "transparent"]}
        style={styles.topWave}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <LinearGradient
        colors={["transparent", colors.splashYellow, colors.splashOrange]}
        style={styles.bottomWave}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topWave: {
    position: "absolute",
    top: hp(-10),
    left: wp(-15),
    width: wp(72),
    height: hp(26),
    borderBottomRightRadius: wp(46),
    opacity: 0.95,
  },
  bottomWave: {
    position: "absolute",
    bottom: hp(-5),
    right: wp(-20),
    width: wp(87),
    height: hp(31),
    borderTopLeftRadius: wp(50),
    opacity: 0.85,
  },
});
