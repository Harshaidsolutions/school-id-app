import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { ANDROID_NOTIFICATION_CHANNEL_ID } from "../constants/pushNotifications";
import { Platform } from "react-native";
import * as Device from "expo-device";
import api from "../api/client";
import { useEffect, useSyncExternalStore } from "react";

const KEY = "notification_alerts_enabled";
const TOKEN_KEY = "teacher_fcm_push_token";
let enabled: boolean | null = null;
let initializing: Promise<void> | null = null;
let operations: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((fn) => fn());
}
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = operations.then(work, work);
  operations = result.catch(() => undefined);
  return result;
}
export async function loadNotificationPreference(): Promise<void> {
  if (enabled !== null) return;
  if (!initializing)
    initializing = AsyncStorage.getItem(KEY)
      .then((value) => {
        enabled = value !== "off";
        emit();
      })
      .finally(() => {
        initializing = null;
      });
  await initializing;
}
export async function notificationAlertsEnabled(): Promise<boolean> {
  await loadNotificationPreference();
  return enabled === true;
}
export function useNotificationPreference() {
  const value = useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => enabled,
  );
  useEffect(() => {
    void loadNotificationPreference().catch(console.warn);
  }, []);
  return value;
}
/** Serialize registration with the switch, so an in-flight registration cannot undo Off. */
export function registerNotificationToken(
  pushToken: string,
  deviceId: string | null,
  deviceName: string | null,
): Promise<boolean> {
  return serial(async () => {
    if (!(await notificationAlertsEnabled())) return false;
    await api.post("/teacher/push-token", {
      pushToken,
      platform: Platform.OS,
      deviceId,
      deviceName,
    });
    await AsyncStorage.setItem(TOKEN_KEY, pushToken);
    return true;
  });
}
export function setNotificationPreference(next: boolean): Promise<void> {
  return serial(async () => {
    await loadNotificationPreference();
    if (next) {
      if (Platform.OS === "android")
        await Notifications.setNotificationChannelAsync(
          ANDROID_NOTIFICATION_CHANNEL_ID,
          {
            name: "School notifications",
            importance: Notifications.AndroidImportance.MAX,
            sound: "default",
          },
        );
      const permission = await Notifications.requestPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow notifications in your phone's app settings first.",
        );
      let token: string | undefined;
      try { token = (await Notifications.getDevicePushTokenAsync()).data?.trim(); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/firebase|default.*app|google.services/i.test(message)) throw new Error("This installed app is missing its notification setup. Please install an APK built with the correct Firebase google-services.json for com.schoolid.teacher.");
        throw new Error("Could not connect to phone notifications. Check your internet connection and try again.");
      }
      if (!token)
        throw new Error("Could not register this phone. Please try again.");
      const response = await api.post("/teacher/push-token", {
        pushToken: token,
        platform: Platform.OS,
        deviceId: Device.osInternalBuildId ?? Device.modelName,
        deviceName: Device.modelName,
      });
      if (response?.data?.snsRegistered === false)
        throw new Error(
          "This phone could not be connected to the notification service. Please ask your admin to check server push configuration.",
        );
      await AsyncStorage.setItem(TOKEN_KEY, token);
    } else {
      // A stored token also covers sessions where registration happened before this screen opened.
      const stored = await AsyncStorage.getItem(TOKEN_KEY);
      const token =
        stored ||
        (await Notifications.getDevicePushTokenAsync()
          .then((value) => value.data?.trim())
          .catch(() => null));
      if (token)
        await api.delete("/teacher/push-token", { data: { pushToken: token } });
    }
    await AsyncStorage.setItem(KEY, next ? "on" : "off");
    enabled = next;
    emit();
    if (!next) {
      await Notifications.cancelAllScheduledNotificationsAsync().catch(
        console.warn,
      );
      await Notifications.dismissAllNotificationsAsync().catch(console.warn);
      await Notifications.setBadgeCountAsync(0).catch(console.warn);
    }
  });
}
