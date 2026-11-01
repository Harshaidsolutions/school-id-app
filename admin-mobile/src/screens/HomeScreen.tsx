import { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { DashboardSummary } from "../shared/types";
import { C, CONTENT_MAX, F, R, S, headerGradient, softShadow } from "../theme";
import { Backdrop, RainbowBar } from "../ui/Screen";
import Svg, { Circle } from "react-native-svg";
import { Avatar, Banner, IconButton, Loading, Muted, Rise } from "../ui/kit";
import { Tap } from "../ui/Pressable";
import { academicYear, num, pct, waLink } from "../lib/format";
import { useNav } from "../navigation/hooks";

type PanelProps = {
  title: string;
  count: number;
  people: string;
  total: number;
  captured: number;
  pending: number;
  active: number;
  inactive: number;
  tone: "purple" | "sky";
  onPress: () => void;
};

/** Capture ring: how much of the total has a photo. */
function Ring({ captured, total, color, track }: { captured: number; total: number; color: string; track: string }) {
  const size = 104;
  const r = 44;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, captured / total) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 104 104" style={StyleSheet.absoluteFill}>
        <Circle cx={52} cy={52} r={r} stroke={track} strokeWidth={11} fill="none" />
        {share > 0 ? (
          <Circle
            cx={52}
            cy={52}
            r={r}
            stroke={color}
            strokeWidth={11}
            fill="none"
            strokeLinecap={share < 0.06 ? "butt" : "round"}
            strokeDasharray={`${Math.max(share * c, 2)} ${c}`}
            transform="rotate(-90 52 52)"
          />
        ) : null}
      </Svg>
      <Text style={st.ringValue}>{pct(captured, total)}</Text>
      <Text style={st.ringLabel}>captured</Text>
    </View>
  );
}

