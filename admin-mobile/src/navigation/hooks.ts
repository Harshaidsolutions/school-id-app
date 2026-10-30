import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStack } from "./types";

export function useNav() {
  return useNavigation<NativeStackNavigationProp<RootStack>>();
}
