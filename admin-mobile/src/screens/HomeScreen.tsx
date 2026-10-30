import { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { DashboardSummary } from "../shared/types";
import { C, CONTENT_MAX, F, S, headerGradient, shadow } from "../theme";
import { Backdrop } from "../ui/Screen";
import { Avatar, Banner, Card, IconButton, Muted, Rise, Section, Stat, type IconName } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { academicYear, num, pct, waLink } from "../lib/format";
import { useNav } from "../navigation/hooks";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function HomeScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { user, isSuperAdmin } = useAuth();
  const year = academicYear();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [contacts, setContacts] = useState<Record<string, string | null> | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<DashboardSummary>("/admin/dashboard-summary", { params: { year: year.value } });
      setSummary(data);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to load dashboard."));
    }
    api
      .get<{ unreadCount?: number }>("/admin/notifications/unread-count")
      .then(({ data }) => setUnread(data.unreadCount ?? 0))
      .catch(() => undefined);
  }, [year.value]);

  useFocusEffect(
    useCallback(() => {
      void load();
      const t = setInterval(() => void load(), 30000);
      return () => clearInterval(t);
    }, [load])
  );

  useEffect(() => {
    if (isSuperAdmin) return;
    void api
      .get("/auth/support-contacts")
      .then(({ data }) => setContacts(data))
      .catch(() => undefined);
  }, [isSuperAdmin]);

  const s = summary;
  const schoolTotal = s?.schoolPhotos ?? s?.totalStudents ?? 0;
  const schoolCaptured = s?.schoolCaptured ?? s?.totalCaptured ?? 0;
  const schoolPending = s?.schoolPending ?? s?.totalUncaptured ?? 0;
  const instTotal = s?.institutePhotos ?? 0;
  const instCaptured = s?.instituteCaptured ?? 0;
  const instPending = s?.institutePending ?? 0;
  const captureRate = schoolTotal + instTotal > 0 ? (schoolCaptured + instCaptured) / (schoolTotal + instTotal) : 0;

  const quick: { label: string; icon: IconName; onPress: () => void; color: string }[] = [
    { label: "Schools", icon: "school", onPress: () => nav.navigate("Tabs", { screen: "Schools" } as never), color: C.primary },
    { label: "Institutes", icon: "business", onPress: () => nav.navigate("Tabs", { screen: "Institutes" } as never), color: C.accent },
    { label: "Templates", icon: "albums", onPress: () => nav.navigate("Templates"), color: C.purple },
    { label: "Notify", icon: "megaphone", onPress: () => nav.navigate("Notifications"), color: C.teal },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            colors={[C.primary]}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.hero, { paddingTop: insets.top + 14 }]}>
          <View style={st.bubbleA} />
          <View style={st.bubbleB} />
          <View style={st.max}>
            <View style={st.topRow}>
              <Tap onPress={() => nav.navigate("Profile")} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }} accessibilityLabel="Profile">
                <Avatar name={user?.displayName || user?.username || user?.email} uri={authedSource(user?.photoUrl)?.uri} headers={authedSource(user?.photoUrl)?.headers} size={50} />
                <View style={{ flex: 1 }}>
                  <Text style={st.hello}>{greeting()},</Text>
                  <Text style={st.name} numberOfLines={1}>
                    {user?.displayName || user?.username || "Admin"}
                  </Text>
                </View>
              </Tap>
              <IconButton icon="notifications-outline" label="Inbox" color={C.white} bg="rgba(255,255,255,0.22)" badge={unread} onPress={() => nav.navigate("Inbox")} />
            </View>
            <Rise delay={60}>
              <View style={[st.heroCard, shadow]}>
                <View style={{ flex: 1 }}>
                  <Text style={st.heroLabel}>Academic year {year.label}</Text>
                  <Text style={st.heroBig}>{num(schoolCaptured + instCaptured)}</Text>
                  <Muted>photos captured of {num(schoolTotal + instTotal)}</Muted>
                </View>
                <View style={st.ring}>
                  <Text style={st.ringText}>{Math.round(captureRate * 100)}%</Text>
                  <Text style={st.ringSub}>done</Text>
                </View>
              </View>
            </Rise>
            <View style={st.bar}>
              <View style={[st.barFill, { width: `${Math.min(100, captureRate * 100)}%` }]} />
            </View>
            <View style={st.roleRow}>
              <Ionicons name={isSuperAdmin ? "shield-checkmark" : "person"} size={14} color={C.white} />
              <Text style={st.role}>{isSuperAdmin ? "Super Admin" : "Admin"}</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={[st.max, { paddingHorizontal: S.lg }]}>
          <Banner text={error} />
          <Rise delay={120}>
            <View style={st.quick}>
              {quick.map((q) => (
                <Tap key={q.label} onPress={q.onPress} style={st.quickItem} accessibilityLabel={q.label}>
                  <View style={[st.quickIcon, { backgroundColor: q.color }]}>
                    <Ionicons name={q.icon} size={22} color={C.white} />
                  </View>
                  <Text style={st.quickText}>{q.label}</Text>
                </Tap>
              ))}
            </View>
          </Rise>

          <Section title="Schools">
            <View style={st.grid}>
              <Stat label="Total schools" value={num(s?.totalSchools)} icon="school-outline" tone="orange" onPress={() => nav.navigate("Tabs", { screen: "Schools" } as never)} />
              <Stat label="Total students" value={num(schoolTotal)} icon="people-outline" tone="blue" />
              <Stat label="Captured" value={num(schoolCaptured)} icon="camera-outline" tone="green" />
              <Stat label="Pending" value={num(schoolPending)} icon="time-outline" tone="amber" />
              <Stat label="Capture %" value={pct(schoolCaptured, schoolTotal)} icon="trending-up-outline" tone="teal" />
              <Stat label="Pending %" value={pct(schoolPending, schoolTotal)} icon="hourglass-outline" tone="red" />
            </View>
          </Section>

          <Section title="Institutes">
            <View style={st.grid}>
              <Stat label="Total institutes" value={num(s?.totalInstitutes)} icon="business-outline" tone="blue" onPress={() => nav.navigate("Tabs", { screen: "Institutes" } as never)} />
              <Stat label="Total members" value={num(instTotal)} icon="people-outline" tone="purple" />
              <Stat label="Captured" value={num(instCaptured)} icon="camera-outline" tone="green" />
              <Stat label="Pending" value={num(instPending)} icon="time-outline" tone="amber" />
              <Stat label="Capture %" value={pct(instCaptured, instTotal)} icon="trending-up-outline" tone="teal" />
              <Stat label="Pending %" value={pct(instPending, instTotal)} icon="hourglass-outline" tone="red" />
            </View>
          </Section>

          <Section title="Status">
            <View style={st.grid}>
              <Stat label="Active schools" value={num(s?.activeSchools)} icon="checkmark-circle-outline" tone="green" />
              <Stat label="Inactive schools" value={num(s?.inactiveSchools)} icon="pause-circle-outline" tone="grey" />
              <Stat label="Active institutes" value={num(s?.activeInstitutes)} icon="checkmark-circle-outline" tone="green" />
              <Stat label="Inactive institutes" value={num(s?.inactiveInstitutes)} icon="pause-circle-outline" tone="grey" />
            </View>
          </Section>

          {!isSuperAdmin && contacts ? (
            <Section title="Super Admin contact">
              <Card>
                {(["phone", "whatsapp", "facebook", "instagram", "youtube"] as const)
                  .filter((k) => contacts[k])
                  .map((k) => (
                    <Tap
                      key={k}
                      style={st.contact}
                      onPress={() =>
                        void Linking.openURL(
                          k === "phone" ? `tel:${contacts[k]}` : k === "whatsapp" ? waLink(contacts[k]) : String(contacts[k])
                        )
                      }
                    >
                      <Ionicons
                        name={k === "phone" ? "call" : k === "whatsapp" ? "logo-whatsapp" : k === "facebook" ? "logo-facebook" : k === "instagram" ? "logo-instagram" : "logo-youtube"}
                        size={20}
                        color={C.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={st.contactLabel}>{k[0].toUpperCase() + k.slice(1)}</Text>
                        <Muted numberOfLines={1}>{contacts[k]}</Muted>
                      </View>
                      <Ionicons name="open-outline" size={16} color={C.faint} />
                    </Tap>
                  ))}
              </Card>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  hero: { paddingHorizontal: S.lg, paddingBottom: S.xl, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, overflow: "hidden" },
  bubbleA: { position: "absolute", width: 240, height: 240, borderRadius: 120, backgroundColor: "rgba(255,255,255,0.12)", top: -80, right: -70 },
  bubbleB: { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.08)", bottom: -60, left: -20 },
  max: { width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: S.lg },
  hello: { fontFamily: F.bodyMed, fontSize: 13, color: "rgba(255,255,255,0.9)" },
  name: { fontFamily: F.h, fontSize: 21, color: C.white },
  heroCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.white, borderRadius: 22, padding: S.lg },
  heroLabel: { fontFamily: F.bodySemi, fontSize: 12, color: C.primaryDeep, textTransform: "uppercase", letterSpacing: 0.5 },
  heroBig: { fontFamily: F.hX, fontSize: 30, color: C.ink, marginTop: 2 },
  ring: { width: 78, height: 78, borderRadius: 39, borderWidth: 7, borderColor: C.primarySoft, borderTopColor: C.primary, borderRightColor: C.primary, alignItems: "center", justifyContent: "center" },
  ringText: { fontFamily: F.h, fontSize: 18, color: C.ink },
  ringSub: { fontFamily: F.body, fontSize: 10, color: C.muted, marginTop: -2 },
  bar: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)", marginTop: S.md, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: C.white, borderRadius: 3 },
  roleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: S.md },
  role: { fontFamily: F.bodySemi, fontSize: 12, color: C.white },
  quick: { flexDirection: "row", justifyContent: "space-between", marginTop: S.lg },
  quickItem: { alignItems: "center", width: "23%" },
  quickIcon: { width: 56, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", ...shadow },
  quickText: { fontFamily: F.bodySemi, fontSize: 12, color: C.text, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  contact: { flexDirection: "row", alignItems: "center", gap: S.md, paddingVertical: 10 },
  contactLabel: { fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
});
