import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import api, { authedSource, errMsg } from "../api/client";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Card, InfoRow, Loading, Muted, Pill, Rise, Section, Toggle } from "../ui/kit";
import { Ionicons } from "@expo/vector-icons";
import { ImageViewer } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { pickImages, asFormFile } from "../lib/files";
import type { ScreenProps } from "../navigation/types";

type Org = {
  name: string;
  year?: string | null;
  phone?: string | null;
  phone2?: string | null;
  school_code?: string | null;
  institute_code?: string | null;
  address?: string | null;
  instructions?: string | null;
  logo_url?: string | null;
  signature_url?: string | null;
  organization_photo_url?: string | null;
  model?: string | null;
  model_image_url?: string | null;
  template_name?: string | null;
  template_image_url?: string | null;
  tag_items?: { name: string; image_url: string | null }[];
  field_visibility?: Record<string, boolean> | null;
  allow_number_edit?: boolean | null;
  allow_record_edit?: boolean | null;
  show_captured_section?: boolean | null;
};

export function OrgInfoScreen({ route }: ScreenProps<"OrgInfo">) {
  const { kind, id, name } = route.params;
  const isOrg = kind === "organization";
  const base = isOrg ? `/admin/organizations/${id}` : kind === "institute" ? `/admin/institutes/${id}` : `/admin/schools/${id}`;
  const settingsPath = isOrg ? `${base}/details` : `${base}/app-settings`;
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // Template & Model choice in the school app (off while teachers only collect data; "final" choice protected).
  const lockPath = `/admin/selection-lock/${isOrg ? "organizations" : kind === "institute" ? "institutes" : "schools"}/${id}`;
  const [selection, setSelection] = useState<{ locked: boolean; templateLocked: boolean; modelLocked: boolean; finalBy: string | null; finalByName: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    api.get(lockPath).then((r) => alive && setSelection(r.data.selection)).catch(() => alive && setSelection(null));
    return () => { alive = false; };
  }, [lockPath]);
  const imgKind = isOrg ? "organizations" : kind === "institute" ? "institutes" : "schools";
  async function deleteImage(type: "logo" | "signature" | "organization") {
    try {
      await api.delete(`/admin/org-image/${imgKind}/${id}/${type}`);
      setSaved("Image deleted.");
      void load();
    } catch (e) {
      setError(errMsg(e, "Failed to delete image."));
    }
  }
  async function replaceImage(type: "logo" | "signature" | "organization") {
    try {
      const [file] = await pickImages(false);
      if (!file) return;
      const fd = new FormData();
      fd.append("file", asFormFile(file) as unknown as Blob);
      await api.post(`/admin/org-image/${imgKind}/${id}/${type}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSaved("Image updated.");
      void load();
    } catch (e) {
      setError(errMsg(e, "Failed to upload image."));
    }
  }
  async function saveField(field: string, value: string | null) {
    try {
      await api.patch(`/admin/org-detail/${imgKind}/${id}`, { field, value });
      setEditField(null);
      setSaved("Saved.");
      void load();
    } catch (e) {
      setError(errMsg(e, "Could not save."));
    }
  }
  async function saveSelection(body: { locked?: boolean; templateLocked?: boolean; modelLocked?: boolean; clearFinal?: boolean }) {
    setSaving(true);
    setError(null);
    try {
      const r = await api.patch(lockPath, body);
      setSelection(r.data.selection);
      setSaved("Saved for this organisation.");
    } catch (e) {
      setError(errMsg(e, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ organization: Org }>(`${base}/organization-info`);
      setOrg(data.organization);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to load organization info."));
    } finally {
      setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const vis = org?.field_visibility ?? {};

  async function toggleDetail(key: string, on: boolean) {
    if (!org) return;
    const prev = org;
    const next = { ...vis, [key]: on };
    setOrg({ ...org, field_visibility: next });
    setSaving(true);
    setError(null);
    try {
      await api.patch(settingsPath, { field_visibility: next });
      setSaved("Saved.");
    } catch (e) {
      setOrg(prev);
      setError(errMsg(e, "Could not save this field."));
    } finally {
      setSaving(false);
    }
  }

  async function saveSetting(patch: { allowNumberEdit?: boolean; allowRecordEdit?: boolean; showCaptured?: boolean }) {
    if (!org) return;
    const prev = org;
    const next = {
      allowNumberEdit: patch.allowNumberEdit ?? org.allow_number_edit !== false,
      allowRecordEdit: patch.allowRecordEdit ?? org.allow_record_edit !== false,
      showCaptured: patch.showCaptured ?? org.show_captured_section !== false,
    };
    setOrg({ ...org, allow_number_edit: next.allowNumberEdit, allow_record_edit: next.allowRecordEdit, show_captured_section: next.showCaptured });
    setSaving(true);
    setError(null);
    try {
      await api.patch(
        settingsPath,
        isOrg
          ? { field_visibility: { ...vis, allow_record_edit: next.allowRecordEdit, show_captured_section: next.showCaptured } }
          : { allow_number_edit: next.allowNumberEdit, allow_record_edit: next.allowRecordEdit, show_captured_section: next.showCaptured }
      );
      setSaved("Saved for this organisation.");
    } catch (e) {
      setOrg(prev);
      setError(errMsg(e, "Could not save settings."));
    } finally {
      setSaving(false);
    }
  }

  const sw = (key: string) => <Toggle value={vis[key] !== false} disabled={saving} onChange={(on) => void toggleDetail(key, on)} />;
  const EditRow = ({ field, label, value, toggleKey, secret }: { field: string; label: string; value?: string | null; toggleKey: string; secret?: boolean }) => {
    const editing = editField === field;
    return (
      <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.body, fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
            {editing ? (
              <TextInput value={editDraft} onChangeText={setEditDraft} style={{ marginTop: 4, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontFamily: F.body, fontSize: 15, color: C.ink }} />
            ) : (
              <Text style={{ marginTop: 2, fontFamily: F.body, fontSize: 15, color: C.ink }}>{secret && value ? "•••••••" : (value?.trim() || "—")}</Text>
            )}
          </View>
          {sw(toggleKey)}
        </View>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
          {editing ? (
            <>
              <Tap onPress={() => void saveField(field, editDraft.trim())}><Text style={{ color: C.primary, fontFamily: F.body, fontWeight: "600", fontSize: 13 }}>Save</Text></Tap>
              <Tap onPress={() => setEditField(null)}><Text style={{ color: C.muted, fontFamily: F.body, fontSize: 13 }}>Cancel</Text></Tap>
            </>
          ) : (
            <>
              <Tap onPress={() => { setEditField(field); setEditDraft(value?.trim() ?? ""); }}><Text style={{ color: C.primary, fontFamily: F.body, fontWeight: "600", fontSize: 13 }}>Edit</Text></Tap>
              {value?.trim() ? <Tap onPress={() => void saveField(field, null)}><Text style={{ color: C.danger, fontFamily: F.body, fontWeight: "600", fontSize: 13 }}>Delete</Text></Tap> : null}
            </>
          )}
        </View>
      </View>
    );
  };
  const images: { label: string; url: string; key: string; type?: "logo" | "signature" | "organization" }[] = [];
  if (org?.model_image_url) images.push({ label: `Model${org.model ? ` — ${org.model}` : ""}`, url: org.model_image_url, key: "detail_model" });
  for (const t of org?.tag_items ?? []) if (t.image_url) images.push({ label: `Tag — ${t.name}`, url: t.image_url, key: "detail_tags" });
  if (org?.template_image_url) images.push({ label: `Template${org.template_name ? ` — ${org.template_name}` : ""}`, url: org.template_image_url, key: "detail_template" });
  if (org?.logo_url) images.push({ label: "Logo", url: org.logo_url, key: "detail_logo", type: "logo" });
  if (org?.signature_url) images.push({ label: "Signature", url: org.signature_url, key: "detail_signature", type: "signature" });
  if (org?.organization_photo_url) images.push({ label: "Building / organisation photo", url: org.organization_photo_url, key: "detail_organization_photo", type: "organization" });

  return (
    <Screen title={kind === "school" ? "School Info" : kind === "institute" ? "Institution Info" : "Organization Info"} subtitle={name} refreshing={false} onRefresh={() => void load()}>
      <Banner text={error} onClose={() => setError(null)} />
      <Banner text={saved} tone="green" onClose={() => setSaved(null)} />
      {loading ? (
        <Loading />
      ) : org ? (
        <>
          <Muted style={{ marginBottom: S.md }}>Switches control what the school app shows and asks for.</Muted>
          <Rise>
            <Card>
              <InfoRow label="Name" value={org.name} />
              <EditRow field="year" label="Year" value={org.year} toggleKey="detail_year" />
              <EditRow field="phone" label="Phone" value={org.phone} toggleKey="detail_phone" secret />
              <EditRow field="phone2" label="Secondary phone" value={org.phone2} toggleKey="detail_phone2" secret />
              <EditRow field="code" label={kind === "institute" ? "Institute code" : kind === "school" ? "School code" : "Organisation code"} value={org.school_code ?? org.institute_code} toggleKey="detail_code" />
              <EditRow field="address" label="Address" value={org.address} toggleKey="detail_address" />
              <EditRow field="instructions" label="Instructions" value={org.instructions} toggleKey="detail_instructions" />
              <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 10 }}>
                <Text style={st.req}>Required details</Text>
                {sw("required_details")}
              </View>
            </Card>
          </Rise>

          <Section title="Pictures">
            {images.length === 0 ? (
              <Muted>No logo, signature, model or template yet. The school adds these in the school app.</Muted>
            ) : (
              <View style={st.grid}>
                {images.map((im, i) => (
                  <View key={`${im.key}${i}`} style={st.tile}>
                    <Tap onPress={() => setViewer(i)} style={st.tileImg}>
                      <Image source={authedSource(im.url)} style={StyleSheet.absoluteFill} contentFit="contain" transition={120} />
                    </Tap>
                    <View style={st.tileFoot}>
                      <Text style={st.tileLabel} numberOfLines={2}>
                        {im.label}
                      </Text>
                      {sw(im.key)}
                    </View>
                    {im.type ? (
                      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 6 }}>
                        <Tap onPress={() => { const t = im.type; if (t) void replaceImage(t); }}>
                          <Text style={{ color: C.primary, fontFamily: F.body, fontSize: 13, fontWeight: "600" }}>Replace</Text>
                        </Tap>
                        <Tap onPress={() => { const t = im.type; if (t) void deleteImage(t); }}>
                          <Text style={{ color: C.danger, fontFamily: F.body, fontSize: 13, fontWeight: "600" }}>Delete</Text>
                        </Tap>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </Section>

          <Section
            title="School app settings"
            right={<Pill text={saving ? "Saving…" : saved ? "Saved ✓" : "Saves instantly"} tone={saving ? "grey" : saved ? "green" : "blue"} />}
          >
            <Muted style={{ marginBottom: S.md }}>
              Controls what teachers can do in the My School ID Card app for this {kind === "school" ? "school" : kind === "institute" ? "institute" : "organization"}.
            </Muted>
            {[
              {
                key: "edit",
                title: "Edit Form",
                text: "Teachers can open saved records in the school app and correct details or retake photos.",
                icon: "create-outline" as const,
                on: org.allow_record_edit !== false,
                set: (v: boolean) => void saveSetting({ allowRecordEdit: v }),
              },
              {
                key: "captured",
                title: "Captured Section",
                text: "Shows the list of already captured students / members in the school app.",
                icon: "camera-outline" as const,
                on: org.show_captured_section !== false,
                set: (v: boolean) => void saveSetting({ showCaptured: v }),
              },
              ...(selection
                ? [
                    {
                      key: "selection_template",
                      title: "Template choice",
                      text: "Teachers can choose a Template. Turn OFF while they only collect data.",
                      icon: "grid-outline" as const,
                      on: !selection.templateLocked,
                      set: (v: boolean) => void saveSelection({ templateLocked: !v }),
                    },
                    {
                      key: "selection_model",
                      title: "Model choice",
                      text: "Teachers can choose a Model (card, tag, lanyard…). Turn OFF while they only collect data.",
                      icon: "cube-outline" as const,
                      on: !selection.modelLocked,
                      set: (v: boolean) => void saveSelection({ modelLocked: !v }),
                    },
                  ]
                : []),
            ].map((o) => (
              <Tap key={o.key} onPress={() => !saving && o.set(!o.on)} scaleTo={0.985} style={[st.opt, o.on && st.optOn]}>
                <View style={[st.optIcon, o.on && { backgroundColor: C.primary }]}>
                  <Ionicons name={o.icon} size={22} color={o.on ? C.white : C.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={st.optTitle}>{o.title}</Text>
                    <Pill text={o.on ? "ON" : "OFF"} tone={o.on ? "green" : "grey"} />
                  </View>
                  <Muted style={{ marginTop: 4 }}>{o.text}</Muted>
                </View>
                <Toggle value={o.on} disabled={saving} onChange={o.set} />
              </Tap>
            ))}
            {selection?.finalBy ? (
              <Tap onPress={() => !saving && void saveSelection({ clearFinal: true })} style={{ paddingVertical: 10 }}>
                <Text style={[st.optTitle, { color: C.primary, textDecorationLine: "underline" }]}>Clear final choice (let teachers choose again)</Text>
              </Tap>
            ) : null}
          </Section>
        </>
      ) : null}
      <ImageViewer
        visible={viewer !== null}
        onClose={() => setViewer(null)}
        index={viewer ?? 0}
        onIndex={setViewer}
        items={images.map((im) => ({ title: im.label, source: authedSource(im.url) }))}
      />
    </Screen>
  );
}

const st = StyleSheet.create({
  req: { flex: 1, fontFamily: F.bodySemi, fontSize: 14, color: C.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: S.md },
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: C.surface, overflow: "hidden" },
  tileImg: { height: 130, backgroundColor: C.white },
  tileFoot: { flexDirection: "row", alignItems: "center", padding: S.sm, gap: 4 },
  opt: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.white, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line },
  optOn: { borderColor: C.primaryLight, backgroundColor: C.primarySoft },
  optIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#F4F3FF", alignItems: "center", justifyContent: "center" },
  optTitle: { fontFamily: F.h, fontSize: 15, color: C.ink },
  tileLabel: { flex: 1, fontFamily: F.bodySemi, fontSize: 12, color: C.text },
});
