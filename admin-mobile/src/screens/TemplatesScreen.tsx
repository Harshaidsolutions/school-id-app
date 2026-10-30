import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { apiImage, authedSource, errMsg } from "../api/client";
import { TEMPLATE_TABS, type Template, type TemplateOrientation } from "../shared/types";
import { tileCols } from "../ui/grid";
import { C, CONTENT_MAX, F, R, S } from "../theme";
import { Backdrop, Header } from "../ui/Screen";
import { Banner, Button, Chips, Empty, Fab, Field, Loading, Muted, SearchBar } from "../ui/kit";
import { ActionSheet, ImageViewer, Select, Sheet } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { DOC_TYPES, asFormFile, pickDocuments, pickImages, sizeOk, type PickedFile } from "../lib/files";
import { fmtDate } from "../lib/format";

type TabKey = TemplateOrientation | "all";
const isPdf = (u?: string | null) => Boolean(u && /\.pdf(\?|$)/i.test(u));
const labelOf = (o?: string | null) => TEMPLATE_TABS.find((t) => t.key === o)?.label ?? o ?? "";

function thumbSource(t: Template, page = 1) {
  return isPdf(t.image_url) ? apiImage(`/admin/id-generator/template-image/${t.id}?page=${page}`) : authedSource(t.image_url);
}

export function TemplatesScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cols = tileCols(width);
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<Template | null>(null);
  const [preview, setPreview] = useState<{ t: Template; index: number } | null>(null);
  const [upload, setUpload] = useState(false);
  const [rename, setRename] = useState<Template | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ templates: Template[] }>("/admin/templates");
      setItems(data.templates ?? []);
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to load templates."));
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((t) => (tab === "all" || t.orientation === tab) && (!q || t.name.toLowerCase().includes(q)));
  }, [items, tab, search]);

  async function remove(t: Template) {
    try {
      await api.delete(`/admin/templates/${t.id}`);
      setItems((p) => p.filter((x) => x.id !== t.id));
      setNotice("Template deleted.");
    } catch (e) {
      setError(errMsg(e, "Delete failed."));
    }
  }

  const tileW = (Math.min(width, CONTENT_MAX) - S.lg * 2 - S.md * (cols - 1)) / cols;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header title="Templates" subtitle={`${items.length} templates`}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search templates…" />
      </Header>
      <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}>
        <Chips<TabKey>
          value={tab}
          onChange={setTab}
          items={[{ key: "all", label: "All", count: items.length }, ...TEMPLATE_TABS.map((t) => ({ key: t.key as TabKey, label: t.label.replace("Vertical", "Vert.").replace("Horizontal", "Horiz."), count: items.filter((i) => i.orientation === t.key).length }))]}
        />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          key={cols}
          data={list}
          numColumns={cols}
          keyExtractor={(t) => t.id}
          columnWrapperStyle={{ gap: S.md }}
          contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + 120, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}
          refreshControl={<RefreshControl refreshing={refreshing} colors={[C.primary]} onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }} />}
          ListHeaderComponent={
            <>
              <Banner text={error} onClose={() => setError(null)} />
              <Banner text={notice} tone="green" onClose={() => setNotice(null)} />
            </>
          }
          ListEmptyComponent={<Empty icon="albums-outline" title="No templates here" text="Upload JPG, PNG or PDF card designs." />}
          renderItem={({ item }) => (
            <Tap onPress={() => setPreview({ t: item, index: 0 })} onLongPress={() => setMenu(item)} style={[st.tile, { width: tileW }]}>
              <View style={[st.img, item.orientation?.startsWith("horizontal") ? { aspectRatio: 1.58 } : { aspectRatio: 0.63 }]}>
                <Image source={thumbSource(item)} style={StyleSheet.absoluteFill} contentFit="contain" transition={150} />
                {isPdf(item.image_url) ? (
                  <View style={st.pdf}>
                    <Text style={st.pdfText}>PDF</Text>
                  </View>
                ) : null}
              </View>
              <View style={st.foot}>
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Muted numberOfLines={1} style={{ fontSize: 11 }}>
                    {labelOf(item.orientation)} · {fmtDate(item.created_at)}
                  </Muted>
                </View>
                <Tap onPress={() => setMenu(item)} hitSlop={8} accessibilityLabel="More">
                  <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
                </Tap>
              </View>
            </Tap>
          )}
        />
      )}
      <Fab label="Upload" icon="cloud-upload-outline" onPress={() => setUpload(true)} />

      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                { label: "Preview", icon: "eye-outline", onPress: () => setPreview({ t: menu, index: 0 }) },
                { label: "Rename / change type", icon: "create-outline", onPress: () => setRename(menu) },
                {
                  label: "Delete template",
                  icon: "trash-outline",
                  danger: true,
                  onPress: () =>
                    Alert.alert("Delete template?", menu.name, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void remove(menu) },
                    ]),
                },
              ]
            : []
        }
      />
      <ImageViewer
        visible={Boolean(preview)}
        onClose={() => setPreview(null)}
        index={preview?.index ?? 0}
        onIndex={(i) => setPreview((p) => (p ? { ...p, index: i } : p))}
        items={
          preview
            ? isPdf(preview.t.image_url)
              ? [
                  { title: preview.t.name, sub: "Front", source: thumbSource(preview.t, 1) },
                  { title: preview.t.name, sub: "Back", source: thumbSource(preview.t, 2) },
                ]
              : [{ title: preview.t.name, sub: labelOf(preview.t.orientation), source: thumbSource(preview.t) }]
            : []
        }
      />
      <UploadSheet
        visible={upload}
        defaultOrientation={tab === "all" ? "vertical_single" : tab}
        onClose={() => setUpload(false)}
        onDone={(n) => {
          setUpload(false);
          setNotice(`${n} template(s) uploaded.`);
          void load();
        }}
      />
      <RenameSheet
        t={rename}
        onClose={() => setRename(null)}
        onDone={() => {
          setRename(null);
          void load();
        }}
      />
    </View>
  );
}

