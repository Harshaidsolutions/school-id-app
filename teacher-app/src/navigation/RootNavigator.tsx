import { useEffect, useMemo, useRef, useState } from "react";
import {
  DefaultTheme,
  DarkTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import type { RootStackParamList } from "./types";
import { LoginScreen } from "../screens/LoginScreen";
import { OnboardingScreen } from "../screens/OnboardingScreen";
import { InstructionsScreen } from "../screens/InstructionsScreen";
import { ReadInstructionsScreen } from "../screens/ReadInstructionsScreen";
import { DrawerMenuScreen } from "../screens/DrawerMenuScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { StudentListScreen } from "../screens/StudentListScreen";
import { StudentDetailScreen } from "../screens/StudentDetailScreen";
import { CameraScreen } from "../screens/CameraScreen";
import { PreviewScreen } from "../screens/PreviewScreen";
import { AddStudentScreen } from "../screens/AddStudentScreen";
import { AddDetailsScreen } from "../screens/AddDetailsScreen";
import { EditStudentScreen } from "../screens/EditStudentScreen";
import { OrganizationDetailsScreen } from "../screens/OrganizationDetailsScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { BrochureScreen } from "../screens/BrochureScreen";
import { MainTabs } from "./MainTabs";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { hydrateLastClassSection } from "./captureContext";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useOrgCapturePolicy } from "../hooks/useOrgCapturePolicy";
import {
  resolveAuthInitialRoute,
  type AuthInitialRoute,
} from "./authInitialRoute";

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, bootstrapping, instructionsDone, user } = useAuth();
  const { colors, isDark } = useTheme();
  const pushEnabled = isAuthenticated && instructionsDone;
  const navRef = useRef(navigationRef);
  const [authInitialRoute, setAuthInitialRoute] =
    useState<AuthInitialRoute>("Login");
  const [authRouteReady, setAuthRouteReady] = useState(false);
  useOrgCapturePolicy();
  usePushNotifications(
    pushEnabled,
    navRef.current,
    user?.id ?? null,
    isAuthenticated
  );

  const navTheme = useMemo(
    () => ({
      ...(isDark ? DarkTheme : DefaultTheme),
      colors: {
        ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
        primary: colors.royalGreen,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    }),
    [colors, isDark]
  );

  useEffect(() => {
    void hydrateLastClassSection();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setAuthRouteReady(true);
      return;
    }
    let cancelled = false;
    setAuthRouteReady(false);
    void resolveAuthInitialRoute().then((route) => {
      if (!cancelled) {
        setAuthInitialRoute(route);
        setAuthRouteReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (bootstrapping || (!isAuthenticated && !authRouteReady)) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.parrotGreen} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      {!isAuthenticated ? (
        <Stack.Navigator
          key={`auth-${authInitialRoute}`}
          initialRouteName={authInitialRoute}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      ) : !instructionsDone ? (
        <Stack.Navigator
          key="app-instructions"
          initialRouteName="Instructions"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Instructions" component={InstructionsScreen} />
          <Stack.Screen
            name="ReadInstructions"
            component={ReadInstructionsScreen}
          />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator
          key="app-main"
          initialRouteName="MainTabs"
          screenOptions={{
            headerTintColor: colors.royalGreen,
            headerTitleStyle: {
              fontFamily: fonts.bold,
              color: colors.text,
            },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen
            name="DrawerMenu"
            component={DrawerMenuScreen}
            options={{
              headerShown: false,
              presentation: "transparentModal",
              animation: "slide_from_left",
              contentStyle: { backgroundColor: "transparent" },
            }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MainTabs"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="StudentList"
            component={StudentListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="StudentDetail"
            component={StudentDetailScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Camera"
            component={CameraScreen}
            options={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.surfaceMuted },
            }}
          />
          <Stack.Screen
            name="Preview"
            component={PreviewScreen}
            options={{
              title: "Photo Captured",
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <Stack.Screen
            name="AddStudent"
            component={AddStudentScreen}
            options={{
              title: "Add Student",
              presentation: "modal",
              headerStyle: { backgroundColor: colors.surface },
              headerTintColor: colors.brandGreen,
              headerTitleStyle: {
                fontFamily: fonts.bold,
                color: colors.text,
              },
            }}
          />
          <Stack.Screen
            name="AddDetails"
            component={AddDetailsScreen}
            options={{
              headerShown: false,
              presentation: "modal",
            }}
          />
          <Stack.Screen
            name="EditStudent"
            component={EditStudentScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="OrganizationDetails"
            component={OrganizationDetailsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Brochure"
            component={BrochureScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
