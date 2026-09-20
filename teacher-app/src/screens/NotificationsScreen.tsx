import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "../components/Pressable";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import api, { getErrorMessage } from "../api/client";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import type { RootStackParamList } from "../navigation/types";
import type { NotificationItem, NotificationsResponse } from "../types";
import { radius, spacing } from "../theme/colors";
import { fonts, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import type { AppColors } from "../theme/palettes";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";

const HIDDEN_NOTIFS_KEY = "teacher_hidden_notifications";
const READ_NOTIFS_KEY = "teacher_notification_read_ids";

function normalizeNotification(
  item: NotificationItem,
  localRead: Set<string>
): NotificationItem {
  const raw = item as NotificationItem & {
    read?: boolean | number;
    isRead?: boolean | number;
    is_read?: boolean | number;
  };
  const fromApi = raw.is_read ?? raw.read ?? raw.isRead;
  const isRead =
    localRead.has(item.id) ||
    fromApi === true ||
    fromApi === 1;
  return { ...item, is_read: isRead };
}

type Props = NativeStackScreenProps<RootStackParamList, "Notifications">;

function notifIcons(colors: AppColors): Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string }
> {
  return {
    photo: { icon: "camera", color: colors.brandBlue },
    data: { icon: "checkmark-circle", color: colors.brandGreen },
    pending: { icon: "people", color: colors.brandOrange },
    update: { icon: "refresh", color: colors.brandBlue },
    card: { icon: "people", color: colors.brandNavy },
    backup: { icon: "cloud-upload", color: colors.brandGreen },
    reminder: { icon: "megaphone", color: colors.danger },
    welcome: { icon: "megaphone", color: colors.brandOrange },
    default: { icon: "notifications", color: colors.brandOrange },
  };
}