function UploadSheet({ visible, defaultOrientation, onClose, onDone }: { visible: boolean; defaultOrientation: string; onClose: () => void; onDone: (n: number) => void }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [orientation, setOrientation] = useState(defaultOrientation);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setFiles([]);
      setOrientation(defaultOrientation);
      setError(null);
      setProgress(null);
    }
  }
  async function go() {
    if (!files.length) return;
    if (files.some((f) => !sizeOk(f, 20))) return setError("Each file must be under 20 MB.");
    setBusy(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setProgress(`Uploading ${i + 1} of ${files.length}: ${f.name}`);
        const form = new FormData();
        form.append("name", f.name.replace(/\.[^.]+$/, "").trim() || f.name);
        form.append("orientation", orientation);
        form.append("image", asFormFile(f));
        await api.post("/admin/templates", form, { timeout: 300000 });
      }
      onDone(files.length);
    } catch (e) {
      setError(errMsg(e, "Upload failed."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }
  return (
    <Sheet visible={visible} onClose={onClose} title="Upload templates" subtitle="JPG, PNG or PDF (PDF page 1 = front, page 2 = back)" footer={<Button title={files.length ? `Upload ${files.length}` : "Upload"} icon="cloud-upload-outline" onPress={() => void go()} loading={busy} disabled={!files.length} />}>
      <Banner text={error} />
      {progress ? <Banner text={progress} tone="blue" /> : null}
      <Select label="Card type" value={orientation} onChange={setOrientation} options={TEMPLATE_TABS.map((t) => ({ value: t.key, label: t.label }))} />
      <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.md }}>
        <Button title="Gallery images" variant="soft" icon="images-outline" style={{ flex: 1 }} onPress={async () => setFiles(await pickImages(true))} />
        <Button title="Files / PDF" variant="soft" icon="document-outline" style={{ flex: 1 }} onPress={async () => setFiles(await pickDocuments(DOC_TYPES.imageOrPdf, true))} />
      </View>
      {files.map((f) => (
        <Muted key={f.uri}>• {f.name}</Muted>
      ))}
    </Sheet>
  );
}

function RenameSheet({ t, onClose, onDone }: { t: Template | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [orientation, setOrientation] = useState("vertical_single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if ((t?.id ?? null) !== lastId) {
    setLastId(t?.id ?? null);
    setName(t?.name ?? "");
    setOrientation(t?.orientation ?? "vertical_single");
    setError(null);
  }
  async function save() {
    if (!t || !name.trim()) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("orientation", orientation);
      form.append("config_json", typeof t.config_json === "string" ? t.config_json : JSON.stringify(t.config_json ?? {}));
      await api.put(`/admin/templates/${t.id}`, form);
      onDone();
    } catch (e) {
      setError(errMsg(e, "Could not save."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet visible={Boolean(t)} onClose={onClose} title="Edit template" footer={<Button title="Save" icon="checkmark" onPress={() => void save()} loading={busy} />}>
      <Banner text={error} />
      <Field label="Name" value={name} onChangeText={setName} />
      <Select label="Card type" value={orientation} onChange={setOrientation} options={TEMPLATE_TABS.map((x) => ({ value: x.key, label: x.label }))} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  tile: { backgroundColor: C.surface, borderRadius: R.lg, overflow: "hidden", marginBottom: S.md, borderWidth: 1, borderColor: C.line },
  img: { width: "100%", backgroundColor: C.white },
  pdf: { position: "absolute", top: 8, left: 8, backgroundColor: C.danger, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pdfText: { color: C.white, fontFamily: F.bodySemi, fontSize: 10 },
  foot: { flexDirection: "row", alignItems: "center", padding: S.sm, gap: 4 },
  name: { fontFamily: F.hSemi, fontSize: 13, color: C.ink },
});
