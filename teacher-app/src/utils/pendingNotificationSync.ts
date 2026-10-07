import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../api/client";
import type { NotificationsResponse } from "../types";

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

/** Refresh the durable inbox after login. Remote push owns system-tray presentation.
 * Re-scheduling these rows locally can repeat a push received while JS was stopped.
 * Missed/offline announcements remain available in the Notifications screen.
 */
export async function syncPendingNotificationsAfterLogin(_userId: string): Promise<void> {
  await api.get<NotificationsResponse>("/teacher/notifications");
}
