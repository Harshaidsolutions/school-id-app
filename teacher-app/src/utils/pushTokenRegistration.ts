import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/client";

const PUSH_TOKEN_STORAGE_KEY = "teacher_fcm_push_token";

/** Unregister this device's push token from the backend (call before clearing auth). */
export async function unregisterStoredPushToken(): Promise<void> {
  const pushToken = (await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY))?.trim();
  if (!pushToken) return;
  try {
    await api.delete("/teacher/push-token", { data: { pushToken } });
  } catch (error) {
    console.warn("[push] logout unregister failed:", error);
  } finally {
    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  }
}
