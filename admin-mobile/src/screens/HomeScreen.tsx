import { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { DashboardSummary } from "../shared/types";
import { C, CONTENT_MAX, F, R, S, headerGradient, softShadow } from "../theme";
import { Backdrop } from "../ui/Screen";
import { Avatar, Banner, IconButton, Loading, Muted, Rise } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { academicYear, num, pct, waLink } from "../lib/format";
import { useNav } from "../navigation/hooks";

/** Same card colours as the website dashboard. */
const CARD_STYLES = [
  { bg: "#EEF0FF", icon: "#4F46E5" },
  { bg: "#EEF0FF", icon: "#0D9488" },
  { bg: "#FFF1F3", icon: "#F43F5E" },
  { bg: "#F4F3FF", icon: "#7C3AED" },
  { bg: "#F7F7FC", icon: "#4338CA" },
  { bg: "#FFF1F3", icon: "#F43F5E" },
];

function MetricCard({ label, value, index, onPress }: { label: string; value: string; index: number; onPress?: () => void }) {
  const style = CARD_STYLES[index % CARD_STYLES.length];
  const wide = index >= 4;
  return (
    <Tap onPress={onPress} disabled={!onPress} scaleTo={onPress ? 0.97 : 1} style={[st.metric, { backgroundColor: style.bg }, wide && st.metricWide]}>
      <View style={st.metricIcon}>
        <View style={[st.metricSquare, { borderColor: style.icon }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.metricLabel} numberOfLines={2}>
          {label}
        </Text>
        <Text style={st.metricValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {onPress ? <Text style={st.viewAll}>View all</Text> : null}
      </View>
    </Tap>
  );
}

function StatusPill({ label, value, active }: { label: string; value: number; active: boolean }) {
  return (
    <View style={[st.pill, { borderColor: active ? "#C7D2FE" : "#E6E4F5" }]}>
      <Text style={[st.pillValue, { color: active ? "#0D9488" : "#77759A" }]}>{num(value)}</Text>
      <Text style={[st.pillLabel, { color: active ? "#0D9488" : "#77759A" }]}>{label}</Text>
    </View>
  );
}

export function HomeScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { user, isSuperAdmin } = useAuth();
  const year = academicYear();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
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
    } finally {
      setLoading(false);
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
  const goSchools = () => nav.navigate("Tabs", { screen: "Schools" } as never);
  const goInstitutes = () => nav.navigate("Tabs", { screen: "Institutes" } as never);

  const schoolCards = [
    { label: "Total Schools", value: num(s?.totalSchools), onPress: goSchools },
    { label: "Total Students", value: num(schoolTotal) },
    { label: "Students Captured", value: num(schoolCaptured) },
    { label: "Students Uncaptured", value: num(schoolPending) },
    { label: "Capture Percentage", value: pct(schoolCaptured, schoolTotal) },
    { label: "Uncapture Percentage", value: pct(schoolPending, schoolTotal) },
  ];
  const instituteCards = [
    { label: "Total Institutes", value: num(s?.totalInstitutes), onPress: goInstitutes },
    { label: "Total Members", value: num(instTotal) },
    { label: "Members Captured", value: num(instCaptured) },
    { label: "Members Uncaptured", value: num(instPending) },
    { label: "Capture Percentage", value: pct(instCaptured, instTotal) },
    { label: "Uncapture Percentage", value: pct(instPending, instTotal) },
  ];
  const name = user?.displayName || user?.username || "Admin";
  const photo = authedSource(user?.photoUrl);
  const contactRows = contacts
    ? (["phone", "whatsapp", "facebook", "instagram", "youtube"] as const).filter((k) => contacts[k])
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.header, { paddingTop: insets.top + 10 }]}>
        <View style={st.max}>
          <View style={st.headRow}>
            <Tap onPress={() => nav.navigate("Profile")} style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Avatar name={name} uri={photo?.uri} headers={photo?.headers} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={st.hi}>Hi,</Text>
                <Text style={st.name} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            </Tap>
            <IconButton icon="notifications-outline" label="Notifications" color={C.white} bg="rgba(255,255,255,0.2)" badge={unread} onPress={() => nav.navigate("Inbox")} />
          </View>
          <View style={st.titleRow}>
            <Text style={st.title}>Dashboard</Text>
            <View style={st.year}>
              <Ionicons name="calendar-outline" size={14} color={C.white} />
              <Text style={st.yearText}>{year.label}</Text>
            </View>
          </View>
          <Text style={st.role}>{isSuperAdmin ? "Super Admin" : "Admin"}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 110 }}
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
        <View style={st.max}>
          <Banner text={error} />
          {!isSuperAdmin && contactRows.length ? (
            <Rise>
              <Text style={st.section}>Super Admin contact</Text>
              <View style={st.contactCard}>
                {contactRows.map((k, i) => (
                  <Tap
                    key={k}
                    style={[st.contact, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}
                    onPress={() => void Linking.openURL(k === "phone" ? `tel:${contacts![k]}` : k === "whatsapp" ? waLink(contacts![k]) : String(contacts![k]))}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={st.contactLabel}>{k === "whatsapp" ? "WhatsApp" : k === "youtube" ? "YouTube" : k[0].toUpperCase() + k.slice(1)}</Text>
                      <Text style={st.contactValue} numberOfLines={1}>
                        {contacts![k]}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color={C.faint} />
                  </Tap>
                ))}
              </View>
            </Rise>
          ) : null}

          {loading ? (
            <Loading text="Loading summary…" />
          ) : (
            <>
              <Rise delay={40}>
                <Text style={st.section}>Schools</Text>
                <View style={st.grid}>
                  {schoolCards.map((c, i) => (
                    <MetricCard key={c.label} index={i} {...c} />
                  ))}
                </View>
              </Rise>
              <Rise delay={100}>
                <Text style={st.section}>Institutes</Text>
                <View style={st.grid}>
                  {instituteCards.map((c, i) => (
                    <MetricCard key={c.label} index={i} {...c} />
                  ))}
                </View>
              </Rise>
              <Rise delay={160}>
                <View style={[st.grid, { marginTop: S.xl }]}>
                  <StatusPill label="Active Schools" value={s?.activeSchools ?? 0} active />
                  <StatusPill label="Inactive Schools" value={s?.inactiveSchools ?? 0} active={false} />
                  <StatusPill label="Active Institutes" value={s?.activeInstitutes ?? 0} active />
                  <StatusPill label="Inactive Institutes" value={s?.inactiveInstitutes ?? 0} active={false} />
                </View>
              </Rise>
              <Muted style={{ textAlign: "center", marginTop: S.lg, fontSize: 11 }}>Updates every 30 seconds · pull down to refresh</Muted>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.lg, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  max: { width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hi: { fontFamily: F.bodyMed, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  name: { fontFamily: F.h, fontSize: 18, color: C.white },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.lg },
  title: { fontFamily: F.hX, fontSize: 24, color: C.white },
  year: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  yearText: { fontFamily: F.bodySemi, fontSize: 13, color: C.white },
  role: { fontFamily: F.bodySemi, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  section: { fontFamily: F.h, fontSize: 17, color: C.ink, marginTop: S.lg, marginBottom: S.md },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  metric: { flexBasis: "47%", flexGrow: 1, flexDirection: "row", gap: 10, padding: S.md, borderRadius: R.lg, minHeight: 92, ...softShadow },
  metricWide: { flexBasis: "100%" },
  metricIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" },
  metricSquare: { width: 15, height: 15, borderRadius: 3, borderWidth: 1.8 },
  metricLabel: { fontFamily: F.bodyMed, fontSize: 12, color: C.muted },
  metricValue: { fontFamily: F.h, fontSize: 22, color: C.ink, marginTop: 2 },
  viewAll: { fontFamily: F.bodySemi, fontSize: 11, color: C.primary, marginTop: 4 },
  pill: { flexBasis: "47%", flexGrow: 1, alignItems: "center", paddingVertical: S.lg, borderRadius: R.lg, borderWidth: 1, backgroundColor: "#EEF0FF" },
  pillValue: { fontFamily: F.h, fontSize: 24 },
  pillLabel: { fontFamily: F.bodySemi, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  contactCard: { backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  contact: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.lg, paddingVertical: 12 },
  contactLabel: { fontFamily: F.bodySemi, fontSize: 11, color: C.muted, textTransform: "uppercase" },
  contactValue: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink, marginTop: 2 },
});
