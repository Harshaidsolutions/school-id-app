import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/client";
import type { RootStackParamList } from "../navigation/types";
import { ANDROID_NOTIFICATION_CHANNEL_ID } from "../constants/pushNotifications";
import {
  markPushNotificationDelivered,
  syncPendingNotificationsAfterLogin,
} from "../utils/pendingNotificationSync";

export { ANDROID_NOTIFICATION_CHANNEL_ID };

const PUSH_TOKEN_STORAGE_KEY = "teacher_fcm_push_token";
const PENDING_NOTIFICATION_ID_KEY = "teacher_pending_notification_id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: "School notifications",
    description: "Admin announcements and updates from My School ID Card",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF8C1A",
    enableVibrate: true,
    showBadge: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });
}

async function requestNotificationPermission(): Promise<boolean> {
  if (!Device.isDevice) return false;

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.status === "granted") {
    return true;
  }

  if (!current.canAskAgain) {
    return false;
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return requested.granted || requested.status === "granted";
}

async function readStoredPushToken(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  return raw?.trim() || null;
}

async function storePushToken(token: string): Promise<void> {
  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
}

async function clearStoredPushToken(): Promise<void> {
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}

async function getNativePushToken(): Promise<string | null> {
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    const value = token.data?.trim();
    return value || null;
  } catch (error) {
    console.warn("[push] native device token unavailable:", error);
    return null;
  }
}

async function registerPushTokenWithBackend(
  pushToken: string,
  deviceId: string | null,
  deviceName: string | null
): Promise<void> {
  await api.post("/teacher/push-token", {
    pushToken,
    platform: Platform.OS,
    deviceId,
    deviceName,
  });
}

async function unregisterPushTokenWithBackend(pushToken: string): Promise<void> {
  try {
    await api.delete("/teacher/push-token", { data: { pushToken } });
  } catch (error) {
    console.warn("[push] unregister failed:", error);
  }
}

function readNotificationId(
  source: Notifications.Notification | Notifications.NotificationResponse
): string | undefined {
  const notification =
    "notification" in source ? source.notification : source;
  const data = notification.request.content.data as
    | Record<string, unknown>
    | undefined;
  const raw = data?.notificationId ?? data?.notification_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

async function storePendingNotificationId(
  notificationId: string | undefined
): Promise<void> {
  if (!notificationId) return;
  await AsyncStorage.setItem(PENDING_NOTIFICATION_ID_KEY, notificationId);
}

async function consumePendingNotificationId(): Promise<string | undefined> {
  const pending = (await AsyncStorage.getItem(PENDING_NOTIFICATION_ID_KEY))?.trim();
  if (pending) {
    await AsyncStorage.removeItem(PENDING_NOTIFICATION_ID_KEY);
  }
  return pending || undefined;
}

function navigateToNotification(
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>,
  notificationId?: string
): void {
  if (!notificationId || !navigationRef.isReady()) return;
  navigationRef.navigate("Notifications", { notificationId });
}

export function usePushNotifications(
  enabled: boolean,
  navigationRef: NavigationContainerRefWithCurrent<RootStackParamList>,
  userId: string | null,
  syncPendingWhenAuthenticated = false
) {
  const registeredTokenRef = useRef<string | null>(null);
  const permissionDeniedRef = useRef(false);
  const syncedPendingRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || !response) return;
      void storePendingNotificationId(readNotificationId(response.notification));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void consumePendingNotificationId().then((notificationId) => {
      if (cancelled || !notificationId) return;
      navigateToNotification(navigationRef, notificationId);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, navigationRef]);

  useEffect(() => {
    if (!syncPendingWhenAuthenticated || !userId) {
      if (!syncPendingWhenAuthenticated) {
        syncedPendingRef.current = null;
        permissionDeniedRef.current = false;
      }
      return;
    }

    if (!Device.isDevice) {
      return;
    }

    const activeUserId = userId;
    let cancelled = false;

    async function syncPendingAfterAuth(): Promise<void> {
      await ensureAndroidChannel();
      if (permissionDeniedRef.current) {
        return;
      }
      const granted = await requestNotificationPermission();
      if (!granted || cancelled) {
        if (!granted) {
          permissionDeniedRef.current = true;
        }
        return;
      }
      if (syncedPendingRef.current === activeUserId) {
        return;
      }
      syncedPendingRef.current = activeUserId;
      try {
        await syncPendingNotificationsAfterLogin(activeUserId);
      } catch (error) {
        console.warn("[push] pending notification sync failed:", error);
        syncedPendingRef.current = null;
      }
    }

    void syncPendingAfterAuth();

    return () => {
      cancelled = true;
    };
  }, [syncPendingWhenAuthenticated, userId]);

  useEffect(() => {
    if (!enabled) {
      const token = registeredTokenRef.current;
      registeredTokenRef.current = null;
      if (token) {
        void unregisterPushTokenWithBackend(token).finally(() => {
          void clearStoredPushToken();
        });
      }
      return;
    }

    if (!Device.isDevice) {
      return;
    }

    let cancelled = false;
    let receivedSub: Notifications.Subscription | undefined;
    let responseSub: Notifications.Subscription | undefined;
    let tokenSub: Notifications.Subscription | undefined;

    async function setupPush(): Promise<void> {
      await ensureAndroidChannel();

      if (permissionDeniedRef.current) {
        return;
      }

      const granted = await requestNotificationPermission();
      if (!granted) {
        permissionDeniedRef.current = true;
        return;
      }

      const pushToken = await getNativePushToken();
      if (!pushToken || cancelled) return;

      const deviceId =
        Device.osInternalBuildId ??
        Device.modelId ??
        Device.modelName ??
        null;
      const deviceName = Device.modelName ?? null;

      if (registeredTokenRef.current !== pushToken) {
        await registerPushTokenWithBackend(pushToken, deviceId, deviceName);
        registeredTokenRef.current = pushToken;
        await storePushToken(pushToken);
      }

      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        const notificationId = readNotificationId(notification);
        if (notificationId && userId) {
          void markPushNotificationDelivered(userId, notificationId);
        }
      });

      responseSub = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const notificationId = readNotificationId(response.notification);
          if (notificationId && userId) {
            void markPushNotificationDelivered(userId, notificationId);
          }
          if (enabled) {
            navigateToNotification(navigationRef, notificationId);
          } else {
            void storePendingNotificationId(notificationId);
          }
        }
      );

      tokenSub = Notifications.addPushTokenListener(async (event) => {
        const nextToken = event.data?.trim();
        if (!nextToken || cancelled || nextToken === registeredTokenRef.current) {
          return;
        }
        await registerPushTokenWithBackend(nextToken, deviceId, deviceName);
        registeredTokenRef.current = nextToken;
        await storePushToken(nextToken);
      });

    }

    void setupPush();

    return () => {
      cancelled = true;
      receivedSub?.remove();
      responseSub?.remove();
      tokenSub?.remove();
    };
  }, [enabled, navigationRef, userId]);
}
