import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../components/Pressable";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HomeScreen } from "../screens/HomeScreen";
import { TemplateScreen } from "../screens/TemplateScreen";
import { ModelsScreen } from "../screens/ModelsScreen";
import { IdCardsScreen } from "../screens/IdCardsScreen";
import type { MainTabParamList, RootStackParamList } from "./types";
import { spacing } from "../theme/colors";
import { textStyles } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { moderateScale, icons } from "../theme/responsive";

const Tab = createBottomTabNavigator<MainTabParamList>();

function CapturePlaceholder() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.surfaceMuted }} />;
}

const TAB_CONFIG: {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { name: "Home", icon: "home-outline", iconFocused: "home", label: "Home" },
  {
    name: "Template",
    icon: "grid-outline",
    iconFocused: "grid",
    label: "Templates",
  },
  { name: "Capture", icon: "add", iconFocused: "add", label: "" },
  {
    name: "Models",
    icon: "people-outline",
    iconFocused: "people",
    label: "Models",
  },
  {
    name: "IdCards",
    icon: "id-card-outline",
    iconFocused: "id-card",
    label: "ID Cards",
  },
];

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const rootNav =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { colors, fabGradient } = useTheme();
  const bottomPad = Math.max(insets.bottom, moderateScale(8));

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.tabBarBg,
          borderTopColor: colors.border,
          paddingBottom: bottomPad,
          minHeight: spacing.navHeight + bottomPad,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const config = TAB_CONFIG[index];
        const isCapture = route.name === "Capture";

        if (isCapture) {
          return (
            <Pressable
              key={route.key}
              style={styles.fabWrap}
              onPress={() => rootNav.navigate("OrganizationDetails")}
              accessibilityLabel="Add new"
            >
              <LinearGradient
                colors={[...fabGradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.fab}
              >
                <Ionicons name="add" size={icons.xxl} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
          );
        }

        const tint = isFocused ? colors.tabActive : colors.tabInactive;

        return (
          <Pressable
            key={route.key}
            onPress={() => navigation.navigate(route.name)}
            style={styles.item}
          >
            <Ionicons
              name={isFocused ? config.iconFocused : config.icon}
              size={icons.lg}
              color={tint}
            />
            <Text style={[styles.label, { color: tint }]}>{config.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function MainTabs() {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      initialRouteName={user?.role === "organization_staff" ? "IdCards" : "Home"}
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Template" component={TemplateScreen} />
      <Tab.Screen name="Capture" component={CapturePlaceholder} />
      <Tab.Screen name="Models" component={ModelsScreen} />
      <Tab.Screen name="IdCards" component={IdCardsScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    paddingTop: moderateScale(8),
    alignItems: "flex-end",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(4),
    paddingVertical: moderateScale(4),
  },
  label: {
    ...textStyles.nav,
  },
  fabWrap: {
    flex: 1,
    alignItems: "center",
    marginTop: -spacing.fabLift - moderateScale(20),
  },
  fab: {
    width: spacing.fabSize,
    height: spacing.fabSize,
    borderRadius: spacing.fabSize / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: "#F5811F",
    shadowOpacity: 0.4,
    shadowRadius: moderateScale(10),
    shadowOffset: { width: 0, height: moderateScale(4) },
  },
});
