import { View, type StyleProp, type ViewStyle } from "react-native";
import { RAINBOW } from "../theme/brandTheme";

/** Thin six-colour strip from the Harsha ID Solutions logo (same as the website top bar). */
export function RainbowBar({ height = 4, style, rounded }: { height?: number; style?: StyleProp<ViewStyle>; rounded?: boolean }) {
  return (
    <View pointerEvents="none" style={[{ flexDirection: "row", height, alignSelf: "stretch" }, rounded && { borderRadius: height / 2, overflow: "hidden" }, style]}>
      {RAINBOW.map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}
