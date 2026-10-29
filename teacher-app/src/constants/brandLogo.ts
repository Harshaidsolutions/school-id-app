import { Image, type ImageSourcePropType } from "react-native";

export const BRAND_LOGO: ImageSourcePropType = require("../../assets/brand-wordmark.png");
export const APP_ICON: ImageSourcePropType = require("../../assets/app-icon.png");

/** Full-color logo — Login, Onboarding (light backgrounds). */
export const IN_APP_LOGO: ImageSourcePropType = require("../../assets/brand-wordmark.png");

/** Header logo — white ID-card interior for orange headers (Home, Drawer). */
export const IN_APP_LOGO_HEADER: ImageSourcePropType = require("../../assets/brand-wordmark.png");

/** White/contrast logo — legacy */
export const IN_APP_LOGO_LIGHT: ImageSourcePropType = require("../../assets/brand-wordmark.png");

/** Splash — same artwork with light fringe removed for gradient backgrounds. */
export const IN_APP_LOGO_SPLASH: ImageSourcePropType = require("../../assets/brand-wordmark.png");

/** @deprecated Use IN_APP_LOGO — kept so existing imports keep the asset in the Metro bundle. */
export const APP_LOGO_TRANSPARENT: ImageSourcePropType = IN_APP_LOGO;

/** Pixel dimensions of brand-wordmark.png (transparent, trimmed). */
export const APP_LOGO_WIDTH = 1419;
export const APP_LOGO_HEIGHT = 276;

export const BRAND_LOGO_ASPECT = 276 / 1419;

export function brandLogoSource(): ImageSourcePropType {
  const resolved = Image.resolveAssetSource(BRAND_LOGO);
  if (resolved?.uri) {
    return { uri: resolved.uri, width: resolved.width, height: resolved.height };
  }
  return BRAND_LOGO;
}
