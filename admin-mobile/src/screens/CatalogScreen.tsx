import { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import api, { authedSource, errMsg, mediaUrl } from "../api/client";
import type { CatalogItem } from "../shared/types";
import { C, CONTENT_MAX, F, R, S } from "../theme";
import { Backdrop, Header } from "../ui/Screen";
import { Banner, Button, Chips, Empty, Fab, Field, Loading, Muted, Pill, SearchBar } from "../ui/kit";
import { ActionSheet, ImageViewer, Sheet } from "../ui/Sheet";
import { Tap } from "../ui/Pressable";
import { DOC_TYPES, asFormFile, pickDocuments, pickImages, sizeOk, type PickedFile } from "../lib/files";
import type { ScreenProps } from "../navigation/types";

type Kind = "model" | "tag" | "brochure";
const isPdf = (u?: string | null) => Boolean(u && /\.pdf(\?|$)/i.test(u));
const MAX_WORDS = 500;
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export function CatalogScreen({ route, navigation }: ScreenProps<"Catalog">) {
  const [kind, setKind] = useState<Kind>(route.params.kind);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 3 : 2;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<CatalogItem | null>(null);
  const [editor, setEditor] = useState<{ item: CatalogItem | null } | null>(null);
  const [viewer, setViewer] = useState<{ item: CatalogItem; index: number } | null>(null);
  const isBrochure = kind === "brochure";
  const title = isBrochure ? "Brochures" : "Models & tags";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: CatalogItem[] }>("/admin/catalog", { params: { kind } });
      setItems((data.items ?? []).filter((i) => i.kind === kind));
      setError(null);
    } catch (e) {
      setError(errMsg(e, "Failed to load."));
    } finally {
      setLoading(false);
    }
  }, [kind]);
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => !q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
  }, [items, search]);

  async function remove(item: CatalogItem) {
    try {
      await api.delete(`/admin/catalog/${item.id}`);
      setItems((p) => p.filter((x) => x.id !== item.id));
      setNotice("Deleted.");
    } catch (e) {
      setError(errMsg(e, "Delete failed."));
    }
  }

  const tileW = (Math.min(width, CONTENT_MAX) - S.lg * 2 - S.md * (cols - 1)) / cols;
  const pics = (i: CatalogItem) => [i.image_url, ...(i.extra_image_urls ?? [])].filter((u): u is string => Boolean(u) && !isPdf(u));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Backdrop />
      <Header title={title} subtitle={`${items.length} items`}>
        <SearchBar value={search} onChange={setSearch} placeholder={`Search ${isBrochure ? "brochures" : kind === "tag" ? "tags" : "models"}…`} />
      </Header>
      {!isBrochure ? (
        <View style={{ paddingHorizontal: S.lg, paddingTop: S.md, width: "100%", maxWidth: CONTENT_MAX, alignSelf: "center" }}>
          <Chips<Kind>
            value={kind}
            onChange={(k) => {
              setKind(k);
              navigation.setParams({ kind: k });
            }}
            items={[
              { key: "model", label: "ID card models" },
              { key: "tag", label: "ID card tags" },
            ]}
          />
        </View>
      ) : null}
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          key={`${cols}-${kind}`}
          data={list}
          numColumns={cols}
          keyExtractor={(i) => i.id}
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
          ListEmptyComponent={<Empty icon="pricetags-outline" title="Nothing here yet" text="Tap the button below to add the first one." />}
          renderItem={({ item }) => (
            <Tap
              style={[st.tile, { width: tileW }]}
              onPress={() => (isPdf(item.image_url) ? void Linking.openURL(mediaUrl(item.image_url)!) : setViewer({ item, index: 0 }))}
              onLongPress={() => setMenu(item)}
            >
              <View style={st.img}>
                {isPdf(item.image_url) ? (
                  <View style={st.pdfBox}>
                    <Ionicons name="document-text" size={40} color={C.danger} />
                    <Text style={st.pdfText}>PDF</Text>
                  </View>
                ) : (
                  <Image source={authedSource(item.image_url)} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
                )}
                {item.video_url ? (
                  <View style={st.video}>
                    <Ionicons name="play" size={12} color={C.white} />
                  </View>
                ) : null}
                {(item.extra_image_urls?.length ?? 0) > 0 ? <Pill text={`+${item.extra_image_urls!.length}`} tone="blue" style={{ position: "absolute", top: 8, left: 8 }} /> : null}
              </View>
              <View style={st.foot}>
                <View style={{ flex: 1 }}>
                  <Text style={st.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.description ? <Muted numberOfLines={2} style={{ fontSize: 11 }}>{item.description}</Muted> : null}
                </View>
                <Tap onPress={() => setMenu(item)} hitSlop={8} accessibilityLabel="More">
                  <Ionicons name="ellipsis-vertical" size={18} color={C.muted} />
                </Tap>
              </View>
            </Tap>
          )}
        />
      )}
      <Fab label={isBrochure ? "Upload" : kind === "tag" ? "Add tag" : "Add model"} icon="add" onPress={() => setEditor({ item: null })} />

      <ActionSheet
        visible={Boolean(menu)}
        onClose={() => setMenu(null)}
        title={menu?.name}
        actions={
          menu
            ? [
                { label: "View", icon: "eye-outline", onPress: () => (isPdf(menu.image_url) ? void Linking.openURL(mediaUrl(menu.image_url)!) : setViewer({ item: menu, index: 0 })) },
                { label: "Play video", icon: "play-circle-outline", hidden: !menu.video_url, onPress: () => void Linking.openURL(mediaUrl(menu.video_url)!) },
                { label: "Edit", icon: "create-outline", hidden: isBrochure, onPress: () => setEditor({ item: menu }) },
                {
                  label: "Delete",
                  icon: "trash-outline",
                  danger: true,
                  onPress: () =>
                    Alert.alert("Delete this item?", menu.name, [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete", style: "destructive", onPress: () => void remove(menu) },
                    ]),
                },
              ]
            : []
        }
      />
      <ImageViewer
        visible={Boolean(viewer)}
        onClose={() => setViewer(null)}
        index={viewer?.index ?? 0}
        onIndex={(i) => setViewer((v) => (v ? { ...v, index: i } : v))}
        items={viewer ? pics(viewer.item).map((u) => ({ title: viewer.item.name, sub: viewer.item.description ?? undefined, source: authedSource(u) })) : []}
      />
      <CatalogEditor
        kind={kind}
        state={editor}
        onClose={() => setEditor(null)}
        onDone={(msg) => {
          setEditor(null);
          setNotice(msg);
          void load();
        }}
      />
    </View>
  );
}

