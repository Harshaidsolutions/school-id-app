import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import api, { authedSource, errMsg } from "../api/client";
import { C, F, R, S } from "../theme";
import { Screen } from "../ui/Screen";
import { Banner, Card, InfoRow, Loading, Muted, Pill, Rise, Section, Toggle } from "../ui/kit";
import { Ionicons } from "@expo/vector-icons";
import { ImageViewer } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
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
  const images: { label: string; url: string; key: string }[] = [];
  if (org?.model_image_url) images.push({ label: `Model${org.model ? ` — ${org.model}` : ""}`, url: org.model_image_url, key: "detail_model" });
  for (const t of org?.tag_items ?? []) if (t.image_url) images.push({ label: `Tag — ${t.name}`, url: t.image_url, key: "detail_tags" });
  if (org?.template_image_url) images.push({ label: `Template${org.template_name ? ` — ${org.template_name}` : ""}`, url: org.template_image_url, key: "detail_template" });
  if (org?.logo_url) images.push({ label: "Logo", url: org.logo_url, key: "detail_logo" });
  if (org?.signature_url) images.push({ label: "Signature", url: org.signature_url, key: "detail_signature" });
  if (org?.organization_photo_url) images.push({ label: "Building / organisation photo", url: org.organization_photo_url, key: "detail_organization_photo" });

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
              <InfoRow label="Year" value={org.year} right={sw("detail_year")} />
              <InfoRow label="Phone" value={org.phone} right={sw("detail_phone")} />
              {kind !== "institute" ? <InfoRow label="Secondary phone" value={org.phone2} right={sw("detail_phone2")} /> : null}
              <InfoRow label={kind === "institute" ? "Institute code" : kind === "school" ? "School code" : "Organisation code"} value={org.school_code ?? org.institute_code} right={sw("detail_code")} />
              <InfoRow label="Address" value={org.address} right={sw("detail_address")} />
              <InfoRow label="Instructions" value={org.instructions} right={sw("detail_instructions")} />
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
  tile: { flexBasis: "47%", flexGrow: 1, backgroundColor: C.surface, borderRadius: R.lg, overflow: "hidden", borderWidth: 1, borderColor: C.line },
  tileImg: { height: 130, backgroundColor: C.white },
  tileFoot: { flexDirection: "row", alignItems: "center", padding: S.sm, gap: 4 },
  opt: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.white, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: C.line },
  optOn: { borderColor: "#C7D2FE", backgroundColor: "#F7F7FF" },
  optIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#F4F3FF", alignItems: "center", justifyContent: "center" },
  optTitle: { fontFamily: F.h, fontSize: 15, color: C.ink },
  tileLabel: { flex: 1, fontFamily: F.bodySemi, fontSize: 12, color: C.text },
});
