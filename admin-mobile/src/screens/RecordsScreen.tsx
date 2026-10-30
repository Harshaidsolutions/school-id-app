import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Linking, RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import api, { apiImage, errMsg } from "../api/client";
import type { NamedCount, RecordFacets, Student, StudentsResponse } from "../shared/types";
import { isPhotoExcelField, sortFormFields, studentFieldDisplay, type FormFieldConfig } from "../shared/formFields";
import { configuredCategoryFields } from "../shared/formFieldHelpers";
import { useGrid } from "../ui/grid";
import { C, CONTENT_MAX, F, R, S } from "../theme";
import { Backdrop, Header } from "../ui/Screen";
import { Banner, Button, Check, Chips, Empty, Fab, IconButton, Loading, Muted, Pill, Rise, SearchBar, type IconName } from "../ui/kit";
import { ActionSheet, ImageViewer, OtpSheet, Select, Sheet } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { dayLabel, fmtDateTime, initials, num } from "../lib/format";
import { downloadFile } from "../lib/files";
import { fieldProblem } from "../lib/validate";
import type { ScreenProps } from "../navigation/types";
import {
  DeleteOptionsSheet,
  ExcelDownloadSheet,
  ExcelUploadSheet,
  PhotoDownloadSheet,
  PhotoImportSheet,
  RecordFormSheet,
  type CategoryField,
  type DeleteJob,
} from "./RecordSheets";

type Tab = "all" | "pending" | "captured" | "pending-data";

