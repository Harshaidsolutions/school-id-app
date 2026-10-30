import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { C, F } from "../theme";
import type { RootStack, Tabs } from "./types";
import { ForgotScreen, LoginScreen, ResetPasswordScreen, VerifyOtpScreen } from "../screens/AuthScreens";
import { HomeScreen } from "../screens/HomeScreen";
import { OrgListScreen } from "../screens/OrgListScreen";
import { RecordsScreen } from "../screens/RecordsScreen";
import { OrgDetailScreen } from "../screens/OrgDetailScreen";
import { OrgInfoScreen } from "../screens/OrgInfoScreen";
import { FormSetupScreen } from "../screens/FormSetupScreen";
import { TemplatesScreen } from "../screens/TemplatesScreen";
import { CatalogScreen } from "../screens/CatalogScreen";
import { NotificationsScreen } from "../screens/NotificationsScreen";
import { InboxScreen } from "../screens/InboxScreen";
import { AdminDetailScreen, AdminsScreen } from "../screens/AdminsScreen";
import { LicencesScreen } from "../screens/LicencesScreen";
import { HelpScreen } from "../screens/HelpScreen";
import { WebToolScreen } from "../screens/WebToolScreen";
import { MoreScreen, ProfileScreen } from "../screens/MoreScreens";

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator<Tabs>();

const SchoolsTab = () => <OrgListScreen kind="school" />;
const InstitutesTab = () => <OrgListScreen kind="institute" />;
const OrgsScreen = () => <OrgListScreen kind="organization" back />;
const NotifyTab = () => <NotificationsScreen inTab />;

const ICONS: Record<keyof Tabs, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  Home: ["grid", "grid-outline"],
  Schools: ["school", "school-outline"],
  Institutes: ["business", "business-outline"],
  Notify: ["notifications", "notifications-outline"],
  More: ["menu", "menu-outline"],
};

const TAB_LABELS: Record<keyof Tabs, string> = { Home: "Dashboard", Schools: "Schools", Institutes: "Institutes", Notify: "Notifications", More: "Menu" };

function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: C.primaryDeep,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: [st.bar, { height: 62 + insets.bottom, paddingBottom: insets.bottom + 6 }],
        tabBarLabel: ({ focused, color }) => (
          <Text style={[st.label, { color }, focused && { fontFamily: F.bodySemi }]} numberOfLines={1}>
            {TAB_LABELS[route.name]}
          </Text>
        ),
        tabBarIcon: ({ focused, color }) => (
          <View style={[st.icon, focused && st.iconOn]}>
            <Ionicons name={ICONS[route.name][focused ? 0 : 1]} size={21} color={focused ? C.primaryDeep : color} />
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Schools" component={SchoolsTab} />
      <Tab.Screen name="Institutes" component={InstitutesTab} />
      <Tab.Screen name="Notify" component={NotifyTab} />
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { token } = useAuth();
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.primary } }}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: Platform.OS === "android" ? "slide_from_right" : "default" }}>
        {!token ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Forgot" component={ForgotScreen} />
            <Stack.Screen name="VerifyOtp" component={VerifyOtpScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tabs" component={MainTabs} />
            <Stack.Screen name="Records" component={RecordsScreen} />
            <Stack.Screen name="OrgDetail" component={OrgDetailScreen} />
            <Stack.Screen name="OrgInfo" component={OrgInfoScreen} />
            <Stack.Screen name="FormSetup" component={FormSetupScreen} />
            <Stack.Screen name="Templates" component={TemplatesScreen} />
            <Stack.Screen name="Catalog" component={CatalogScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="Inbox" component={InboxScreen} />
            <Stack.Screen name="Admins" component={AdminsScreen} />
            <Stack.Screen name="AdminDetail" component={AdminDetailScreen} />
            <Stack.Screen name="Licences" component={LicencesScreen} />
            <Stack.Screen name="Help" component={HelpScreen} />
            <Stack.Screen name="WebTool" component={WebToolScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="Orgs" component={OrgsScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const st = StyleSheet.create({
  bar: { backgroundColor: "rgba(255,255,255,0.98)", borderTopWidth: 0, paddingTop: 6, elevation: 16, shadowColor: "#312E81", shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: -4 } },
  label: { fontFamily: F.bodyMed, fontSize: 11 },
  icon: { width: 46, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  iconOn: { backgroundColor: C.primarySoft },
});
