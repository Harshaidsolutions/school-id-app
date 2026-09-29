import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import api from "../api/client";
import type { NotificationsResponse } from "../types";
import { ANDROID_NOTIFICATION_CHANNEL_ID } from "../constants/pushNotifications";
import { notificationIsRead } from "./notificationReadState";

const MAX_DELIVERED_IDS = 300;

function deliveredIdsKey(userId: string): string {
  return `teacher_delivered_push_ids_${userId}`;
}

function lastLogoutKey(userId: string): string {
  return `teacher_last_logout_at_${userId}`;
}

async function readDeliveredIds(userId: string): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(deliveredIdsKey(userId));
  if (!raw) return new Set();
  try {
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

async function writeDeliveredIds(userId: string, ids: Set<string>): Promise<void> {
  const trimmed = [...ids].slice(-MAX_DELIVERED_IDS);
  await AsyncStorage.setItem(deliveredIdsKey(userId), JSON.stringify(trimmed));
}

/** Record logout time so login sync can find notifications sent while offline. */
export async function recordLogoutForPushSync(userId: string): Promise<void> {
  await AsyncStorage.setItem(lastLogoutKey(userId), new Date().toISOString());
}

/** Mark a notification ID as already shown via system push (FCM or local sync). */
export async function markPushNotificationDelivered(
  userId: string,
  notificationId: string
): Promise<void> {
  const id = notificationId.trim();
  if (!id) return;
  const delivered = await readDeliveredIds(userId);
  delivered.add(id);
  await writeDeliveredIds(userId, delivered);
}

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
  });
}

async function presentSystemNotification(options: {
  notificationId: string;
  title: string;
  body: string;
}): Promise<void> {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: `admin-notification-${options.notificationId}`,
    content: {
      title: options.title,
      body: options.body,
      data: { notificationId: options.notificationId },
      sound: "default",
      ...(Platform.OS === "android"
        ? {
            channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
            priority: Notifications.AndroidNotificationPriority.MAX,
          }
        : {}),
    },
    trigger: null,
  });
}

/**
 * After login, present Android system notifications for unread items that were
 * stored in the database while this user had no active SNS endpoint.
 */
export async function syncPendingNotificationsAfterLogin(
  userId: string
): Promise<void> {
  const { data } = await api.get<NotificationsResponse>("/teacher/notifications");
  const delivered = await readDeliveredIds(userId);
  const lastLogoutRaw = await AsyncStorage.getItem(lastLogoutKey(userId));
  const lastLogoutMs = lastLogoutRaw ? Date.parse(lastLogoutRaw) : NaN;
  const hasLogoutMarker = !Number.isNaN(lastLogoutMs);

  const pending = data.notifications.filter((item) => {
    if (notificationIsRead(item)) return false;
    if (delivered.has(item.id)) return false;
    const createdMs = Date.parse(item.created_at ?? "");
    if (hasLogoutMarker) {
      if (Number.isNaN(createdMs)) return false;
      if (createdMs <= lastLogoutMs) return false;
    }
    return true;
  });

  if (pending.length === 0) return;

  const ordered = [...pending].sort((a, b) => {
    const aMs = Date.parse(a.created_at ?? "") || 0;
    const bMs = Date.parse(b.created_at ?? "") || 0;
    return aMs - bMs;
  });

  for (const item of ordered.slice(-5)) {
    await presentSystemNotification({
      notificationId: item.id,
      title: item.title,
      body: item.message,
    });
    await markPushNotificationDelivered(userId, item.id);
  }
}
