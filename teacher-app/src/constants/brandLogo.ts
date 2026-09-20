import { Image, type ImageSourcePropType } from "react-native";

export const BRAND_LOGO: ImageSourcePropType = require("../../assets/mascot-id-card.png");
export const APP_ICON: ImageSourcePropType = require("../../assets/app-icon.png");

/** Full-color logo — Login, Onboarding (light backgrounds). */
export const IN_APP_LOGO: ImageSourcePropType = require("../../assets/in-app-logo.png");

/** Header logo — white ID-card interior for orange headers (Home, Drawer). */
export const IN_APP_LOGO_HEADER: ImageSourcePropType = require("../../assets/in-app-logo-header.png");

/** White/contrast logo — legacy */
export const IN_APP_LOGO_LIGHT: ImageSourcePropType = require("../../assets/in-app-logo-light.png");

/** Splash — same artwork with light fringe removed for gradient backgrounds. */
export const IN_APP_LOGO_SPLASH: ImageSourcePropType = require("../../assets/in-app-logo-splash.png");

/** @deprecated Use IN_APP_LOGO — kept so existing imports keep the asset in the Metro bundle. */
export const APP_LOGO_TRANSPARENT: ImageSourcePropType = IN_APP_LOGO;

/** Pixel dimensions of in-app-logo.png (client artwork). */
export const APP_LOGO_WIDTH = 281;
export const APP_LOGO_HEIGHT = 355;

export const BRAND_LOGO_ASPECT = 642 / 543;

export function brandLogoSource(): ImageSourcePropType {
  const resolved = Image.resolveAssetSource(BRAND_LOGO);
  if (resolved?.uri) {
    return { uri: resolved.uri, width: resolved.width, height: resolved.height };
  }
  return BRAND_LOGO;
}
