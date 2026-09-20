import type { NotificationItem } from "../types";

/** Normalize read flag from API (boolean, 0/1, or string). */
export function notificationIsRead(item: NotificationItem): boolean {
  const raw = item as NotificationItem & {
    read?: boolean | number | string;
    isRead?: boolean | number | string;
    is_read?: boolean | number | string;
  };
  const v = raw.is_read ?? raw.read ?? raw.isRead;
  return v === true || v === 1 || v === "true" || v === "t";
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeNotificationBadgeRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitNotificationBadgeRefresh(): void {
  listeners.forEach((fn) => fn());
}
