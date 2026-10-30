import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { authedSource, errMsg, mediaUrl } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Button, Card, Chips, Field, Loading, Muted, Section } from "../ui/kit";
import { Select } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { DOC_TYPES, asFormFile, pickDocuments, pickImages, sizeOk, type PickedFile } from "../lib/files";
import { waLink } from "../lib/format";

type Media = { type: string; url: string; caption: string };
type Lead = { id: string; name: string; organization: string; phone: string; email: string; message: string; status: string };

export function HelpScreen() {
  const { isSuperAdmin } = useAuth();
  const [view, setView] = useState<"instructions" | "registrations">("instructions");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get("/admin/app-instructions")
      .then(({ data }) => {
        setTitle(data.content?.title ?? "");
        setBody(data.content?.body ?? "");
        setMedia(data.content?.media ?? []);
      })
      .catch(() => setError("Instructions could not be loaded."))
      .finally(() => setLoading(false));
    if (isSuperAdmin)
      api
        .get("/admin/service-registrations")
        .then(({ data }) => setLeads(data.registrations ?? []))
        .catch(() => undefined);
  }, [isSuperAdmin]);

  async function addMedia(file: PickedFile | undefined) {
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (!sizeOk(file, isVideo ? 50 : 10)) return setError(isVideo ? "Choose a video up to 50 MB." : "Choose a photo up to 10 MB.");
    setBusy(true);
    setError(null);
    setStatus("Uploading…");
    try {
      const form = new FormData();
      form.append("file", asFormFile(file));
      const { data } = await api.post("/admin/app-instructions/media", form, { timeout: 180000 });
      setMedia((m) => [...m, { type: data.type, url: data.url, caption: "" }]);
      setStatus("Uploaded. Add a description, then save.");
    } catch {
      setError("Upload failed. Use JPG/PNG up to 10 MB or MP4 up to 50 MB.");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!title.trim()) return setError("Enter a heading.");
    setBusy(true);
    setError(null);
    try {
      await api.put("/admin/app-instructions", { title, body, media });
      setStatus("Instructions saved for your schools and institutes.");
    } catch {
      setError("Could not save. Check the uploaded files and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title="Instructions & enquiries"
      headerExtra={
        isSuperAdmin ? (
          <Chips<typeof view>
            value={view}
            onChange={setView}
            items={[
              { key: "instructions", label: "App instructions" },
              { key: "registrations", label: "Registrations", count: leads.length },
            ]}
          />
        ) : undefined
      }
      footer={view === "instructions" ? <Button title="Save instructions" icon="save-outline" onPress={() => void save()} loading={busy} /> : undefined}
    >
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={status} tone="green" onClose={() => setStatus(null)} />
      {loading ? (
        <Loading />
      ) : view === "instructions" ? (
        <>
          <Muted style={{ marginBottom: S.md }}>These appear after login in the school app for your schools and institutes, along with the standard photo guide.</Muted>
          <Field label="Heading" required value={title} onChangeText={setTitle} maxLength={120} />
          <Field label="Instructions" value={body} onChangeText={setBody} multiline maxLength={12000} />
          <Section title={`Photos & videos (${media.length}/12)`}>
            {media.map((m, i) => (
              <Card key={`${m.url}${i}`} style={{ marginBottom: S.sm }}>
                <View style={{ flexDirection: "row", gap: S.md, alignItems: "center" }}>
                  <Tap onPress={() => m.type === "video" && void Linking.openURL(mediaUrl(m.url)!)} style={st.thumb}>
                    {m.type === "video" ? <Ionicons name="play-circle" size={34} color={C.primary} /> : <Image source={authedSource(m.url)} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  </Tap>
                  <View style={{ flex: 1 }}>
                    <Field placeholder="Description" value={m.caption} onChangeText={(t) => setMedia((list) => list.map((x, k) => (k === i ? { ...x, caption: t } : x)))} />
                  </View>
                  <Tap onPress={() => setMedia((list) => list.filter((_, k) => k !== i))} hitSlop={8} accessibilityLabel="Remove">
                    <Ionicons name="trash-outline" size={20} color={C.danger} />
                  </Tap>
                </View>
              </Card>
            ))}
            {media.length < 12 ? (
              <View style={{ flexDirection: "row", gap: S.sm }}>
                <Button title="Add photo" variant="soft" icon="image-outline" disabled={busy} style={{ flex: 1 }} onPress={async () => void addMedia((await pickImages(false))[0])} />
                <Button title="Add video" variant="soft" icon="videocam-outline" disabled={busy} style={{ flex: 1 }} onPress={async () => void addMedia((await pickDocuments(DOC_TYPES.video))[0])} />
              </View>
            ) : null}
          </Section>
        </>
      ) : !leads.length ? (
        <Muted>No registrations yet.</Muted>
      ) : (
        leads.map((l) => (
          <Card key={l.id} style={{ marginBottom: S.md }}>
            <Text style={st.name}>{l.name}</Text>
            <Muted>{l.organization}</Muted>
            {l.message ? <Text style={st.msg}>{l.message}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginVertical: S.sm }}>
              {l.phone ? <Button small variant="soft" icon="call-outline" title="Call" onPress={() => void Linking.openURL(`tel:${l.phone}`)} /> : null}
              {l.phone ? <Button small variant="soft" icon="logo-whatsapp" title="WhatsApp" onPress={() => void Linking.openURL(waLink(l.phone))} /> : null}
              {l.email ? <Button small variant="soft" icon="mail-outline" title="Email" onPress={() => void Linking.openURL(`mailto:${l.email}`)} /> : null}
            </View>
            <Select
              label="Status"
              value={l.status}
              onChange={async (v) => {
                try {
                  await api.patch(`/admin/service-registrations/${l.id}`, { status: v });
                  setLeads((a) => a.map((x) => (x.id === l.id ? { ...x, status: v } : x)));
                } catch (e) {
                  setError(errMsg(e, "Could not update registration status."));
                }
              }}
              options={[
                { value: "new", label: "New" },
                { value: "contacted", label: "Contacted" },
                { value: "closed", label: "Closed" },
              ]}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  thumb: { width: 64, height: 64, borderRadius: R.md, backgroundColor: C.primarySoft, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  msg: { fontFamily: F.body, fontSize: 14, color: C.text, marginTop: 6 },
});
