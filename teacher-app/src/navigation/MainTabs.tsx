import { useReducedMotion } from "../hooks/useReducedMotion";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
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

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
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
          borderColor: colors.border,
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
                style={[styles.fab, { borderColor: colors.tabBarBg }]}
              >
                <Ionicons name="add" size={icons.xxl} color="#1E293B" />
              </LinearGradient>
            </Pressable>
          );
        }

        return (
          <TabItem
            key={route.key}
            focused={isFocused}
            icon={isFocused ? config.iconFocused : config.icon}
            label={config.label}
            onPress={() => navigation.navigate(route.name)}
          />
        );
      })}
    </View>
  );
}

function TabItem({ focused, icon, label, onPress }: { focused: boolean; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  const reducedMotion = useReducedMotion();
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reducedMotion) { anim.setValue(focused ? 1 : 0); return; }
    const a = Animated.spring(anim, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 8 });
    a.start();
    return () => a.stop();
  }, [anim, focused, reducedMotion]);
  const tint = focused ? colors.tabActive : colors.tabInactive;
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const lift = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label}>
      <Animated.View style={[styles.iconPill, { backgroundColor: focused ? colors.blueSoft : "transparent", transform: [{ translateY: lift }, { scale }] }]}>
        <Ionicons name={icon} size={icons.lg} color={tint} />
      </Animated.View>
      <Text style={[styles.label, { color: tint }, focused && styles.labelActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function MainTabs() {
  const reducedMotion = useReducedMotion();
  const { user } = useAuth();
  return (
    <Tab.Navigator
      initialRouteName={user?.role === "organization_staff" ? "IdCards" : "Home"}
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: reducedMotion ? "none" : "fade" }}
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
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 8,
    paddingTop: moderateScale(8),
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  item: {
    flex: 1,
    minHeight: 52,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: moderateScale(2),
    paddingVertical: moderateScale(2),
  },
  iconPill: {
    width: moderateScale(48),
    height: moderateScale(32),
    borderRadius: moderateScale(16),
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...textStyles.nav,
    textAlign: "center",
  },
  labelActive: {
    fontFamily: "Outfit_700Bold",
  },
  fabWrap: {
    flex: 1,
    alignItems: "center",
    marginTop: -spacing.fabLift - moderateScale(24),
  },
  fab: {
    width: spacing.fabSize + 6,
    height: spacing.fabSize + 6,
    borderRadius: (spacing.fabSize + 6) / 2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    elevation: 10,
    shadowColor: "#F59E0B",
    shadowOpacity: 0.4,
    shadowRadius: moderateScale(12),
    shadowOffset: { width: 0, height: moderateScale(6) },
  },
});
