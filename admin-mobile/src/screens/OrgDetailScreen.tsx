import { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { apiImage, errMsg } from "../api/client";
import { configuredCategoryFields } from "../shared/formFieldHelpers";
import { C, CONTENT_MAX, F, R, S } from "../theme";
import { Backdrop, Header } from "../ui/Screen";
import { Banner, Button, Check, Chips, Empty, Field, IconButton, Loading, Muted, Pill, Rise, SearchBar } from "../ui/kit";
import { ActionSheet, ImageViewer, OtpSheet, Select, Sheet } from "../ui/Sheet";
import { PhotoPick } from "../ui/PhotoPick";
import { Tap } from "../ui/Pressable";
import { dayKey, dayLabel, num } from "../lib/format";
import { asFormFile, downloadFile, type PickedFile } from "../lib/files";
import type { ScreenProps } from "../navigation/types";
import { DeleteOptionsSheet, ExcelDownloadSheet, ExcelUploadSheet, PhotoDownloadSheet, type CategoryField, type DeleteJob } from "./RecordSheets";

type FormField = { id: string; field_name: string; field_type: string; enabled?: boolean; required?: boolean };
type Row = {
  id: string;
  serial: number;
  photoNumber?: string;
  createdAt?: string;
  values: Record<string, { text: string | null; hasPhoto: boolean; capturedAt?: string | null }>;
};
type Tab = "all" | "pending" | "captured" | "pending-data";

const isSignature = (l: string) => /signature/i.test(l);
const isPhotoNumber = (l: string) => /photo\s*(number|no\.?|id)\b/i.test(l);

export function OrgDetailScreen({ route, navigation }: ScreenProps<"OrgDetail">) {
  const { id } = route.params;
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(route.params.name);
  const [link, setLink] = useState<string | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [groupFilters, setGroupFilters] = useState<Record<string, string>>({});
  const [capturedOn, setCapturedOn] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sheet, setSheet] = useState<"excel-up" | "excel-down" | "photos-down" | "delete" | null>(null);
  const [deleteJob, setDeleteJob] = useState<DeleteJob | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [viewer, setViewer] = useState<{ fieldId: string; index: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/organizations/${id}`);
      setName(data.organization?.name ?? route.params.name);
      setLink(data.form?.link ?? null);
      setFields(data.form?.fields ?? []);
      setRows(data.submissions ?? []);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to open organisation."));
    } finally {
      setLoading(false);
    }
  }, [id, route.params.name]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const active = fields.filter((f) => f.enabled !== false);
  const photoFields = active.filter((f) => f.field_type === "photo");
  const imageFields = photoFields.filter((f) => !isSignature(f.field_name));
  const signatureFields = photoFields.filter((f) => isSignature(f.field_name));
  const textFields = active.filter((f) => f.field_type !== "photo" && !isPhotoNumber(f.field_name));
  const numberLabel = active.find((f) => isPhotoNumber(f.field_name))?.field_name ?? "Photo number";
  const nameField = textFields.find((f) => /name/i.test(f.field_name)) ?? textFields[0];

  const captured = (r: Row) => imageFields.length > 0 && imageFields.every((f) => r.values[f.id]?.hasPhoto);
  const missing = (r: Row) => textFields.some((f) => f.required !== false && !(r.values[f.id]?.text ?? "").trim());

  const categories = useMemo(
    () => configuredCategoryFields(active.filter((f) => f.field_type === "text").map((f) => ({ key: f.id, label: f.field_name, enabled: true }))),
    [active]
  );
  const categoryFields: CategoryField[] = useMemo(
    () =>
      categories.map((c) => {
        const m = new Map<string, number>();
        for (const r of rows) {
          const v = (r.values[c.key]?.text ?? "").trim();
          if (v) m.set(v, (m.get(v) ?? 0) + 1);
        }
        return { label: c.label, key: c.key, options: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([n, count]) => ({ name: n, count, key: c.key })) };
      }),
    [categories, rows]
  );

  const photoCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of rows) for (const f of imageFields) {
      const v = r.values[f.id];
      const d = v?.hasPhoto ? dayKey(v.capturedAt) : null;
      if (d) out[d] = (out[d] ?? 0) + 1;
    }
    return out;
  }, [rows, imageFields]);
  const signatureCount = useMemo(() => rows.filter((r) => signatureFields.some((f) => r.values[f.id]?.hasPhoto)).length, [rows, signatureFields]);

  const counts = { all: rows.length, pending: rows.filter((r) => !captured(r)).length, captured: rows.filter(captured).length, "pending-data": rows.filter(missing).length };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const c = captured(r);
      if (tab === "captured" && !c) return false;
      if (tab === "pending" && c) return false;
      if (tab === "pending-data" && !missing(r)) return false;
      if (capturedOn && !imageFields.some((f) => r.values[f.id]?.hasPhoto && dayKey(r.values[f.id]?.capturedAt) === capturedOn)) return false;
      for (const [fid, v] of Object.entries(groupFilters)) if (v && (r.values[fid]?.text ?? "").trim() !== v) return false;
      if (!q) return true;
      return (r.photoNumber ?? "").toLowerCase().includes(q) || active.some((f) => (r.values[f.id]?.text ?? "").toLowerCase().includes(q));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, tab, capturedOn, groupFilters, fields]);

  const selectedIds = visible.filter((r) => selected.has(r.id)).map((r) => r.id);
  const firstImage = imageFields[0];
  const viewerRows = viewer ? visible.filter((r) => r.values[viewer.fieldId]?.hasPhoto) : [];
  const shareText = link ? `${name} – details collection\n\nPlease fill in your details using this link:\n${link}` : "";

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setSheet(null);
    } catch (e) {
      setError(errMsg(e, label));
    } finally {
      setBusy(false);
    }
  }

  function jobIds(job: DeleteJob) {
    return rows
      .filter((r) => {
        if (job.date && !imageFields.some((f) => r.values[f.id]?.hasPhoto && dayKey(r.values[f.id]?.capturedAt) === job.date)) return false;
        if (job.fieldKey && job.classSection && (r.values[job.fieldKey]?.text ?? "").trim() !== job.classSection) return false;
        const c = captured(r);
        if (job.dataScope === "captured" && !c) return false;
        if (job.dataScope === "uncaptured" && c) return false;
        if (job.dataScope === "pending-data" && !missing(r)) return false;
        return true;
      })
      .map((r) => r.id);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header
        title={name}
        subtitle={`${num(rows.length)} records · ${num(counts.captured)} captured`}
        right={
          <>
            <IconButton icon="construct-outline" label="Tools" color={C.white} bg="rgba(255,255,255,0.22)" onPress={() => setToolsOpen(true)} />
            <IconButton
              icon={selecting ? "close" : "checkbox-outline"}
              label="Select"
              color={C.white}
              bg="rgba(255,255,255,0.22)"
              onPress={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
            />
          </>
        }
      >
        <View style={{ flexDirection: "row", gap: S.sm, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} placeholder="Search records…" />
          </View>
          <IconButton icon="options-outline" label="Filters" size={46} bg={C.white} color={C.primaryDeep} badge={Object.values(groupFilters).filter(Boolean).length + (capturedOn ? 1 : 0)} onPress={() => setFilterOpen(true)} />
        </View>
      </Header>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}>
        <Chips<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { key: "all", label: "All", count: counts.all },
            { key: "pending", label: "Pending", count: counts.pending },
            { key: "captured", label: "Captured", count: counts.captured },
            { key: "pending-data", label: "Pending data", count: counts["pending-data"] },
          ]}
        />
      </View>
      {selecting ? (
        <View style={st.selectBar}>
          <Check checked={visible.length > 0 && selectedIds.length === visible.length} onPress={() => setSelected(selectedIds.length === visible.length ? new Set() : new Set(visible.map((r) => r.id)))} label={`${selectedIds.length} selected`} />
          <Button small variant="danger" icon="trash-outline" title="Delete" disabled={!selectedIds.length} onPress={() => {
            setDeleteJob(null);
            setOtpOpen(true);
          }} />
        </View>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 40, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={refreshing} colors={[C.primary]} onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }} />}
          ListHeaderComponent={
            <>
              <Banner text={error} onClose={() => setError(null)} />
              <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
              {link ? (
                <Tap onPress={() => void Share.share({ message: shareText })} style={st.linkCard}>
                  <Ionicons name="link" size={20} color={C.accentDeep} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.linkTitle}>Share form link</Text>
                    <Muted numberOfLines={1}>{link}</Muted>
                  </View>
                  <Ionicons name="share-social-outline" size={20} color={C.accentDeep} />
                </Tap>
              ) : null}
            </>
          }
          ListEmptyComponent={<Empty icon="document-text-outline" title="No records yet" text="Share the form link or upload an Excel file." />}
          renderItem={({ item, index }) => {
            const c = captured(item);
            const on = selected.has(item.id);
            return (
              <Rise delay={Math.min(index, 10) * 30}>
                <Tap
                  scaleTo={0.985}
                  style={[st.rec, on && st.recOn]}
                  onPress={() => {
                    if (selecting) setSelected((p) => {
                      const n = new Set(p);
                      if (n.has(item.id)) n.delete(item.id);
                      else n.add(item.id);
                      return n;
                    });
                    else setEditing(item);
                  }}
                >
                  {selecting ? <Check checked={on} onPress={() => setSelected((p) => {
                    const n = new Set(p);
                    if (n.has(item.id)) n.delete(item.id);
                    else n.add(item.id);
                    return n;
                  })} /> : null}
                  <Tap
                    style={st.thumb}
                    onPress={() => (firstImage && item.values[firstImage.id]?.hasPhoto ? setViewer({ fieldId: firstImage.id, index: visible.filter((r) => r.values[firstImage.id]?.hasPhoto).findIndex((r) => r.id === item.id) }) : setEditing(item))}
                  >
                    {firstImage && item.values[firstImage.id]?.hasPhoto ? (
                      <Image source={apiImage(`/admin/organizations/${id}/submissions/${item.id}/fields/${firstImage.id}/photo`)} style={StyleSheet.absoluteFill} contentFit="cover" recyclingKey={item.id} />
                    ) : (
                      <Text style={st.serial}>{item.serial}</Text>
                    )}
                  </Tap>
                  <View style={{ flex: 1 }}>
                    <Text style={st.recName} numberOfLines={1}>
                      {(nameField && item.values[nameField.id]?.text) || `Record ${item.serial}`}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                      {item.photoNumber ? <Pill text={item.photoNumber} tone="blue" /> : null}
                      <Pill text={c ? "Captured" : "Pending"} tone={c ? "green" : "amber"} />
                      {missing(item) ? <Pill text="Data missing" tone="red" /> : null}
                    </View>
                    {textFields
                      .filter((f) => f !== nameField)
                      .slice(0, 2)
                      .map((f) =>
                        item.values[f.id]?.text ? (
                          <Muted key={f.id} numberOfLines={1} style={{ marginTop: 3 }}>
                            {f.field_name}: {item.values[f.id]?.text}
                          </Muted>
                        ) : null
                      )}
                  </View>
                  {!selecting ? <Ionicons name="create-outline" size={18} color={C.faint} /> : null}
                </Tap>
              </Rise>
            );
          }}
        />
      )}

      <ActionSheet
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        title={`${name} tools`}
        actions={[
          { label: "Share form link", icon: "share-social-outline", hidden: !link, onPress: () => void Share.share({ message: shareText }) },
          { label: "Upload Excel", icon: "document-attach-outline", onPress: () => setSheet("excel-up") },
          { label: "Download Excel", icon: "download-outline", onPress: () => setSheet("excel-down") },
          { label: "Download Photos", icon: "cloud-download-outline", onPress: () => setSheet("photos-down") },
          { label: "Form Setup", icon: "list-outline", sub: "Names, required, visibility", onPress: () => navigation.navigate("FormSetup", { kind: "organization", id, name }) },
          { label: "Organization Info", icon: "information-circle-outline", onPress: () => navigation.navigate("OrgInfo", { kind: "organization", id, name }) },
          { label: "Cropping Tool", icon: "crop-outline", onPress: () => navigation.navigate("WebTool", { title: "Cropping Tool", path: `/crop-tool?organizationId=${id}&organizationName=${encodeURIComponent(name)}` }) },
          { label: "Delete Options", icon: "trash-bin-outline", danger: true, onPress: () => setSheet("delete") },
        ]}
      />

      <Sheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" footer={<Button title="Show results" onPress={() => setFilterOpen(false)} />}>
        <Select label="Captured on" value={capturedOn} onChange={setCapturedOn} options={[{ value: "", label: "Any date" }, ...Object.entries(photoCounts).sort(([a], [b]) => b.localeCompare(a)).map(([d, n]) => ({ value: d, label: `${dayLabel(d)} (${n})` }))]} />
        {categoryFields.map((c) => (
          <Select key={c.key} label={c.label} value={groupFilters[c.key] ?? ""} onChange={(v) => setGroupFilters((g) => ({ ...g, [c.key]: v }))} options={[{ value: "", label: "All" }, ...c.options.map((o) => ({ value: o.name, label: `${o.name} (${o.count})` }))]} />
        ))}
        <Button title="Clear filters" variant="secondary" onPress={() => {
          setGroupFilters({});
          setCapturedOn("");
        }} />
      </Sheet>

      <ExcelUploadSheet visible={sheet === "excel-up"} onClose={() => setSheet(null)} target={{ organizationId: id }} onDone={() => void load()} />
      <ExcelDownloadSheet
        visible={sheet === "excel-down"}
        onClose={() => setSheet(null)}
        busy={busy}
        categoryFields={categoryFields}
        captureDates={Object.entries(photoCounts).map(([n, count]) => ({ name: n, count }))}
        counts={{ all: rows.length, captured: counts.captured, pending: counts.pending, "captured-pending-data": rows.filter((r) => captured(r) && missing(r)).length, "uncaptured-pending-data": rows.filter((r) => !captured(r) && missing(r)).length }}
        onDownload={(job) => void run("Failed to download Excel.", () => downloadFile(`/admin/organizations/${id}/excel`, `${name}-records.xlsx`, { scope: job.scope, date: job.date, fieldId: job.fieldKey, value: job.classSection }))}
      />
      <PhotoDownloadSheet
        visible={sheet === "photos-down"}
        onClose={() => setSheet(null)}
        busy={busy}
        photoCounts={photoCounts}
        categoryFields={categoryFields}
        showSignature={signatureCount > 0}
        onDownload={(job) => void run("Failed to download photos.", () => downloadFile(`/admin/organizations/${id}/photos.zip`, `${name}-${job.asset === "signature" ? "signatures" : "photos"}.zip`, { asset: job.asset, date: job.date, fieldId: job.fieldKey, value: job.classSection }))}
      />
      <DeleteOptionsSheet
        visible={sheet === "delete"}
        onClose={() => setSheet(null)}
        photoCounts={photoCounts}
        categoryFields={categoryFields}
        counts={{ allPhotos: rows.filter((r) => imageFields.some((f) => r.values[f.id]?.hasPhoto)).length, allData: rows.length, capturedData: counts.captured, uncapturedData: counts.pending }}
        onChoose={(job) => {
          setSheet(null);
          setDeleteJob(job);
          setTimeout(() => setOtpOpen(true), 450);
        }}
      />
      <OtpSheet
        visible={otpOpen}
        title={deleteJob?.kind === "photos" ? "Delete photos" : "Delete records"}
        description={deleteJob?.label ?? `Delete ${selectedIds.length} selected record(s)?`}
        confirmLabel="Delete"
        onClose={() => {
          setOtpOpen(false);
          setDeleteJob(null);
        }}
        onRequest={async () => (await api.post(`/admin/organizations/${id}/submissions/bulk-delete/request-otp`)).data}
        onConfirm={async (otp) => {
          const ids = deleteJob ? jobIds(deleteJob) : selectedIds;
          await api.post(`/admin/organizations/${id}/submissions/bulk-delete`, { ids, otp, photosOnly: deleteJob?.kind === "photos", date: deleteJob?.date });
          setSelecting(false);
          setSelected(new Set());
          setDeleteJob(null);
          await load();
          setNotice("Deleted.");
        }}
      />
      <SubmissionEditSheet
        orgId={id}
        row={editing}
        numberLabel={numberLabel}
        fields={active}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          setNotice("Record saved.");
          void load();
        }}
      />
      <ImageViewer
        visible={Boolean(viewer)}
        onClose={() => setViewer(null)}
        index={viewer?.index ?? 0}
        onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
        items={viewerRows.map((r) => ({
          title: (nameField && r.values[nameField.id]?.text) || `Record ${r.serial}`,
          sub: r.photoNumber,
          source: apiImage(`/admin/organizations/${id}/submissions/${r.id}/fields/${viewer!.fieldId}/photo`),
        }))}
        actions={
          viewer && viewerRows[viewer.index] ? (
            <Button
              title="Download photo"
              variant="secondary"
              icon="download-outline"
              style={{ flex: 1 }}
              onPress={() => {
                const r = viewerRows[viewer.index];
                void run("Failed to download photo.", () => downloadFile(`/admin/organizations/${id}/submissions/${r.id}/fields/${viewer.fieldId}/photo`, `${r.photoNumber || `record-${r.serial}`}.jpg`));
              }}
            />
          ) : undefined
        }
      />
    </View>
  );
}

function SubmissionEditSheet({
  orgId,
  row,
  fields,
  numberLabel,
  onClose,
  onSaved,
}: {
  orgId: string;
  row: Row | null;
  fields: FormField[];
  numberLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [number, setNumber] = useState("");
  const [photos, setPhotos] = useState<Record<string, PickedFile>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  if ((row?.id ?? null) !== lastId) {
    setLastId(row?.id ?? null);
    const d: Record<string, string> = {};
    if (row) for (const f of fields) if (f.field_type !== "photo") d[f.id] = row.values[f.id]?.text ?? "";
    setDraft(d);
    setNumber(row?.photoNumber ?? "");
    setPhotos({});
    setError(null);
  }
  async function save() {
    if (!row) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/admin/organizations/${orgId}/submissions/${row.id}`, { values: draft, photoNumber: number });
      for (const [fid, p] of Object.entries(photos)) {
        const body = new FormData();
        body.append("photo", asFormFile(p));
        body.append("replacePhoto", "1");
        await api.post(`/admin/organizations/${orgId}/submissions/${row.id}/fields/${fid}/photo`, body);
      }
      onSaved();
    } catch (e) {
      setError(errMsg(e, "Save did not finish. Some changes may have saved; please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={Boolean(row)} onClose={onClose} title={`Edit record ${row?.serial ?? ""}`} footer={<Button title="Save changes" icon="checkmark" onPress={() => void save()} loading={busy} />}>
      <Banner text={error} />
      <Field label={numberLabel} value={number} onChangeText={setNumber} maxLength={100} />
      {fields
        .filter((f) => !isPhotoNumber(f.field_name))
        .map((f) =>
          f.field_type === "photo" ? (
            <PhotoPick
              key={f.id}
              label={f.field_name}
              wide={isSignature(f.field_name)}
              value={photos[f.id] ?? null}
              current={row?.values[f.id]?.hasPhoto ? apiImage(`/admin/organizations/${orgId}/submissions/${row.id}/fields/${f.id}/photo`) : null}
              onChange={(p) =>
                setPhotos((prev) => {
                  const n = { ...prev };
                  if (p) n[f.id] = p;
                  else delete n[f.id];
                  return n;
                })
              }
            />
          ) : (
            <Field key={f.id} label={f.field_name} required={f.required !== false} value={draft[f.id] ?? ""} onChangeText={(t) => setDraft((d) => ({ ...d, [f.id]: t }))} />
          )
        )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.sm, marginTop: S.sm, backgroundColor: C.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  linkCard: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.accentSoft, borderRadius: R.lg, padding: S.md, marginBottom: S.md },
  linkTitle: { fontFamily: F.hSemi, fontSize: 14, color: C.accentDeep },
  rec: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: C.surface, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: "rgba(230,228,245,0.95)" },
  recOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  thumb: { width: 56, height: 68, borderRadius: 14, backgroundColor: C.accentSoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  serial: { fontFamily: F.h, fontSize: 18, color: C.accentDeep },
  recName: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
});
