import { View, type StyleProp, type ViewStyle } from "react-native";
import { RAINBOW } from "../theme/brandTheme";

/** Thin six-colour strip from the Harsha ID Solutions logo (same as the website top bar). */
export function RainbowBar({ height = 4, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[{ flexDirection: "row", height, width: "100%" }, style]}>
      {RAINBOW.map((c) => (
        <View key={c} style={{ flex: 1, backgroundColor: c }} />
      ))}
    </View>
  );
}