function getNotifIcon(title: string, colors: AppColors) {
  const icons = notifIcons(colors);
  const t = title.toLowerCase();
  if (t.includes("photo")) return icons.photo;
  if (t.includes("data") || t.includes("submitted")) return icons.data;
  if (t.includes("pending")) return icons.pending;
  if (t.includes("update")) return icons.update;
  if (t.includes("card") || t.includes("generated")) return icons.card;
  if (t.includes("backup")) return icons.backup;
  if (t.includes("reminder")) return icons.reminder;
  if (t.includes("welcome")) return icons.welcome;
  return icons.default;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationsScreen({ navigation, route }: Props) {
  const { colors, fabGradient } = useTheme();
  const { modalWidth } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<NotificationItem | null>(null);

  const syncLocalReadToServer = useCallback(
    async (notifications: NotificationItem[], localRead: string[]) => {
      const readSet = new Set(localRead);
      const pending = notifications.filter(
        (n) => readSet.has(n.id) && !n.is_read
      );
      if (pending.length === 0) return;
      await Promise.all(
        pending.map((n) =>
          api.post(`/teacher/notifications/${n.id}/read`).catch(() => undefined)
        )
      );
    },
    []
  );

  const migrateLegacyHiddenNotifications = useCallback(async () => {
    try {
      const hiddenRaw = await AsyncStorage.getItem(HIDDEN_NOTIFS_KEY);
      if (!hiddenRaw) return;
      let hidden: string[] = [];
      try {
        hidden = JSON.parse(hiddenRaw) as string[];
      } catch {
        hidden = [];
      }
      if (hidden.length === 0) {
        await AsyncStorage.removeItem(HIDDEN_NOTIFS_KEY);
        return;
      }
      await Promise.all(
        hidden.map((id) =>
          api
            .post(`/teacher/notifications/${id}/delete`)
            .catch(() => undefined)
        )
      );
      await AsyncStorage.removeItem(HIDDEN_NOTIFS_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      await migrateLegacyHiddenNotifications();
      const [{ data }, readRaw] = await Promise.all([
        api.get<NotificationsResponse>("/teacher/notifications"),
        AsyncStorage.getItem(READ_NOTIFS_KEY),
      ]);
      let localRead: string[] = [];
      try {
        localRead = readRaw ? (JSON.parse(readRaw) as string[]) : [];
      } catch {
        localRead = [];
      }
      await syncLocalReadToServer(data.notifications, localRead);
      const readSet = new Set(localRead);
      setItems(
        data.notifications.map((n) => {
          const norm = normalizeNotification(n, readSet);
          return readSet.has(n.id) || norm.is_read
            ? { ...norm, is_read: true }
            : norm;
        })
      );
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load notifications."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [migrateLegacyHiddenNotifications, syncLocalReadToServer]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function markRead(id: string) {
    const target = items.find((n) => n.id === id);
    if (!target || target.is_read) return;
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await api.post(`/teacher/notifications/${id}/read`);
      const raw = await AsyncStorage.getItem(READ_NOTIFS_KEY);
      const readIds: string[] = raw ? (JSON.parse(raw) as string[]) : [];
      if (!readIds.includes(id)) readIds.push(id);
      await AsyncStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(readIds));
    } catch {
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: false } : n))
      );
    }
  }

  useEffect(() => {
    const targetId = route.params?.notificationId?.trim();
    if (!targetId || items.length === 0) return;
    const match = items.find((n) => n.id === targetId);
    if (match) {
      setDetailItem(match);
      void markRead(targetId);
      navigation.setParams({ notificationId: undefined });
    }
  }, [route.params?.notificationId, items, navigation]);

  async function hideNotification(id: string) {
    const previous = items;
    const previousDetail = detailItem;
    setItems((prev) => prev.filter((n) => n.id !== id));
    if (detailItem?.id === id) setDetailItem(null);
    try {
      await api.post(`/teacher/notifications/${id}/delete`);
    } catch {
      setItems(previous);
      setDetailItem(previousDetail);
    }
  }

  function confirmDeleteOne(id: string) {
    Alert.alert(
      "Delete notification",
      "Are you sure you want to delete this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void hideNotification(id),
        },
      ]
    );
  }

  function confirmDeleteAll() {
    if (items.length === 0) return;
    Alert.alert(
      "Delete all notifications",
      "Are you sure you want to delete all notifications?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete all",
          style: "destructive",
          onPress: () => {
            const previous = items;
            const previousDetail = detailItem;
            setItems([]);
            setDetailItem(null);
            void (async () => {
              try {
                await api.post("/teacher/notifications/delete-all");
              } catch {
                setItems(previous);
                setDetailItem(previousDetail);
              }
            })();
          },
        },
      ]
    );
  }

  async function markAllRead() {
    if (items.length === 0) return;
    const allIds = items.map((n) => n.id);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setDetailItem((prev) => (prev ? { ...prev, is_read: true } : prev));
    try {
      const unread = items.filter((n) => !n.is_read);
      await Promise.all(
        unread.map((n) => api.post(`/teacher/notifications/${n.id}/read`))
      );
    } catch {
      /* keep optimistic read state */
    }
    await AsyncStorage.setItem(READ_NOTIFS_KEY, JSON.stringify(allIds));
  }

  function openNotification(item: NotificationItem) {
    setDetailItem({ ...item, is_read: true });
    if (!item.is_read) {
      void markRead(item.id);
    }
  }

  if (loading && items.length === 0)
    return <LoadingBlock label="Loading notifications…" />;
  if (error && items.length === 0)
    return <ErrorRetry message={error} onRetry={() => void load()} />;

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surfaceMuted }]}
    >
      <OrangeGradientHeader
        title="Notifications"
        onBack={() => navigation.goBack()}
        rightIcon="trash-outline"
        onRightPress={confirmDeleteAll}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.brandGreen}
          />
        }
        contentContainerStyle={[
          styles.list,
          items.length === 0 && styles.listEmpty,
          { paddingBottom: spacing.navHeight + spacing.xxl + insets.bottom },
        ]}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons
              name="notifications-off-outline"
              size={48}
              color={colors.textSubtle}
            />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              No notifications
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const unread = !item.is_read;
          const iconConfig = getNotifIcon(item.title, colors);
          return (
            <Pressable
              style={[
                styles.card,
                {
                  backgroundColor: unread ? colors.surface : colors.graySoft,
                  opacity: unread ? 1 : 0.92,
                },
              ]}
              onPress={() => openNotification(item)}
            >
              <View
                style={[
                  styles.iconBox,
                  {
                    backgroundColor: unread ? colors.graySoft : colors.borderLight,
                  },
                ]}
              >
                <Ionicons
                  name={iconConfig.icon}
                  size={20}
                  color={iconConfig.color}
                />
              </View>
              <View style={styles.content}>
                <View style={styles.titleRow}>
                  <Text
                    style={[
                      styles.title,
                      {
                        color: unread ? colors.text : colors.textMuted,
                        fontFamily: unread ? fonts.bold : fonts.semiBold,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={[styles.timestamp, { color: colors.textSubtle }]}
                  >
                    {formatTimestamp(item.created_at)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.message,
                    { color: unread ? colors.textMuted : colors.textSubtle },
                  ]}
                  numberOfLines={2}
                >
                  {item.message}
                </Text>
              </View>
              <Pressable
                onPress={() => confirmDeleteOne(item.id)}
                hitSlop={8}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
              {unread ? (
                <View
                  style={[
                    styles.unreadDot,
                    { backgroundColor: colors.brandOrange },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        }}
      />

      {items.length > 0 ? (
        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.surfaceMuted,
              paddingBottom: spacing.lg + insets.bottom,
            },
          ]}
        >
          <Pressable
            onPress={() => void markAllRead()}
            style={[styles.markAllWrap, { shadowColor: colors.brandGreen }]}
          >
            <LinearGradient
              colors={[...fabGradient]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.markAllBtn}
            >
              <Text style={styles.markAllText}>Mark all as read</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={Boolean(detailItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setDetailItem(null)}
          />
          <View
            style={[styles.modalCard, { backgroundColor: colors.surface, maxWidth: modalWidth }]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {detailItem?.title}
              </Text>
              <Pressable onPress={() => setDetailItem(null)} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={[styles.modalDate, { color: colors.textSubtle }]}>
              {formatTimestamp(detailItem?.created_at ?? null)}
            </Text>
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={styles.modalBodyContent}
              showsVerticalScrollIndicator
              nestedScrollEnabled
              bounces={false}
            >
              <Text style={[styles.modalBody, { color: colors.textBody }]}>
                {detailItem?.message}
              </Text>
            </ScrollView>
            <Pressable
              style={[styles.modalCloseBtn, { backgroundColor: colors.brandGreen }]}
              onPress={() => setDetailItem(null)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.md, gap: spacing.cardGap },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.cardGap,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  deleteBtn: { paddingTop: 2, paddingLeft: 2 },
  iconBox: {
    width: spacing.iconMd,
    height: spacing.iconMd,
    borderRadius: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  title: {
    flex: 1,
    fontSize: typeScale.rowTitle,
  },
  message: {
    marginTop: spacing.xxs / 2,
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.35,
  },
  timestamp: {
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
  },
  unreadDot: {
    width: spacing.xs,
    height: spacing.xs,
    borderRadius: spacing.xs / 2,
    marginTop: spacing.xs,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  markAllWrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    elevation: 4,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  markAllBtn: {
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
    justifyContent: "center",
  },
  markAllText: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    color: "#FFFFFF",
  },
  emptyWrap: { alignItems: "center", paddingHorizontal: spacing.xl + 4 },
  emptyTitle: {
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
    marginTop: spacing.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26,34,51,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modalCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    width: "100%",
    maxWidth: "100%",
    maxHeight: "72%",
    alignSelf: "center",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  modalTitle: {
    flex: 1,
    fontFamily: fonts.bold,
    fontSize: typeScale.lg,
  },
  modalDate: {
    marginTop: spacing.xxs,
    fontFamily: fonts.medium,
    fontSize: typeScale.subtitle,
  },
  modalBodyScroll: {
    marginTop: spacing.sm,
    flexGrow: 1,
    flexShrink: 1,
  },
  modalBodyContent: {
    paddingBottom: spacing.xxs,
  },
  modalBody: {
    fontFamily: fonts.regular,
    fontSize: typeScale.body,
    lineHeight: typeScale.body * 1.45,
  },
  modalCloseBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#FFFFFF",
    fontFamily: fonts.bold,
    fontSize: typeScale.sm,
  },
});
