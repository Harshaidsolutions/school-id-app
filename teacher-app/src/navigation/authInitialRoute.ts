import AsyncStorage from "@react-native-async-storage/async-storage";
import { ONBOARDING_COMPLETE_KEY } from "../screens/OnboardingScreen";

export type AuthInitialRoute = "Onboarding" | "Login";

export async function resolveAuthInitialRoute(): Promise<AuthInitialRoute> {
  try {
    const done = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return done === "1" ? "Login" : "Onboarding";
  } catch {
    return "Onboarding";
  }
}