function norm(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function isIdentity(f: FormFieldConfig) {
  const n = norm(f.label);
  return f.key === "photo_id" || isPhotoExcelField(f) || n === "id" || n === "photoid" || n === "photonumber" || n === "photono";
}
function isName(f: FormFieldConfig) {
  const n = norm(f.label);
  return f.key === "student_name" || n === "name" || n === "studentname" || n === "membername";
}
function flags(s: Student, institute: boolean) {
  const photo = typeof s.pending_photo === "boolean" ? !s.pending_photo : Boolean(s.photo_url?.trim());
  const dataMissing = typeof s.pending_data === "boolean" ? s.pending_data : !s.student_name?.trim() || (!institute && !s.class_section?.trim());
  return { photo, dataMissing };
}

export function RecordsScreen({ route, navigation }: ScreenProps<"Records">) {
  const grid = useGrid();
  const { kind, id: orgId, name } = route.params;
  const institute = kind === "institute";
  const noun = institute ? "member" : "student";
  const insets = useSafeAreaInsets();

  const [students, setStudents] = useState<Student[]>([]);
  const [facets, setFacets] = useState<RecordFacets | null>(null);
  const [fields, setFields] = useState<FormFieldConfig[]>([]);
  const [batchCount, setBatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ classSection: "", photo: "", pendingData: "", capturedOn: "", group: "", designation: "", department: "" });
  const [visibility, setVisibility] = useState<"visible" | "hidden" | "all">("visible");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [form, setForm] = useState<{ record: Student | null } | null>(null);
  const [menu, setMenu] = useState<Student | null>(null);
  const [viewer, setViewer] = useState<{ index: number; signatureOf?: Student } | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sheet, setSheet] = useState<"excel-up" | "photos-up" | "excel-down" | "photos-down" | "delete" | "link" | null>(null);
  const [deleteJob, setDeleteJob] = useState<DeleteJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<{
    counts: Record<string, number>;
    signatureCounts: Record<string, number>;
    classes: NamedCount[];
    groups: NamedCount[];
    designations: NamedCount[];
    departments: NamedCount[];
  }>({ counts: {}, signatureCounts: {}, classes: [], groups: [], designations: [], departments: [] });
  const [parentLink, setParentLink] = useState<string | null>(null);

  const params = useMemo<Record<string, string>>(() => (institute ? { instituteId: orgId } : { schoolId: orgId }) as Record<string, string>, [institute, orgId]);

  const loadStudents = useCallback(async () => {
    try {
      const p: Record<string, string> = { ...params };
      if (filters.classSection) p.classSection = filters.classSection;
      if (filters.photo) p.photo = filters.photo === "uncaptured" ? "missing" : filters.photo;
      if (filters.pendingData) p.pendingData = filters.pendingData;
      if (filters.capturedOn) p.capturedOn = filters.capturedOn;
      if (filters.group) p.group = filters.group;
      if (filters.designation) p.designation = filters.designation;
      if (filters.department) p.department = filters.department;
      const { data } = await api.get<StudentsResponse>("/admin/students", { params: p });
      setStudents(data.students ?? []);
      if (data.facets) setFacets(data.facets);
      setError(null);
    } catch (e) {
      setError(errMsg(e, `Failed to load ${noun}s.`));
    } finally {
      setLoading(false);
    }
  }, [params, filters, noun]);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await api.get<{ fields: FormFieldConfig[]; importBatchCount?: number }>("/admin/form-config", { params });
      setBatchCount(data.importBatchCount ?? 0);
      setFields(Array.isArray(data.fields) && data.fields.length ? sortFormFields(data.fields) : []);
    } catch {
      setFields([]);
      setBatchCount(0);
    }
  }, [params]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useFocusEffect(
    useCallback(() => {
      void loadConfig();
    }, [loadConfig])
  );

  useEffect(() => {
    if (institute) return;
    void api
      .get<{ link: string | null }>(`/admin/schools/${orgId}/parent-link`)
      .then(({ data }) => setParentLink(data.link))
      .catch(() => undefined);
  }, [institute, orgId]);

  function loadCaptureCounts() {
    const base = institute ? `/admin/institutes/${orgId}` : `/admin/schools/${orgId}`;
    void api
      .get(`${base}/photo-capture-counts`)
      .then(({ data }) =>
        setCounts({
          counts: data.counts ?? {},
          signatureCounts: data.signatureCounts ?? {},
          classes: data.classes ?? data.categories ?? [],
          groups: data.groups ?? [],
          designations: data.designations ?? [],
          departments: data.departments ?? [],
        })
      )
      .catch(() => undefined);
  }

  const displayFields = useMemo(() => {
    let seenId = false;
    let seenName = false;
    const out: FormFieldConfig[] = [];
    for (const f of sortFormFields(fields).filter((x) => x.enabled)) {
      if (isIdentity(f)) {
        if (seenId) continue;
        seenId = true;
      } else if (isName(f)) {
        if (seenName) continue;
        seenName = true;
      }
      out.push(f);
    }
    return out;
  }, [fields]);
  const nameField = displayFields.find(isName);
  const idField = displayFields.find(isIdentity);
  const otherFields = displayFields.filter((f) => f !== nameField && f !== idField && f.key !== "signature_upload");
  /** Wrong phone numbers / emails count as pending data, like missing details. */
  const check = useCallback(
    (st0: Student) => {
      const base = flags(st0, institute);
      const problems = displayFields
        .map((fl) => fieldProblem(fl.key, fl.label, studentFieldDisplay(st0, fl.key, fl.label)))
        .filter((x): x is string => Boolean(x));
      return { ...base, dataMissing: base.dataMissing || problems.length > 0, problems };
    },
    [displayFields, institute]
  );

  const categoryFields: CategoryField[] = useMemo(
    () =>
      configuredCategoryFields(fields).map((f) => {
        const source =
          f.kind === "group"
            ? counts.groups.length ? counts.groups : facets?.groups ?? []
            : f.kind === "designation"
              ? counts.designations.length ? counts.designations : facets?.designations ?? []
              : f.kind === "department"
                ? counts.departments.length ? counts.departments : facets?.departments ?? []
                : counts.classes.length ? counts.classes : facets?.classes ?? [];
        return { label: f.label, key: f.key, options: source.filter((o) => !o.key || o.key === f.key || (f.kind === "class" && o.key === "class_section")) };
      }),
    [fields, facets, counts]
  );

  const classOptions = useMemo(() => {
    const fromFacets = facets?.classes.map((c) => c.name) ?? [];
    if (fromFacets.length) return fromFacets;
    return [...new Set(students.map((s) => s.class_section).filter((c): c is string => Boolean(c)))].sort();
  }, [facets, students]);

  const visibleStudents = useMemo(
    () => students.filter((s) => (visibility === "all" ? true : visibility === "visible" ? s.app_visible !== false : s.app_visible === false)),
    [students, visibility]
  );

  const tabCounts = useMemo(() => {
    let pending = 0;
    let pendingData = 0;
    let captured = 0;
    for (const s of visibleStudents) {
      const f = check(s);
      if (f.photo) captured++;
      else pending++;
      if (f.dataMissing) pendingData++;
    }
    return { all: visibleStudents.length, pending, captured, "pending-data": pendingData };
  }, [visibleStudents, check]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visibleStudents.filter((s) => {
      const f = check(s);
      if (!filters.photo && tab === "pending" && f.photo) return false;
      if (!filters.photo && tab === "captured" && !f.photo) return false;
      if (tab === "pending-data" && !f.dataMissing) return false;
      if (q) {
        const hay = [s.student_name, s.roll_no, s.parent_name, s.parent_phone, s.class_section, s.address, s.photo_id, ...Object.values(s.extra_fields ?? {})].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visibleStudents, tab, search, filters.photo, check]);

  const photoList = useMemo(() => filtered.filter((s) => s.photo_url), [filtered]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length + (visibility !== "visible" ? 1 : 0);
  const selectedIds = filtered.filter((s) => selected.has(s.id)).map((s) => s.id);

  async function refresh() {
    setRefreshing(true);
    await Promise.all([loadStudents(), loadConfig()]);
    setRefreshing(false);
  }

  async function changeVisibility(ids: string[], visible: boolean) {
    if (!ids.length) return;
    setBusy(true);
    try {
      await api.patch("/admin/students/visibility", { ids, visible });
      setStudents((a) => a.map((v) => (ids.includes(v.id) ? { ...v, app_visible: visible } : v)));
      setSelected(new Set());
      setNotice(visible ? "Shown in the school app." : "Hidden from the school app.");
    } catch (e) {
      setError(errMsg(e, "Could not update visibility."));
    } finally {
      setBusy(false);
    }
  }

  async function deletePhoto(s: Student) {
    try {
      const { data } = await api.delete<{ student: Student }>(`/admin/students/${s.id}/photo`);
      setStudents((p) => p.map((x) => (x.id === s.id ? { ...x, ...data.student } : x)));
      setNotice("Photo deleted.");
    } catch (e) {
      setError(errMsg(e, "Failed to delete photo."));
    }
  }

  async function deleteRecord(s: Student) {
    try {
      await api.delete(`/admin/students/${s.id}`);
      setStudents((p) => p.filter((x) => x.id !== s.id));
      setNotice(`${noun[0].toUpperCase() + noun.slice(1)} deleted.`);
    } catch (e) {
      setError(errMsg(e, `Failed to delete ${noun}.`));
    }
  }

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

  const base = institute ? `/admin/institutes/${orgId}` : `/admin/schools/${orgId}`;
  const shareText = (link: string) => `My School ID Card – Student details collection link for ${name}\n\nPlease fill in your child's details using this link:\n${link}`;

  const orgQuery = `${institute ? "instituteId" : "schoolId"}=${orgId}&${institute ? "instituteName" : "schoolName"}=${encodeURIComponent(name)}`;
  type Tool = { label: string; icon: IconName; sub?: string; onPress: () => void; hidden?: boolean; danger?: boolean; feature?: boolean };
  /** Same buttons, order and names as the website's records toolbar. */
  const tools: Tool[] = [
    { label: "Form Setup", icon: "list-outline", sub: batchCount ? "Fields, order and visibility" : "Upload Excel first", onPress: () => (batchCount ? navigation.navigate("FormSetup", { kind, id: orgId, name }) : setError("Upload an Excel file first, then use Form Setup.")) },
    { label: "Upload Excel", icon: "document-attach-outline", sub: "Import or replace the list", onPress: () => setSheet("excel-up") },
    { label: "Upload Photos", icon: "images-outline", sub: "ZIP named by photo number", onPress: () => setSheet("photos-up") },
    { label: "Download Excel", icon: "download-outline", sub: "All, captured, pending, date-wise…", onPress: () => setSheet("excel-down") },
    {
      label: "Download Photos",
      icon: "cloud-download-outline",
      sub: "ZIP of photos or signatures",
      onPress: () => {
        loadCaptureCounts();
        setSheet("photos-down");
      },
    },
    { label: institute ? "Institution Info" : "School Info", icon: "information-circle-outline", sub: "Logo, signature, model, template", onPress: () => navigation.navigate("OrgInfo", { kind, id: orgId, name }) },
    {
      label: "Delete Options",
      icon: "trash-bin-outline",
      danger: true,
      onPress: () => {
        loadCaptureCounts();
        setSheet("delete");
      },
    },
    { label: "Cropping Tool", icon: "crop-outline", feature: true, sub: "Crop and straighten photos", onPress: () => navigation.navigate("WebTool", { title: "Cropping Tool", path: `/crop-tool?${orgQuery}` }) },
    { label: "ID Card Generator", icon: "card-outline", feature: true, sub: "Generate and print ID cards", onPress: () => navigation.navigate("WebTool", { title: "ID Card Generator", path: `/id-card-generator?${orgQuery}` }) },
    { label: "Link", icon: "link-outline", sub: "Parent form link", hidden: institute, onPress: () => setSheet("link") },
  ];

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function askDelete(item: Student) {
    const buttons: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [{ text: "Cancel", style: "cancel" }];
    if (item.photo_url) buttons.push({ text: "Delete photo", style: "destructive", onPress: () => void deletePhoto(item) });
    buttons.push({ text: "Delete data", style: "destructive", onPress: () => void deleteRecord(item) });
    Alert.alert(`Delete ${noun}`, `${item.student_name ?? ""}\nDelete only the photo, or the full record (details and photo)?`, buttons);
  }

  /** One record = one card. Every column the website table shows is listed as “label: value”. */
  const renderItem = ({ item, index }: { item: Student; index: number }) => {
    const f = check(item);
    const on = selected.has(item.id);
    const idText = idField ? studentFieldDisplay(item, idField.key, idField.label) : item.photo_id ?? "";
    const title = nameField ? studentFieldDisplay(item, nameField.key, nameField.label) : item.student_name ?? "—";
    const hidden = item.app_visible === false;
    const created = item.photo_url?.trim() ? item.photo_captured_at : null;
    return (
      <Rise delay={Math.min(index, 10) * 25} style={grid.item}>
        <Tap
          scaleTo={0.99}
          onPress={() => (selecting ? toggleSelect(item.id) : setForm({ record: item }))}
          onLongPress={() => {
            setSelecting(true);
            setSelected(new Set([item.id]));
          }}
          style={[st.rec, on && st.recOn, hidden && { opacity: 0.75 }]}
        >
          <View style={st.recTop}>
            {selecting ? <Check checked={on} onPress={() => toggleSelect(item.id)} /> : <Text style={st.sno}>{index + 1}</Text>}
            <Tap
              onPress={() => (item.photo_url ? setViewer({ index: Math.max(0, photoList.findIndex((p) => p.id === item.id)) }) : setForm({ record: item }))}
              style={st.thumb}
              accessibilityLabel={item.photo_url ? "View photo" : "No photo captured"}
            >
              {item.photo_url ? (
                <Image source={apiImage(`/admin/students/${item.id}/photo?thumb=1&v=${encodeURIComponent(item.updated_at ?? "")}`)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={item.id} />
              ) : (
                <Text style={st.thumbText}>{initials(title)}</Text>
              )}
            </Tap>
            <View style={{ flex: 1 }}>
              <Text style={st.recName} numberOfLines={2}>
                {title || "—"}
              </Text>
              {idText && idText !== "—" ? <Text style={st.recId}>{idField?.label ?? "Photo No"}: {idText}</Text> : null}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                <Pill text={f.photo ? "Captured" : "Pending"} tone={f.photo ? "green" : "amber"} icon={f.photo ? "checkmark-circle" : "time"} />
                {f.problems.length ? <Pill text="Wrong data" tone="red" icon="alert-circle" /> : f.dataMissing ? <Pill text="Pending data" tone="red" /> : null}
                {hidden ? <Pill text="Hidden" tone="grey" icon="eye-off" /> : null}
              </View>
            </View>
          </View>
          <View style={st.fields}>
            {otherFields.map((fl) => {
              const v = studentFieldDisplay(item, fl.key, fl.label) || "—";
              const bad = fieldProblem(fl.key, fl.label, v);
              return (
                <View key={fl.key} style={st.fieldRow}>
                  <Text style={st.fieldLabel} numberOfLines={1}>
                    {fl.label}
                  </Text>
                  <Text style={[st.fieldValue, bad ? { color: C.danger } : null]} numberOfLines={2}>
                    {v}
                    {bad ? "  ⚠ wrong" : ""}
                  </Text>
                </View>
              );
            })}
            <View style={st.fieldRow}>
              <Text style={st.fieldLabel}>Created</Text>
              <Text style={st.fieldValue}>{created ? fmtDateTime(created) : "—"}</Text>
            </View>
          </View>
          {!selecting ? (
            <View style={st.recActions}>
              <IconButton icon={hidden ? "eye-off-outline" : "eye-outline"} label={hidden ? "Show in school app" : "Hide in school app"} size={38} bg={C.primarySoft} color={C.primary} disabled={busy} onPress={() => void changeVisibility([item.id], hidden)} />
              <IconButton
                icon="download-outline"
                label="Download photo"
                size={38}
                bg={C.primarySoft}
                color={C.primary}
                disabled={!item.photo_url || busy}
                onPress={() => void run("Failed to download photo.", () => downloadFile(`/admin/students/${item.id}/photo`, `${item.photo_id ?? item.student_name ?? "photo"}.jpg`))}
              />
              {item.signature_url ? (
                <IconButton icon="create-outline" label="View signature" size={38} bg={C.primarySoft} color={C.primary} onPress={() => setViewer({ index: 0, signatureOf: item })} />
              ) : null}
              <View style={{ flex: 1 }} />
              <Button small variant="secondary" icon="pencil-outline" title="Edit" onPress={() => setForm({ record: item })} />
              <IconButton icon="trash-outline" label={`Delete ${noun}`} size={38} bg={C.dangerSoft} color={C.danger} onPress={() => askDelete(item)} />
            </View>
          ) : null}
        </Tap>
      </Rise>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header
        title={institute ? "Members" : "Students"}
        subtitle={name}
        right={
          <>
            <IconButton icon="construct-outline" label="Tools" color={C.white} bg="rgba(255,255,255,0.22)" onPress={() => setToolsOpen(true)} />
            <IconButton
              icon={selecting ? "close" : "checkbox-outline"}
              label={selecting ? "Cancel selection" : "Select"}
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
            <SearchBar value={search} onChange={setSearch} placeholder={`Search ${noun}s…`} />
          </View>
          <IconButton icon="options-outline" label="Filters" size={46} bg={C.white} color={C.primaryDeep} badge={activeFilterCount} onPress={() => setFilterOpen(true)} />
        </View>
      </Header>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.toolbarWrap} contentContainerStyle={st.toolbar}>
        {tools
          .filter((t) => !t.hidden)
          .map((t) => (
            <Tap key={t.label} onPress={t.onPress} scaleTo={0.95} style={[st.tool, t.feature && st.toolFeature, t.label === "ID Card Generator" && st.toolFeature2, t.danger && st.toolDanger]}>
              <View style={[st.toolIcon, t.feature && { backgroundColor: "rgba(255,255,255,0.22)" }, t.danger && { backgroundColor: "#FFE4E9" }]}>
                <Ionicons name={t.icon} size={18} color={t.feature ? C.white : t.danger ? C.danger : C.primary} />
              </View>
              <Text style={[st.toolText, t.feature && { color: C.white }, t.danger && { color: C.danger }]} numberOfLines={2}>
                {t.label}
              </Text>
            </Tap>
          ))}
      </ScrollView>
      <View style={st.tabs}>
        <Chips<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { key: "all", label: "All", count: tabCounts.all },
            { key: "pending", label: "Pending", count: tabCounts.pending },
            { key: "captured", label: "Captured", count: tabCounts.captured },
            { key: "pending-data", label: "Pending data", count: tabCounts["pending-data"] },
          ]}
        />
      </View>

      {selecting ? (
        <View style={st.selectBar}>
          <Check
            checked={filtered.length > 0 && selectedIds.length === filtered.length}
            onPress={() => setSelected(selectedIds.length === filtered.length ? new Set() : new Set(filtered.map((s) => s.id)))}
            label={`${selectedIds.length} selected`}
          />
          <View style={{ flexDirection: "row", gap: 6 }}>
            <IconButton icon="eye-off-outline" label="Hide from school app" size={38} bg={C.accentSoft} color={C.accentDeep} disabled={!selectedIds.length || busy} onPress={() => void changeVisibility(selectedIds, false)} />
            <IconButton icon="eye-outline" label="Show in school app" size={38} bg={C.accentSoft} color={C.accentDeep} disabled={!selectedIds.length || busy} onPress={() => void changeVisibility(selectedIds, true)} />
            <IconButton icon="trash-outline" label="Delete selected" size={38} bg={C.dangerSoft} color={C.danger} disabled={!selectedIds.length} onPress={() => setBulkDeleteOpen(true)} />
          </View>
        </View>
      ) : null}

      {loading ? (
        <Loading text={`Loading ${noun}s…`} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          numColumns={grid.cols}
          key={`grid${grid.cols}`}
          columnWrapperStyle={grid.wrap}
          renderItem={renderItem}
          initialNumToRender={14}
          windowSize={9}
          contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 120, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} colors={[C.primary]} />}
          ListHeaderComponent={
            <>
              <Banner text={error} onClose={() => setError(null)} />
              <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
              {!batchCount && !students.length ? (
                <Banner tone="amber" text={`Start by uploading the Excel list of ${noun}s (Tools → Upload Excel).`} />
              ) : null}
            </>
          }
          ListEmptyComponent={
            <Empty
              icon="people-outline"
              title={search || activeFilterCount ? "No matches" : `No ${noun}s yet`}
              text={search || activeFilterCount ? "Try another search or clear the filters." : "Upload an Excel file or add one by one."}
              action={!students.length ? <Button title="Upload Excel" icon="document-attach-outline" onPress={() => setSheet("excel-up")} /> : undefined}
            />
          }
        />
      )}

      {!selecting ? <Fab label={`Add ${noun}`} onPress={() => setForm({ record: null })} /> : null}

      <ActionSheet visible={toolsOpen} onClose={() => setToolsOpen(false)} title={`${name} tools`} actions={tools} />

      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.student_name ?? noun}
        actions={
          menu
            ? [
                { label: "Edit details", icon: "create-outline", onPress: () => setForm({ record: menu }) },
                { label: "View photo", icon: "image-outline", hidden: !menu.photo_url, onPress: () => setViewer({ index: Math.max(0, photoList.findIndex((p) => p.id === menu.id)) }) },
                { label: "View signature", icon: "create-outline", hidden: !menu.signature_url, onPress: () => setViewer({ index: 0, signatureOf: menu }) },
                {
                  label: "Download photo",
                  icon: "download-outline",
                  hidden: !menu.photo_url,
                  onPress: () => void run("Failed to download photo.", () => downloadFile(`/admin/students/${menu.id}/photo`, `${menu.photo_id ?? menu.student_name ?? "photo"}.jpg`)),
                },
                {
                  label: menu.app_visible === false ? "Show in school app" : "Hide from school app",
                  icon: menu.app_visible === false ? "eye-outline" : "eye-off-outline",
                  onPress: () => void changeVisibility([menu.id], menu.app_visible === false),
                },
                {
                  label: "Call parent",
                  icon: "call-outline",
                  hidden: !menu.parent_phone,
                  onPress: () => void Linking.openURL(`tel:${menu.parent_phone}`),
                },
                {
                  label: "Delete photo only",
                  icon: "image-outline",
                  danger: true,
                  hidden: !menu.photo_url,
                  onPress: () =>
                    Alert.alert("Delete photo?", "The photo will be removed. The details stay.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void deletePhoto(menu) },
                    ]),
                },
                {
                  label: `Delete ${noun}`,
                  icon: "trash-outline",
                  danger: true,
                  onPress: () =>
                    Alert.alert(`Delete ${noun}?`, "The details and photo will be permanently deleted.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void deleteRecord(menu) },
                    ]),
                },
              ]
            : []
        }
      />

      <RecordFormSheet
        visible={Boolean(form)}
        onClose={() => setForm(null)}
        record={form?.record ?? null}
        orgKind={kind}
        orgId={orgId}
        formFields={fields}
        classOptions={classOptions}
        onSaved={(s, isNew) => {
          setStudents((p) => (isNew ? [s, ...p.filter((x) => x.id !== s.id)] : p.map((x) => (x.id === s.id ? { ...x, ...s } : x))));
          setNotice(isNew ? `${noun[0].toUpperCase() + noun.slice(1)} added.` : "Changes saved.");
        }}
      />

      <ImageViewer
        visible={Boolean(viewer)}
        onClose={() => setViewer(null)}
        index={viewer?.index ?? 0}
        onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
        items={
          viewer?.signatureOf
            ? [{ title: `${viewer.signatureOf.student_name ?? ""} · Signature`, source: apiImage(`/admin/students/${viewer.signatureOf.id}/signature`) }]
            : photoList.map((s) => ({
                title: s.student_name ?? "Photo",
                sub: [s.photo_id, s.class_section].filter(Boolean).join(" · "),
                source: apiImage(`/admin/students/${s.id}/photo?v=${encodeURIComponent(s.updated_at ?? "")}`),
              }))
        }
      />

      <Sheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filters"
        footer={
          <View style={{ flexDirection: "row", gap: S.sm }}>
            <Button
              title="Clear all"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                setFilters({ classSection: "", photo: "", pendingData: "", capturedOn: "", group: "", designation: "", department: "" });
                setVisibility("visible");
              }}
            />
            <Button title="Show results" style={{ flex: 1.4 }} onPress={() => setFilterOpen(false)} />
          </View>
        }
      >
        <Select label="School app visibility" value={visibility} onChange={(v) => setVisibility(v as typeof visibility)} options={[{ value: "visible", label: "Visible records" }, { value: "hidden", label: "Hidden records" }, { value: "all", label: "All records" }]} />
        <Select label="Photo" value={filters.photo} onChange={(v) => setFilters((f) => ({ ...f, photo: v }))} options={[{ value: "", label: "Any" }, { value: "captured", label: "Captured" }, { value: "uncaptured", label: "Not captured" }]} />
        <Select label="Pending data" value={filters.pendingData} onChange={(v) => setFilters((f) => ({ ...f, pendingData: v }))} options={[{ value: "", label: "Any" }, { value: "yes", label: "Has missing data" }, { value: "no", label: "Complete" }]} />
        <Select label="Captured on" value={filters.capturedOn} onChange={(v) => setFilters((f) => ({ ...f, capturedOn: v }))} options={[{ value: "", label: "Any date" }, ...(facets?.captureDates ?? []).map((d) => ({ value: d.name, label: `${dayLabel(d.name)} (${d.count})` }))]} />
        {classOptions.length ? (
          <Select label="Class" value={filters.classSection} onChange={(v) => setFilters((f) => ({ ...f, classSection: v }))} options={[{ value: "", label: "All classes" }, ...(facets?.classes ?? classOptions.map((c) => ({ name: c, count: 0, key: "" }))).map((c) => ({ value: c.name, label: c.count ? `${c.name} (${c.count})` : c.name }))]} searchable />
        ) : null}
        {facets?.groups?.length ? <Select label="Group" value={filters.group} onChange={(v) => setFilters((f) => ({ ...f, group: v }))} options={[{ value: "", label: "All groups" }, ...facets.groups.map((g) => ({ value: g.name, label: `${g.name} (${g.count})` }))]} /> : null}
        {facets?.designations?.length ? <Select label="Designation" value={filters.designation} onChange={(v) => setFilters((f) => ({ ...f, designation: v }))} options={[{ value: "", label: "All designations" }, ...facets.designations.map((g) => ({ value: g.name, label: `${g.name} (${g.count})` }))]} /> : null}
        {facets?.departments?.length ? <Select label="Department" value={filters.department} onChange={(v) => setFilters((f) => ({ ...f, department: v }))} options={[{ value: "", label: "All departments" }, ...facets.departments.map((g) => ({ value: g.name, label: `${g.name} (${g.count})` }))]} /> : null}
      </Sheet>

      <ExcelUploadSheet visible={sheet === "excel-up"} onClose={() => setSheet(null)} target={params} onDone={() => void refresh()} />
      <PhotoImportSheet visible={sheet === "photos-up"} onClose={() => setSheet(null)} orgId={orgId} kind={kind} onDone={() => void refresh()} />
      <ExcelDownloadSheet
        visible={sheet === "excel-down"}
        onClose={() => setSheet(null)}
        busy={busy}
        captureDates={facets?.captureDates ?? []}
        categoryFields={categoryFields}
        counts={{
          all: students.length,
          captured: students.filter((s) => s.photo_url?.trim()).length,
          pending: students.filter((s) => !s.photo_url?.trim()).length,
          "captured-pending-data": students.filter((s) => s.photo_url?.trim() && s.pending_data).length,
          "uncaptured-pending-data": students.filter((s) => !s.photo_url?.trim() && s.pending_data).length,
        }}
        onDownload={(job) =>
          void run("Failed to download Excel.", () =>
            downloadFile(
              institute ? `/admin/institutes/${orgId}/export-members` : `/admin/students/${orgId}/export`,
              `${name}-${job.scope}.xlsx`,
              { scope: job.scope, date: job.date, classSection: job.classSection, fieldKey: job.fieldKey }
            )
          )
        }
      />
      <PhotoDownloadSheet
        visible={sheet === "photos-down"}
        onClose={() => setSheet(null)}
        busy={busy}
        photoCounts={counts.counts}
        categoryFields={categoryFields}
        showSignature={fields.some((f) => f.key === "signature_upload" && f.enabled) && Object.values(counts.signatureCounts).some((c) => c > 0)}
        onDownload={(job) =>
          void run("Failed to download files.", () =>
            downloadFile(`${base}/download-photos`, `${name}-${job.asset === "signature" ? "signatures" : "photos"}.zip`, {
              asset: job.asset === "signature" ? "signature" : undefined,
              date: job.date,
              classSection: job.classSection,
              fieldKey: job.fieldKey,
            })
          )
        }
      />
      <DeleteOptionsSheet
        visible={sheet === "delete"}
        onClose={() => setSheet(null)}
        photoCounts={counts.counts}
        categoryFields={categoryFields}
        counts={{
          allPhotos: students.filter((s) => s.photo_url?.trim()).length,
          allData: students.length,
          capturedData: students.filter((s) => s.photo_url?.trim()).length,
          uncapturedData: students.filter((s) => !s.photo_url?.trim()).length,
        }}
        onChoose={(job) => {
          setSheet(null);
          setTimeout(() => setDeleteJob(job), 450);
        }}
      />
      <OtpSheet
        visible={Boolean(deleteJob)}
        title={deleteJob?.label ?? ""}
        description={`${deleteJob?.label ?? ""} for ${name}. This cannot be undone.`}
        confirmLabel={deleteJob?.label ?? "Delete"}
        onClose={() => setDeleteJob(null)}
        onRequest={async () => (await api.post(`${base}/${deleteJob!.kind === "data" ? "request-delete-excel-otp" : "request-delete-photos-otp"}`)).data}
        onConfirm={async (otp) => {
          const job = deleteJob!;
          await api.delete(job.kind === "data" ? `${base}/students` : `${base}/photos`, {
            data: {
              otp,
              date: job.date,
              classSection: job.classSection,
              fieldKey: job.fieldKey,
              dataScope: job.kind === "photos" ? (job.photoScope === "pending" ? "uncaptured" : job.photoScope === "captured" ? "captured" : undefined) : job.dataScope,
              asset: job.kind === "photos" ? "photos" : undefined,
            },
          });
          await refresh();
          setNotice("Deleted.");
        }}
      />
      <OtpSheet
        visible={bulkDeleteOpen}
        title={`Delete ${selectedIds.length} ${noun}(s)`}
        description={`The selected ${noun}s and their photos will be permanently deleted.`}
        confirmLabel="Delete selected"
        onClose={() => setBulkDeleteOpen(false)}
        onRequest={async () => (await api.post("/admin/students/bulk-delete/request-otp", { ids: selectedIds, ...params })).data}
        onConfirm={async (otp) => {
          const { data } = await api.post<{ deleted?: string[] }>("/admin/students/bulk-delete", { ids: selectedIds, otp, ...params });
          const gone = new Set(data.deleted ?? selectedIds);
          setStudents((p) => p.filter((s) => !gone.has(s.id)));
          setSelected(new Set());
          setSelecting(false);
        }}
      />
      <Sheet visible={sheet === "link"} onClose={() => setSheet(null)} title="Parent form link" subtitle="Parents open this link to fill in their child's details.">
        {parentLink ? (
          <>
            <View style={st.linkBox}>
              <Text selectable style={st.linkText}>
                {parentLink}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: S.sm }}>
              <Button title="Copy" variant="secondary" icon="copy-outline" style={{ flex: 1 }} onPress={() => void Clipboard.setStringAsync(shareText(parentLink)).then(() => setNotice("Message with link copied."))} />
              <Button title="Share" icon="share-social-outline" style={{ flex: 1 }} onPress={() => void Share.share({ message: shareText(parentLink) })} />
            </View>
            <Button title="WhatsApp" variant="soft" icon="logo-whatsapp" style={{ marginTop: S.sm }} onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText(parentLink))}`)} />
          </>
        ) : (
          <Button
            title="Create link"
            icon="link-outline"
            loading={busy}
            onPress={() =>
              void run("Could not create link.", async () => {
                const { data } = await api.post<{ link: string }>(`/admin/schools/${orgId}/parent-link`);
                setParentLink(data.link);
                setSheet("link");
              })
            }
          />
        )}
        <Muted style={{ marginTop: S.md }}>Turn the link on or off for the school app in Form setup.</Muted>
      </Sheet>
    </View>
  );
}

const st = StyleSheet.create({
  tabs: { paddingHorizontal: S.lg, paddingTop: S.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" },
  selectBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: S.lg, paddingVertical: S.sm, marginTop: S.sm, backgroundColor: C.white, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line },
  toolbarWrap: { flexGrow: 0, flexShrink: 0, height: 100 },
  toolbar: { gap: S.sm, paddingHorizontal: S.lg, paddingTop: S.md, paddingBottom: 4, alignItems: "stretch" },
  tool: { width: 92, height: 84, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 6, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  toolIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center" },
  toolFeature: { backgroundColor: C.primary, borderColor: C.primary },
  toolFeature2: { backgroundColor: C.danger, borderColor: C.danger },
  toolDanger: { borderColor: "#FECDD6", backgroundColor: C.dangerSoft },
  toolText: { fontFamily: F.bodySemi, fontSize: 11, lineHeight: 14, color: C.ink, textAlign: "center" },
  recTop: { flexDirection: "row", alignItems: "center", gap: S.md },
  sno: { width: 24, textAlign: "center", fontFamily: F.bodySemi, fontSize: 12, color: C.muted },
  recId: { fontFamily: F.bodyMed, fontSize: 12, color: C.primary, marginTop: 2 },
  fields: { marginTop: S.md, backgroundColor: "#FAFAFF", borderRadius: 12, paddingHorizontal: S.md, paddingVertical: 4, borderWidth: 1, borderColor: C.line },
  fieldRow: { flexDirection: "row", gap: S.sm, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  fieldLabel: { width: "40%", fontFamily: F.bodySemi, fontSize: 12, color: C.muted },
  fieldValue: { flex: 1, fontFamily: F.bodyMed, fontSize: 13, color: C.ink },
  recActions: { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md },
  rec: { backgroundColor: C.surface, borderRadius: R.lg, padding: S.md, marginBottom: S.sm, borderWidth: 1, borderColor: "rgba(230,228,245,0.95)" },
  recOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  thumb: { width: 58, height: 70, borderRadius: 14, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  thumbText: { fontFamily: F.h, fontSize: 18, color: C.primaryDeep },
  recName: { fontFamily: F.hSemi, fontSize: 15, color: C.ink },
  linkBox: { backgroundColor: C.white, borderRadius: R.md, padding: S.md, borderWidth: 1, borderColor: C.line, marginBottom: S.md },
  linkText: { fontFamily: F.bodyMed, fontSize: 14, color: C.accentDeep },
});
