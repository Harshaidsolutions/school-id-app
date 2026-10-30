import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, F, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Check, Empty, IconButton, Loading, Muted, Rise } from "../ui/kit";
import { OtpSheet } from "../ui/Sheet";
import { fmtDateTime } from "../lib/format";

type Notice = { id: string; title: string; message: string; created_at?: string | null; audience?: string | null; read?: boolean; image_url?: string | null };

/** Split "Label:\nvalue" style messages (registrations etc.) into rows. */
function details(message: string) {
  const rows: { label: string; value: string }[] = [];
  let label: string | null = null;
  for (const line of message.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.endsWith(":") && t.length < 40) {
      label = t.slice(0, -1);
      continue;
    }
    const m = /^([^:]{2,30}):\s+(.+)$/.exec(t);
    if (m) rows.push({ label: m[1], value: m[2] });
    else if (label) {
      rows.push({ label, value: t });
      label = null;
    } else rows.push({ label: "", value: t });
  }
  return rows;
}

export function InboxScreen() {
  const { isSuperAdmin } = useAuth();
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otp, setOtp] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isSuperAdmin) {
        const { data } = await api.get<{ notifications?: Notice[] }>("/admin/notifications");
        setItems((data.notifications ?? []).filter((n) => n.audience === "super_admin"));
      } else {
        const { data } = await api.get<{ notifications?: Notice[] }>("/admin/notifications/inbox");
        setItems(data.notifications ?? []);
      }
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Could not load messages."));
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);
  useEffect(() => {
    void load();
  }, [load]);

  function open(n: Notice) {
    setOpenId((cur) => (cur === n.id ? null : n.id));
    if (!n.read) {
      void api
        .post("/admin/notifications/incoming/mark-read", { ids: [n.id] })
        .then(() => setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x))))
        .catch(() => undefined);
    }
  }

  return (
    <Screen
      title="Inbox"
      subtitle={isSuperAdmin ? "Registrations and requests" : "Messages from Harsha ID Solutions"}
      onRefresh={() => void load()}
      refreshing={false}
      right={
        isSuperAdmin && items.length ? (
          <IconButton icon={selecting ? "close" : "checkbox-outline"} label="Select" color={C.white} bg="rgba(255,255,255,0.22)" onPress={() => {
            setSelecting((s) => !s);
            setSelected(new Set());
          }} />
        ) : undefined
      }
      footer={
        selecting ? (
          <Button title={`Delete ${selected.size} selected`} variant="danger" icon="trash-outline" disabled={!selected.size} onPress={() => setOtp(true)} />
        ) : items.some((n) => !n.read) ? (
          <Button
            title="Mark all as read"
            variant="secondary"
            icon="checkmark-done"
            onPress={() =>
              void api
                .post("/admin/notifications/incoming/mark-read", isSuperAdmin ? { ids: items.map((n) => n.id) } : {})
                .then(() => setItems((l) => l.map((n) => ({ ...n, read: true }))))
                .catch(() => undefined)
            }
          />
        ) : undefined
      }
    >
      <Banner text={error} />
      {loading ? (
        <Loading />
      ) : !items.length ? (
        <Empty icon="mail-open-outline" title="No messages" text="New messages will appear here." />
      ) : (
        items.map((n, i) => {
          const on = selected.has(n.id);
          const isOpen = openId === n.id;
          return (
            <Rise key={n.id} delay={Math.min(i, 8) * 30}>
              <Card
                style={[{ marginBottom: S.md }, !n.read && { borderColor: C.primaryLight }, on && { backgroundColor: C.primarySoft }]}
                onPress={() =>
                  selecting
                    ? setSelected((p) => {
                        const x = new Set(p);
                        if (x.has(n.id)) x.delete(n.id);
                        else x.add(n.id);
                        return x;
                      })
                    : open(n)
                }
              >
                <View style={{ flexDirection: "row", gap: S.md, alignItems: "flex-start" }}>
                  {selecting ? <Check checked={on} onPress={() => setSelected((p) => {
                    const x = new Set(p);
                    if (x.has(n.id)) x.delete(n.id);
                    else x.add(n.id);
                    return x;
                  })} /> : (
                    <View style={[st.dot, { backgroundColor: n.read ? C.line : C.primary }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={st.title}>{n.title}</Text>
                    <Muted style={{ fontSize: 11, marginTop: 2 }}>{fmtDateTime(n.created_at)}</Muted>
                    {isOpen ? (
                      <View style={{ marginTop: S.sm }}>
                        {details(n.message).map((r, k) => (
                          <View key={k} style={{ marginBottom: 6 }}>
                            {r.label ? <Text style={st.label}>{r.label}</Text> : null}
                            <Text style={st.value} selectable>
                              {r.value}
                            </Text>
                          </View>
                        ))}
                        {n.image_url ? <Image source={authedSource(n.image_url)} style={st.img} contentFit="cover" /> : null}
                      </View>
                    ) : (
                      <Muted numberOfLines={2} style={{ marginTop: 4 }}>
                        {n.message}
                      </Muted>
                    )}
                  </View>
                  {!selecting ? <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={C.faint} /> : null}
                </View>
              </Card>
            </Rise>
          );
        })
      )}
      <OtpSheet
        visible={otp}
        title={`Delete ${selected.size} message(s)`}
        description="The selected messages will be deleted."
        confirmLabel="Delete selected"
        onClose={() => setOtp(false)}
        onRequest={async () => (await api.post("/admin/notifications/bulk-delete/request-otp", { ids: [...selected] })).data}
        onConfirm={async (code) => {
          const { data } = await api.post<{ deleted?: string[] }>("/admin/notifications/bulk-delete", { ids: [...selected], otp: code });
          const gone = new Set(data.deleted ?? [...selected]);
          setItems((p) => p.filter((n) => !gone.has(n.id)));
          setSelected(new Set());
          setSelecting(false);
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  title: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  label: { fontFamily: F.bodySemi, fontSize: 11, color: C.muted, textTransform: "uppercase" },
  value: { fontFamily: F.bodyMed, fontSize: 14, color: C.ink },
  img: { width: "100%", height: 160, borderRadius: 12, marginTop: 8 },
});
