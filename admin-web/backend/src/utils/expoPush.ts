/** Send push notifications via Expo Push API. */
export async function sendExpoPushNotifications(
  tokens: string[],
  options: { title: string; body: string; data?: Record<string, string> }
): Promise<void> {
  const unique = [...new Set(tokens.filter((t) => t.startsWith("ExponentPushToken")))];
  if (unique.length === 0) return;

  const messages = unique.map((to) => ({
    to,
    sound: "default" as const,
    title: options.title,
    body: options.body,
    data: options.data ?? {},
    priority: "high" as const,
    channelId: "default",
  }));

  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chunk),
      });
    } catch (error) {
      console.error("[expo-push] send failed:", error);
    }
  }
}
