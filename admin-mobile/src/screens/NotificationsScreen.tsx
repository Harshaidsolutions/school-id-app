import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { authedSource, errMsg } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { NotificationItem } from "../shared/types";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Check, Chips, Empty, Field, IconButton, Loading, Muted, Pill, Rise, SearchBar } from "../ui/kit";
import { OtpSheet, Sheet } from "../ui/Sheet";
import { PhotoPick } from "../ui/PhotoPick";
import { Tap } from "../ui/Pressable";
import { asFormFile, type PickedFile } from "../lib/files";
import { fmtDateTime } from "../lib/format";

type Row = NotificationItem & { organization_name?: string | null; admin_name?: string | null };
type Target = { kind: "schoolId" | "instituteId" | "adminId"; id: string; name: string };

export function NotificationsScreen({ inTab = false }: { inTab?: boolean }) {
  const { isSuperAdmin } = useAuth();
  const [view, setView] = useState<"compose" | "sent">("compose");
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [institutes, setInstitutes] = useState<{ id: string; name: string }[]>([]);
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [image, setImage] = useState<PickedFile | null>(null);
  const [sent, setSent] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<{ id: string; title: string; message: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"schoolId" | "instituteId" | "adminId">("schoolId");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const requestKey = useRef<{ fp: string; id: string } | null>(null);

  const loadSent = useCallback(async () => {
    try {
      const { data } = await api.get<{ notifications: Row[] }>("/admin/notifications");
      setSent((data.notifications ?? []).filter((n) => n.audience !== "super_admin"));
    } catch (e) {
      setError(errMsg(e, "Failed to load notifications."));
    }
  }, []);
  const loadTemplates = useCallback(() => {
    void api
      .get("/admin/message-templates")
      .then(({ data }) => setTemplates(data.templates ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [s, i, a] = await Promise.all([
          api.get("/admin/schools"),
          api.get("/admin/institutes").catch(() => ({ data: { institutes: [] } })),
          isSuperAdmin ? api.get("/admin/managed-admins").catch(() => ({ data: { admins: [] } })) : Promise.resolve({ data: { admins: [] } }),
        ]);
        setSchools((s.data.schools ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        setInstitutes((i.data.institutes ?? []).map((x: { id: string; name: string }) => ({ id: x.id, name: x.name })));
        setAdmins(
          ((a.data.admins ?? []) as Array<{ id: string; display_name?: string | null; username?: string | null; email?: string | null; is_super_admin?: boolean; is_active?: boolean }>)
            .filter((x) => !x.is_super_admin && x.is_active !== false)
            .map((x) => ({ id: x.id, name: x.display_name?.trim() || x.username || x.email || "Admin" }))
        );
        await loadSent();
      } catch (e) {
        setError(errMsg(e, "Failed to load recipients."));
      } finally {
        setLoading(false);
      }
    })();
    loadTemplates();
  }, [isSuperAdmin, loadSent, loadTemplates]);

  const all: Target[] = useMemo(
    () => [
      ...schools.map((s) => ({ kind: "schoolId" as const, id: s.id, name: s.name })),
      ...institutes.map((s) => ({ kind: "instituteId" as const, id: s.id, name: s.name })),
      ...admins.map((s) => ({ kind: "adminId" as const, id: s.id, name: s.name })),
    ],
    [schools, institutes, admins]
  );
  const keyOf = (t: Target) => `${t.kind}:${t.id}`;
  const targets = all.filter((t) => picked.has(keyOf(t)));
  const countOf = (k: Target["kind"]) => targets.filter((t) => t.kind === k).length;

  async function performSend() {
    if (!targets.length) return setError("Choose at least one school, institute or admin.");
    if (!title.trim() || !message.trim()) return setError("Enter a title and message.");
    const fp = JSON.stringify([title.trim(), message.trim(), image?.uri ?? ""]);
    if (!requestKey.current || requestKey.current.fp !== fp) requestKey.current = { fp, id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
    const batch = requestKey.current.id;
    setSending(true);
    setError(null);
    setSuccess(null);
    const outcomes = await Promise.allSettled(
      targets.map((t) => {
        const requestId = `${batch}:${t.kind}:${t.id}`;
        if (!image) return api.post("/admin/notifications", { [t.kind]: t.id, title: title.trim(), message: message.trim(), requestId });
        const body = new FormData();
        body.append(t.kind, t.id);
        body.append("title", title.trim());
        body.append("message", message.trim());
        body.append("requestId", requestId);
        body.append("image", asFormFile(image));
        return api.post("/admin/notifications", body);
      })
    );
    const failed = targets.filter((_, i) => outcomes[i].status === "rejected");
    setPicked(new Set(failed.map(keyOf)));
    await loadSent();
    setSending(false);
    if (failed.length) {
      setError(`${targets.length - failed.length} sent; ${failed.length} need retry. Only those are still selected.`);
    } else {
      setSuccess(`Sent to ${targets.length} recipient(s).`);
      setTitle("");
      setMessage("");
      setImage(null);
      requestKey.current = null;
    }
  }

  async function send() {
    const exists = templates.some((t) => t.title.trim() === title.trim() && t.message.trim() === message.trim());
    if (exists || !title.trim() || !message.trim()) return performSend();
    Alert.alert("Save this message?", "Keep this wording as a saved message to reuse later.", [
      { text: "Just send", onPress: () => void performSend() },
      {
        text: "Save & send",
        onPress: async () => {
          try {
            await api.post("/admin/message-templates", { title: title.trim(), message: message.trim() });
            loadTemplates();
          } catch {
            /* still send */
          }
          void performSend();
        },
      },
    ]);
  }

  const pickerItems = all.filter((t) => t.kind === pickerTab && (!pickerSearch || t.name.toLowerCase().includes(pickerSearch.toLowerCase())));
  const allPickedInTab = pickerItems.length > 0 && pickerItems.every((t) => picked.has(keyOf(t)));

  return (
    <Screen
      title="Notifications"
      back={!inTab}
      subtitle="Send messages to the school app"
      headerExtra={
        <Chips<"compose" | "sent">
          value={view}
          onChange={setView}
          items={[
            { key: "compose", label: "New message" },
            { key: "sent", label: "Sent", count: sent.length },
          ]}
        />
      }
      right={
        view === "sent" && sent.length ? (
          <IconButton icon={selecting ? "close" : "checkbox-outline"} label="Select" color={C.white} bg="rgba(255,255,255,0.22)" onPress={() => {
            setSelecting((s) => !s);
            setSelected(new Set());
          }} />
        ) : undefined
      }
      footer={
        view === "compose" ? (
          <Button title={targets.length ? `Send to ${targets.length}` : "Send"} icon="paper-plane" onPress={() => void send()} loading={sending} />
        ) : selecting ? (
          <Button title={`Delete ${selected.size} selected`} variant="danger" icon="trash-outline" disabled={!selected.size} onPress={() => setBulkOpen(true)} />
        ) : undefined
      }
    >
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={success} tone="green" onClose={() => setSuccess(null)} />
      {loading ? (
        <Loading />
      ) : view === "compose" ? (
        <>
          <Tap onPress={() => setPickerOpen(true)} style={st.recip}>
            <View style={st.recipIcon}>
              <Ionicons name="people" size={22} color={C.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={st.recipTitle}>{targets.length ? `${targets.length} recipient(s)` : "Choose recipients"}</Text>
              <Muted numberOfLines={1}>
                {targets.length
                  ? [countOf("schoolId") && `${countOf("schoolId")} schools`, countOf("instituteId") && `${countOf("instituteId")} institutes`, countOf("adminId") && `${countOf("adminId")} admins`].filter(Boolean).join(" · ")
                  : "Schools, institutes" + (isSuperAdmin ? " or admins" : "")}
              </Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={C.faint} />
          </Tap>
          {templates.length ? (
            <View style={{ marginBottom: S.md }}>
              <Text style={st.small}>Saved messages</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {templates.map((t) => (
                  <View key={t.id} style={st.tpl}>
                    <Tap onPress={() => {
                      setTitle(t.title);
                      setMessage(t.message);
                    }}>
                      <Text style={st.tplText} numberOfLines={1}>
                        {t.title}
                      </Text>
                    </Tap>
                    <Tap hitSlop={8} accessibilityLabel={`Delete ${t.title}`} onPress={() =>
                      Alert.alert("Delete saved message?", t.title, [
                        { text: "Cancel", style: "cancel" },
                        { text: "Delete", style: "destructive", onPress: () => void api.delete(`/admin/message-templates/${t.id}`).then(loadTemplates).catch(() => setError("Could not delete saved message.")) },
                      ])
                    }>
                      <Ionicons name="close" size={14} color={C.muted} />
                    </Tap>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
          <Field label="Title" required value={title} onChangeText={setTitle} placeholder="e.g. Photo day on Monday" maxLength={150} />
          <Field label="Message" required value={message} onChangeText={setMessage} multiline placeholder="Write your message…" />
          <PhotoPick label="Image (optional)" value={image} onChange={setImage} wide hint="Shown with the message in the app." />
        </>
      ) : sent.length === 0 ? (
        <Empty icon="notifications-off-outline" title="No messages sent yet" />
      ) : (
        sent.map((n, i) => {
          const on = selected.has(n.id);
          const to = n.school_name || n.institute_name || n.organization_name || n.admin_name || "Recipient";
          return (
            <Rise key={n.id} delay={Math.min(i, 8) * 30}>
              <Card
                style={[{ marginBottom: S.md }, on && { borderColor: C.primary, backgroundColor: C.primarySoft }]}
                onPress={selecting ? () => setSelected((p) => {
                  const x = new Set(p);
                  if (x.has(n.id)) x.delete(n.id);
                  else x.add(n.id);
                  return x;
                }) : undefined}
              >
                <View style={{ flexDirection: "row", gap: S.md }}>
                  {selecting ? <Check checked={on} onPress={() => setSelected((p) => {
                    const x = new Set(p);
                    if (x.has(n.id)) x.delete(n.id);
                    else x.add(n.id);
                    return x;
                  })} /> : null}
                  <View style={{ flex: 1 }}>
                    <Text style={st.nTitle}>{n.title}</Text>
                    <Muted style={{ marginTop: 4 }}>{n.message}</Muted>
                    {n.image_url ? <Image source={authedSource(n.image_url)} style={st.nImg} contentFit="cover" /> : null}
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                      <Pill text={to} tone="blue" icon="send" />
                      <Muted style={{ fontSize: 11 }}>{fmtDateTime(n.created_at)}</Muted>
                    </View>
                  </View>
                  {!selecting ? <IconButton icon="trash-outline" label="Delete" size={34} bg={C.dangerSoft} color={C.danger} onPress={() => setDeleteTarget(n)} /> : null}
                </View>
              </Card>
            </Rise>
          );
        })
      )}

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Choose recipients"
        footer={<Button title={`Done · ${targets.length} selected`} onPress={() => setPickerOpen(false)} />}
      >
        <Chips<typeof pickerTab>
          value={pickerTab}
          onChange={setPickerTab}
          items={[
            { key: "schoolId", label: "Schools", count: schools.length },
            { key: "instituteId", label: "Institutes", count: institutes.length },
            ...(isSuperAdmin ? [{ key: "adminId" as const, label: "Admins", count: admins.length }] : []),
          ]}
        />
        <View style={{ marginVertical: S.md }}>
          <SearchBar value={pickerSearch} onChange={setPickerSearch} />
        </View>
        <Check
          checked={allPickedInTab}
          label={allPickedInTab ? "Unselect all" : "Select all"}
          onPress={() =>
            setPicked((p) => {
              const n = new Set(p);
              for (const t of pickerItems) {
                if (allPickedInTab) n.delete(keyOf(t));
                else n.add(keyOf(t));
              }
              return n;
            })
          }
        />
        {pickerItems.map((t) => (
          <Check
            key={keyOf(t)}
            checked={picked.has(keyOf(t))}
            label={t.name}
            onPress={() =>
              setPicked((p) => {
                const n = new Set(p);
                if (n.has(keyOf(t))) n.delete(keyOf(t));
                else n.add(keyOf(t));
                return n;
              })
            }
          />
        ))}
        {!pickerItems.length ? <Muted style={{ padding: S.md }}>Nothing to show.</Muted> : null}
      </Sheet>

      <OtpSheet
        visible={Boolean(deleteTarget)}
        title="Delete notification"
        description={`Remove “${deleteTarget?.title ?? ""}” permanently.`}
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onRequest={async () => (await api.post(`/admin/notifications/${deleteTarget!.id}/request-delete-otp`)).data}
        onConfirm={async (otp) => {
          await api.delete(`/admin/notifications/${deleteTarget!.id}`, { data: { otp } });
          const gone = deleteTarget!.id;
          setSent((p) => p.filter((x) => x.id !== gone));
        }}
      />
      <OtpSheet
        visible={bulkOpen}
        title={`Delete ${selected.size} notification(s)`}
        description="The selected messages will be removed from the school app."
        confirmLabel="Delete selected"
        onClose={() => setBulkOpen(false)}
        onRequest={async () => (await api.post("/admin/notifications/bulk-delete/request-otp", { ids: [...selected] })).data}
        onConfirm={async (otp) => {
          const { data } = await api.post<{ deleted?: string[] }>("/admin/notifications/bulk-delete", { ids: [...selected], otp });
          const gone = new Set(data.deleted ?? [...selected]);
          setSent((p) => p.filter((x) => !gone.has(x.id)));
          setSelected(new Set());
          setSelecting(false);
        }}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  recip: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.white, borderRadius: R.lg, padding: S.md, marginBottom: S.lg, borderWidth: 1.5, borderColor: C.primaryLight },
  recipIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  recipTitle: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  small: { fontFamily: F.bodySemi, fontSize: 12, color: C.muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  tpl: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.accentSoft, borderRadius: R.pill, paddingLeft: 12, paddingRight: 8, paddingVertical: 7, maxWidth: 220 },
  tplText: { fontFamily: F.bodySemi, fontSize: 13, color: C.accentDeep },
  nTitle: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  nImg: { width: "100%", height: 150, borderRadius: R.md, marginTop: 8, backgroundColor: C.white },
});
