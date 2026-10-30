import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Image } from "expo-image";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { C } from "./src/theme";

// Keep text readable but stop huge system font sizes from breaking layouts.
type WithDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };
(Text as unknown as WithDefaults).defaultProps = { ...(Text as unknown as WithDefaults).defaultProps, maxFontSizeMultiplier: 1.2 };
(TextInput as unknown as WithDefaults).defaultProps = { ...(TextInput as unknown as WithDefaults).defaultProps, maxFontSizeMultiplier: 1.2 };

function Gate() {
  const { ready } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
        <Image source={require("./assets/logo-mark.png")} style={{ width: 120, height: 120 }} contentFit="contain" />
      </View>
    );
  }
  return <RootNavigator />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const ready = fontsLoaded || Boolean(fontError);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
