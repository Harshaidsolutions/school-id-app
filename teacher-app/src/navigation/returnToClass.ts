import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "./types";

/** After photo capture/save/cancel — never popToTop (that landed on Instructions). */
export function returnToClassList(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  classSection?: string | null
) {
  if (classSection) {
    navigation.reset({
      index: 1,
      routes: [
        { name: "MainTabs", params: { screen: "IdCards" } },
        { name: "StudentList", params: { classSection } },
      ],
    });
    return;
  }
  navigation.reset({
    index: 0,
    routes: [{ name: "MainTabs", params: { screen: "IdCards" } }],
  });
}