/** One overview panel per area (Schools / Institutes) — same design as the website dashboard. */
function OverviewPanel(p: PanelProps) {
  const color = p.tone === "purple" ? C.primary : C.accent;
  const soft = p.tone === "purple" ? C.primarySoft : C.accentSoft;
  const orgTotal = p.active + p.inactive;
  const activeShare = orgTotal > 0 ? (p.active / orgTotal) * 100 : 0;
  return (
    <View style={st.panel}>
      <LinearGradient colors={p.tone === "purple" ? ["#8E4FC4", "#6A2C9E"] : ["#5CC3F0", "#1EA0E1"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.panelTop} />
      <View style={st.panelHead}>
        <View style={{ flex: 1 }}>
          <View style={[st.eyebrow, { backgroundColor: soft }]}>
            <Text style={[st.eyebrowText, { color }]}>{p.title.toUpperCase()}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 6 }}>
            <Text style={st.count}>{num(p.count)}</Text>
            <Text style={st.countLabel}>Total {p.title}</Text>
          </View>
        </View>
        <Tap onPress={p.onPress} style={[st.viewAll, { backgroundColor: soft }]} accessibilityLabel={`View all ${p.title}`}>
          <Text style={[st.viewAllText, { color }]}>View all</Text>
          <Ionicons name="arrow-forward" size={14} color={color} />
        </Tap>
      </View>
      <View style={st.panelBody}>
        <Ring captured={p.captured} total={p.total} color={color} track={soft} />
        <View style={st.stats}>
          <View style={st.stat}>
            <Text style={st.statLabel}>Total {p.people}</Text>
            <Text style={st.statValue}>{num(p.total)}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>Captured</Text>
            <Text style={[st.statValue, { color: C.success }]}>{num(p.captured)}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>Uncaptured</Text>
            <Text style={[st.statValue, { color: C.danger }]}>{num(p.pending)}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>Uncapture %</Text>
            <Text style={st.statValue}>{pct(p.pending, p.total)}</Text>
          </View>
        </View>
      </View>
      <View style={st.panelFoot}>
        <View style={st.activeRow}>
          <Text style={st.activeText}>
            <Text style={{ color: C.success }}>● </Text>Active <Text style={st.activeNum}>{num(p.active)}</Text>
          </Text>
          <Text style={st.activeText}>
            <Text style={{ color: C.faint }}>● </Text>Inactive <Text style={st.activeNum}>{num(p.inactive)}</Text>
          </Text>
        </View>
        <View style={st.bar}>
          <LinearGradient colors={["#22C55E", "#16A34A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[st.barFill, { width: `${activeShare}%` }]} />
        </View>
      </View>
    </View>
  );
}

export function HomeScreen() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const { user, isSuperAdmin } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
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

  const name = user?.displayName || user?.username || "Admin";
  const photo = authedSource(user?.photoUrl);
  const contactRows = contacts
    ? (["phone", "whatsapp", "facebook", "instagram", "youtube"] as const).filter((k) => contacts[k])
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <LinearGradient colors={headerGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[st.header, { paddingTop: insets.top + 10 }]}>
        <View style={st.bubble} />
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
        <RainbowBar style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} />
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ padding: S.lg, paddingTop: S.md, paddingBottom: insets.bottom + 96 }}
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
              <View style={[st.panels, wide && { flexDirection: "row" }]}>
                <Rise delay={40} style={wide ? { flex: 1 } : undefined}>
                  <OverviewPanel
                    title="Schools"
                    tone="purple"
                    people="Students"
                    count={s?.totalSchools ?? 0}
                    total={schoolTotal}
                    captured={schoolCaptured}
                    pending={schoolPending}
                    active={s?.activeSchools ?? 0}
                    inactive={s?.inactiveSchools ?? 0}
                    onPress={goSchools}
                  />
                </Rise>
                <Rise delay={110} style={wide ? { flex: 1 } : undefined}>
                  <OverviewPanel
                    title="Institutes"
                    tone="sky"
                    people="Members"
                    count={s?.totalInstitutes ?? 0}
                    total={instTotal}
                    captured={instCaptured}
                    pending={instPending}
                    active={s?.activeInstitutes ?? 0}
                    inactive={s?.inactiveInstitutes ?? 0}
                    onPress={goInstitutes}
                  />
                </Rise>
              </View>
              <Muted style={{ textAlign: "center", marginTop: S.md, fontSize: 11 }}>Updates every 30 seconds · pull down to refresh</Muted>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  header: { paddingHorizontal: S.lg, paddingBottom: S.lg + 4, borderBottomLeftRadius: 22, borderBottomRightRadius: 22, overflow: "hidden" },
  bubble: { position: "absolute", width: 200, height: 200, borderRadius: 100, backgroundColor: "rgba(255,255,255,0.1)", top: -70, right: -50 },
  max: { width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  headRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  hi: { fontFamily: F.bodyMed, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  name: { fontFamily: F.h, fontSize: 18, color: C.white },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: S.md },
  title: { fontFamily: F.hX, fontSize: 26, color: C.white, letterSpacing: -0.5 },
  year: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  yearText: { fontFamily: F.hSemi, fontSize: 13, color: C.white },
  role: { fontFamily: F.bodySemi, fontSize: 12, color: "rgba(255,255,255,0.88)", marginTop: 0 },
  section: { fontFamily: F.h, fontSize: 15, color: C.ink, marginTop: S.md, marginBottom: S.sm },
  panels: { gap: S.md },
  panel: { backgroundColor: C.white, borderRadius: 22, borderWidth: 1, borderColor: C.line, padding: S.lg, paddingTop: S.lg + 2, overflow: "hidden", ...softShadow },
  panelTop: { position: "absolute", top: 0, left: 0, right: 0, height: 4 },
  panelHead: { flexDirection: "row", alignItems: "flex-start", gap: S.sm },
  eyebrow: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  eyebrowText: { fontFamily: F.h, fontSize: 10.5, letterSpacing: 1.6 },
  count: { fontFamily: F.hX, fontSize: 34, lineHeight: 40, color: C.ink, letterSpacing: -1 },
  countLabel: { fontFamily: F.bodyMed, fontSize: 13, color: C.muted, marginBottom: 7 },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  viewAllText: { fontFamily: F.hSemi, fontSize: 12.5 },
  panelBody: { flexDirection: "row", alignItems: "center", gap: S.md, marginTop: S.md },
  ringValue: { fontFamily: F.hX, fontSize: 19, color: C.ink, letterSpacing: -0.4 },
  ringLabel: { fontFamily: F.bodyMed, fontSize: 10.5, color: C.muted, marginTop: -2 },
  stats: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { flexBasis: "46%", flexGrow: 1, backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingVertical: 8, paddingHorizontal: 10 },
  statLabel: { fontFamily: F.bodyMed, fontSize: 11, color: C.muted },
  statValue: { fontFamily: F.h, fontSize: 17, color: C.ink, marginTop: 1 },
  panelFoot: { marginTop: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.line },
  activeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  activeText: { fontFamily: F.bodyMed, fontSize: 13, color: C.muted },
  activeNum: { fontFamily: F.h, color: C.ink },
  bar: { height: 8, borderRadius: 999, backgroundColor: C.primarySoft, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 999 },
  contactCard: { backgroundColor: C.white, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: "hidden" },
  contact: { flexDirection: "row", alignItems: "center", paddingHorizontal: S.lg, paddingVertical: 12 },
  contactLabel: { fontFamily: F.bodySemi, fontSize: 11, color: C.muted, textTransform: "uppercase" },
  contactValue: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink, marginTop: 2 },
});
