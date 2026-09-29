import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  APP_LOGO_HEIGHT,
  APP_LOGO_WIDTH,
  IN_APP_LOGO,
  IN_APP_LOGO_HEADER,
  IN_APP_LOGO_SPLASH,
} from "../constants/brandLogo";

type Props = {
  size: number;
  style?: StyleProp<ViewStyle>;
  /** Header variant = login artwork with white spark on orange bars. */
  variant?: "default" | "header" | "splash";
};

function logoSource(variant: "default" | "header" | "splash"): ImageSourcePropType {
  const bundled =
    variant === "header"
      ? IN_APP_LOGO_HEADER
      : variant === "splash"
        ? IN_APP_LOGO_SPLASH
        : IN_APP_LOGO;
  const resolved = Image.resolveAssetSource(bundled);
  return resolved ?? bundled;
}

/** v1.0.62 login artwork; header variant recolors spark to white only. */
export function AppIcon({ size, style, variant = "default" }: Props) {
  const width = Math.max(1, Math.round(size));
  const height = Math.max(
    1,
    Math.round(size * (APP_LOGO_HEIGHT / APP_LOGO_WIDTH))
  );
  const source = logoSource(variant);

  return (
    <View style={[styles.wrap, { width, height }, style]}>
      <Image
        source={source}
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
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
});
