import "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { registerRootComponent } from "expo";
import App from "./App";

void SplashScreen.preventAutoHideAsync().catch(() => {});
registerRootComponent(App);
