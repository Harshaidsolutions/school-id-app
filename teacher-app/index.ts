import "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { Asset } from "expo-asset";

// Keep native splash visible until JS branded splash is ready.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Preload brand assets so first paint on Login / Onboarding / Home is not blank.
const brandLogoModule = require("./assets/mascot-id-card.png") as number;
const appIconModule = require("./assets/in-app-logo.png") as number;
void Asset.fromModule(brandLogoModule).downloadAsync().catch(() => {});
void Asset.fromModule(appIconModule).downloadAsync().catch(() => {});

import { registerRootComponent } from "expo";
import App from "./App";

registerRootComponent(App);
