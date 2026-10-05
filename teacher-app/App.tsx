import { useCallback, useEffect, useState } from "react";

import { useFonts } from "expo-font";

import {

  Poppins_500Medium,

  Poppins_600SemiBold,

  Poppins_700Bold,

  Poppins_800ExtraBold,

} from "@expo-google-fonts/poppins";

import {

  Inter_400Regular,

  Inter_500Medium,

  Inter_600SemiBold,

} from "@expo-google-fonts/inter";

import { Platform, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { StatusBar } from "expo-status-bar";

import * as SplashScreen from "expo-splash-screen";

import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./src/auth/AuthContext";

import { RootNavigator } from "./src/navigation/RootNavigator";

import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

import { LaunchSplashScreen } from "./src/screens/LaunchSplashScreen";

import { ToastProvider } from "./src/components/Toast";

import { IN_APP_LOGO } from "./src/constants/brandLogo";

import { MAX_FONT_MULT } from "./src/theme/responsive";



void IN_APP_LOGO;



type TextWithDefaults = typeof Text & {

  defaultProps?: {

    allowFontScaling?: boolean;

    maxFontSizeMultiplier?: number;

    style?: object;

  };

};



const AppText = Text as TextWithDefaults;



if (AppText.defaultProps == null) AppText.defaultProps = {};

AppText.defaultProps.allowFontScaling = true;

AppText.defaultProps.maxFontSizeMultiplier = MAX_FONT_MULT;

if (Platform.OS === "android") {

  AppText.defaultProps.style = { includeFontPadding: false };

}



const AppInput = TextInput as TextWithDefaults;

if (AppInput.defaultProps == null) AppInput.defaultProps = {};

AppInput.defaultProps.allowFontScaling = true;

AppInput.defaultProps.maxFontSizeMultiplier = MAX_FONT_MULT;



/** Branded Harsha ID Solutions intro — only splash users should see. */

const SPLASH_MS = 5000;



function AppShell({

  showBrandedSplash,

  onBrandedSplashReady,

  fontsReady,

}: {

  showBrandedSplash: boolean;

  onBrandedSplashReady: () => void;

  fontsReady: boolean;

}) {

  const { isDark, colors: themeColors } = useTheme();

  const inApp = !showBrandedSplash;



  return (

    <>

      <StatusBar style={inApp ? (isDark ? "light" : "dark") : "light"} />

      <View style={{ flex: 1, backgroundColor: showBrandedSplash ? "#FF8C1A" : themeColors.background }}>

        {showBrandedSplash ? (

          <LaunchSplashScreen

            onReady={onBrandedSplashReady}

            fontsReady={fontsReady}

          />

        ) : (

          <RootNavigator />

        )}

      </View>

    </>

  );

}



export default function App() {

  const [fontsLoaded, fontError] = useFonts({

    Poppins_500Medium,

    Poppins_600SemiBold,

    Poppins_700Bold,

    Poppins_800ExtraBold,

    Inter_400Regular,

    Inter_500Medium,

    Inter_600SemiBold,

  });

  const [splashTimedOut, setSplashTimedOut] = useState(false);

  const [nativeHidden, setNativeHidden] = useState(false);



  const showBrandedSplash = !splashTimedOut;



  const onBrandedSplashReady = useCallback(() => {

    if (nativeHidden) return;

    setNativeHidden(true);

    void SplashScreen.hideAsync().catch(() => {});

  }, [nativeHidden]);



  useEffect(() => {

    const t = setTimeout(() => setSplashTimedOut(true), SPLASH_MS);

    return () => clearTimeout(t);

  }, []);



  const fontsReady = Boolean(fontsLoaded || fontError);



  return (

    <GestureHandlerRootView style={{ flex: 1 }}>

    <SafeAreaProvider>

      <ThemeProvider>

        <AuthProvider>

          <ToastProvider>

            <AppShell

              showBrandedSplash={showBrandedSplash}

              onBrandedSplashReady={onBrandedSplashReady}

              fontsReady={fontsReady}

            />

          </ToastProvider>

        </AuthProvider>

      </ThemeProvider>

    </SafeAreaProvider>

    </GestureHandlerRootView>

  );

}


