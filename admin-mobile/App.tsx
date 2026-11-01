import { useEffect } from "react";
import { Text, TextInput, View } from "react-native";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { C } from "./src/theme";
import { AlertHost } from "./src/ui/AlertHost";

// Keep text readable but stop huge system font sizes from breaking layouts.
type WithDefaults = { defaultProps?: { maxFontSizeMultiplier?: number } };
(Text as unknown as WithDefaults).defaultProps = { ...(Text as unknown as WithDefaults).defaultProps, maxFontSizeMultiplier: 1.2 };
(TextInput as unknown as WithDefaults).defaultProps = { ...(TextInput as unknown as WithDefaults).defaultProps, maxFontSizeMultiplier: 1.2 };

function Gate() {
  const { ready } = useAuth();
  if (!ready) {
    return (
      // No second splash: a plain page while the saved login is read (a fraction of a second).
      <View style={{ flex: 1, backgroundColor: C.bg }} />
    );
  }
  return <RootNavigator />;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    // Same fonts as harshaidsolutions.in headings (Poppins) + clean body text (Inter), bundled locally.
    Poppins_500Medium: require("./assets/fonts/Poppins_500Medium.ttf"),
    Poppins_600SemiBold: require("./assets/fonts/Poppins_600SemiBold.ttf"),
    Poppins_700Bold: require("./assets/fonts/Poppins_700Bold.ttf"),
    Poppins_800ExtraBold: require("./assets/fonts/Poppins_800ExtraBold.ttf"),
    Inter_400Regular: require("./assets/fonts/Inter_400Regular.ttf"),
    Inter_500Medium: require("./assets/fonts/Inter_500Medium.ttf"),
    Inter_600SemiBold: require("./assets/fonts/Inter_600SemiBold.ttf"),
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
          <AlertHost />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