function CatalogEditor({ kind, state, onClose, onDone }: { kind: Kind; state: { item: CatalogItem | null } | null; onClose: () => void; onDone: (msg: string) => void }) {
  const editing = state?.item ?? null;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [video, setVideo] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const k = state ? editing?.id ?? "new" : "";
  if (k !== key) {
    setKey(k);
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setFiles([]);
    setVideo(null);
    setError(null);
    setProgress(null);
  }
  const isBrochure = kind === "brochure";
  const isTag = kind === "tag";

  async function save() {
    setError(null);
    if (files.some((f) => !sizeOk(f, 20))) return setError("Each file must be under 20 MB.");
    if (video && !sizeOk(video, 100)) return setError("The video must be under 100 MB.");
    setBusy(true);
    try {
      if (isBrochure) {
        if (!files.length) return setError("Choose at least one file.");
        for (let i = 0; i < files.length; i++) {
          setProgress(`Uploading ${i + 1} of ${files.length}`);
          const form = new FormData();
          form.append("kind", kind);
          form.append("name", files[i].name);
          form.append("file", asFormFile(files[i]));
          await api.post("/admin/catalog", form, { timeout: 300000 });
        }
        onDone(`${files.length} brochure(s) uploaded.`);
        return;
      }
      if (!name.trim()) return setError("Enter a name.");
      if (!isTag && words(description) > MAX_WORDS) return setError(`Description must be ${MAX_WORDS} words or fewer.`);
      if (!editing && !files.length) return setError("Choose an image.");
      if (isTag && files.length) {
        const [primary, ...extras] = files;
        const form = new FormData();
        form.append("kind", kind);
        form.append("name", name.trim());
        form.append("description", "");
        form.append("file", asFormFile(primary));
        let itemId = editing?.id;
        if (editing) await api.put(`/admin/catalog/${editing.id}`, form, { timeout: 300000 });
        else itemId = (await api.post<{ item: CatalogItem }>(`/admin/catalog?kind=${kind}`, form, { timeout: 300000 })).data.item.id;
        for (let i = 0; i < extras.length; i++) {
          setProgress(`Uploading extra image ${i + 1} of ${extras.length}`);
          const extra = new FormData();
          extra.append("file", asFormFile(extras[i]));
          await api.post(`/admin/catalog/${itemId}/extra-images`, extra, { timeout: 300000 });
        }
      } else {
        const form = new FormData();
        form.append("kind", kind);
        form.append("name", name.trim());
        form.append("description", isTag ? "" : description.trim());
        if (files[0]) form.append("file", asFormFile(files[0]));
        if (video) form.append("video", asFormFile(video));
        if (editing) await api.put(`/admin/catalog/${editing.id}`, form, { timeout: 600000 });
        else await api.post(`/admin/catalog?kind=${kind}`, form, { timeout: 600000 });
      }
      onDone(editing ? "Saved." : "Added.");
    } catch (e) {
      setError(errMsg(e, "Save failed."));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Sheet
      visible={Boolean(state)}
      onClose={onClose}
      title={isBrochure ? "Upload brochures" : `${editing ? "Edit" : "Add"} ${isTag ? "tag" : "model"}`}
      footer={<Button title={isBrochure ? "Upload" : "Save"} icon="checkmark" onPress={() => void save()} loading={busy} />}
    >
      <Banner text={error} />
      {progress ? <Banner text={progress} tone="blue" /> : null}
      {!isBrochure ? <Field label="Name" required value={name} onChangeText={setName} /> : null}
      {!isBrochure && !isTag ? (
        <Field label="Description" value={description} onChangeText={setDescription} multiline hint={`${words(description)} / ${MAX_WORDS} words`} />
      ) : null}
      <View style={{ flexDirection: "row", gap: S.sm, marginBottom: S.sm }}>
        <Button title="Gallery" variant="soft" icon="images-outline" style={{ flex: 1 }} onPress={async () => {
          const picked = await pickImages(isTag || isBrochure);
          if (picked.length) {
            setFiles(picked);
            if (!name && picked[0] && !isBrochure) setName(picked[0].name.replace(/\.[^.]+$/, ""));
          }
        }} />
        <Button title="Files / PDF" variant="soft" icon="document-outline" style={{ flex: 1 }} onPress={async () => {
          const picked = await pickDocuments(DOC_TYPES.imageOrPdf, isTag || isBrochure);
          if (picked.length) {
            setFiles(picked);
            if (!name && picked[0] && !isBrochure) setName(picked[0].name.replace(/\.[^.]+$/, ""));
          }
        }} />
      </View>
      {files.length ? (
        files.map((f, i) => (
          <Muted key={f.uri}>
            {i === 0 && isTag ? "★ " : "• "}
            {f.name}
          </Muted>
        ))
      ) : (
        <Muted>{editing ? "Keep the current image, or choose a new one." : isTag ? "Choose one or more images. The first is the main image." : "Choose an image or PDF."}</Muted>
      )}
      {!isBrochure && !isTag ? (
        <View style={{ marginTop: S.lg }}>
          <Button title={video ? `Video: ${video.name}` : editing?.video_url ? "Replace video" : "Add video (optional)"} variant="secondary" icon="videocam-outline" onPress={async () => {
            const [v] = await pickDocuments(DOC_TYPES.video);
            if (v) setVideo(v);
          }} />
        </View>
      ) : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  tile: { backgroundColor: C.surface, borderRadius: R.lg, overflow: "hidden", marginBottom: S.md, borderWidth: 1, borderColor: C.line },
  img: { width: "100%", aspectRatio: 1, backgroundColor: C.white },
  pdfBox: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.dangerSoft },
  pdfText: { fontFamily: F.h, color: C.danger, marginTop: 4 },
  video: { position: "absolute", right: 8, bottom: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  foot: { flexDirection: "row", alignItems: "center", padding: S.sm, gap: 4 },
  name: { fontFamily: F.hSemi, fontSize: 13, color: C.ink },
});
