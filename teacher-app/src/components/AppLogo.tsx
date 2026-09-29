import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import {
  BRAND_LOGO_ASPECT,
  brandLogoSource,
} from "../constants/brandLogo";

type Props = {
  /** Layout width in dp; height follows mascot aspect ratio. */
  size: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Canonical brand mascot — used on every screen that shows the app logo.
 * Uses resolveAssetSource so the image paints reliably in release APKs.
 */
export function AppLogo({ size, style }: Props) {
  const width = Math.max(1, Math.round(size));
  const height = Math.max(1, Math.round(width * BRAND_LOGO_ASPECT));

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      <Image
        source={brandLogoSource()}
        style={{ width, height }}
        resizeMode="contain"
        accessibilityLabel="Harsha ID Solutions logo"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
