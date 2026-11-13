import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import type { Student, Template } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { detectRoles } from "./columns";
import { blankLayout, customCard, DEFAULT_DPI, fitLayoutToTemplate, isLayout, newImage, newText, nextTextSpot, sizeText, stripColumnLabels } from "./defaults";
import { clearFolder, loadDraft, loadFolder, saveDraft, saveFolder, type Draft } from "./draftStore";
import { exportBundle, type CardProblem, type ExportFile, type OutputFolder } from "./exporter";
import { ensureFonts, restoreCustomFonts } from "./fonts";
import { SHEET_SIZES } from "./impose";
import { dataUrlToBlob, readImageDpi } from "./imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "./media";
import { blobToBitmap, measureTextBox, mediaLabel, textValue, type Bitmap, type MediaResolver } from "./render";
import type { CardElement, Layout, MediaStore, Row, Side, TextElement } from "./types";
import { BatchPreview } from "./ui/BatchPreview";
import { CardCanvas } from "./ui/CardCanvas";
import { Field, Num, Properties, TextToolbar } from "./ui/Inspector";
import { niceLabel } from "../utils/formFieldHelpers";

export const APP_NAME = "Harsha ID Solutions – ID Card Generator";

type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob; libraryId?: string; dpi: number } | null;
type SideMode = "single" | "double";
type Stage = "input" | "output" | "editor";

function studentsToRows(students: Student[]): { columns: string[]; rows: Row[]; roles: Record<string, string> } {
  const base: [string, (s: Student) => string | null | undefined][] = [
    ["Photo ID", (s) => s.photo_id], ["Name", (s) => s.student_name], ["Class", (s) => s.class_section], ["Roll No", (s) => s.roll_no],
    ["Parent Name", (s) => s.parent_name], ["Phone", (s) => s.parent_phone], ["Address", (s) => s.address],
    ["DOB", (s) => s.dob], ["Blood Group", (s) => s.blood_group], ["Gender", (s) => s.gender],
  ];
  const extraKeys = Array.from(new Set(students.flatMap((s) => Object.keys(s.extra_fields ?? {}))));
  const labelFor = (k: string) => students.find((s) => s.field_labels?.[k])?.field_labels?.[k] ?? k.replace(/_/g, " ");
  const columns = [...base.map(([c]) => c), ...extraKeys.map(labelFor)];
  const rows = students.map((s) => {
    const r: Row = {};
    base.forEach(([c, get]) => (r[c] = String(get(s) ?? "").trim()));
    extraKeys.forEach((k) => (r[labelFor(k)] = String(s.extra_fields?.[k] ?? "").trim()));
    return r;
  });
  const used = columns.filter((c) => rows.some((r) => r[c]));
  const excelLabels: string[] = [];
  const seen = new Set<string>();
  for (const k of extraKeys) {
    if (k === "signature_upload") continue;
    const label = labelFor(k);
    const norm = label.trim().toLowerCase();
    if (!norm || seen.has(norm) || !rows.some((r) => r[label])) continue;
    seen.add(norm);
    excelLabels.push(label);
  }
  const shown = excelLabels.length ? excelLabels : used;
  return { columns: shown, rows, roles: { ...detectRoles(used), admission: "Photo ID", name: "Name", class: "", classSection: "Class", father: "Parent Name", phone: "Phone" } };
}

/** Folder handle as Chrome / Edge give it (File System Access API). */
type FolderHandle = OutputFolder & {
  queryPermission?(o: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "readwrite" }): Promise<PermissionState>;
};
const canPickFolder = typeof window !== "undefined" && "showDirectoryPicker" in window;

async function folderAllowed(h: FolderHandle): Promise<boolean> {
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: "readwrite" })) === "granted") return true;
    return (await h.requestPermission?.({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

function download(file: ExportFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function apiError(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: string } } })?.response?.data;
  return msg?.message || fallback;
}

/** Text formatting that new text fields copy from the last text the admin styled (not the position). */
const STYLE_KEYS = ["font", "weight", "italic", "underline", "size", "minSize", "autoShrink", "multiline", "textCase", "align", "vAlign", "letterSpacing", "lineHeight", "color", "gradient", "stroke"] as const;
type TextStyle = Partial<Pick<TextElement, (typeof STYLE_KEYS)[number]>>;
const pickStyle = (el: Partial<TextElement>): TextStyle => {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (el[k] !== undefined) out[k] = el[k];
  return out as TextStyle;
};
const failedKey = (orgId: string) => `idg-failed:${orgId}`;

/** Small JPEG of a finished card for the teacher app (keeps uploads light). */
function phoneCopy(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const s = Math.min(1, 900 / canvas.width);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(canvas.width * s));
  c.height = Math.max(1, Math.round(canvas.height * s));
  c.getContext("2d")!.drawImage(canvas, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/jpeg", 0.88));
}

/**
 * ID card generator for one school / institute — same screens as the desktop app:
 *   1. Input   — records, photos, template and where to save
 *   2. Output  — print sheets: paper, direction, gap and margin
 *   3. Editor  — columns on the left, the card(s) in the middle, the selected item on the right
 */
export function GeneratorApp() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const schoolId = params.get("schoolId"), instituteId = params.get("instituteId");
  const orgKind: "school" | "institute" = instituteId ? "institute" : "school";
  const orgId = instituteId ?? schoolId ?? "";
  const [orgName, setOrgName] = useState(params.get("schoolName") ?? params.get("instituteName") ?? "");
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  const [stage, setStage] = useState<Stage>("input");
  const [outFolder, setOutFolder] = useState<FolderHandle | null>(null);
  const [zipChosen, setZipChosen] = useState(false);
  useEffect(() => {
    if (!orgId || !canPickFolder) return;
    let live = true;
    void loadFolder(orgId).then((h) => { if (live && h) setOutFolder(h as FolderHandle); });
    return () => { live = false; };
  }, [orgId]);
  async function chooseFolder() {
    try {
      const pick = (window as unknown as { showDirectoryPicker(o: { mode: "readwrite"; id?: string }): Promise<FolderHandle> }).showDirectoryPicker;
      const h = await pick.call(window, { mode: "readwrite", id: "idg-output" });
      setOutFolder(h);
      setZipChosen(false);
      if (orgId) void saveFolder(orgId, h);
    } catch (e) {
      if ((e as Error).name !== "AbortError") say("That folder could not be opened. Choose another folder.", "error");
    }
  }
  function resetToDownloads() {
    setOutFolder(null);
    setZipChosen(true);
    if (orgId) void clearFolder(orgId);
  }
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [photoFiles, setPhotoFiles] = useState<string>("");
  const [signFiles, setSignFiles] = useState<string>("");
  const serverBlobs = useRef(new Map<string, Blob>());

  const [layout, setLayout] = useState<Layout>(() => ({ ...blankLayout(), dpi: DEFAULT_DPI }));
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [sideMode, setSideMode] = useState<SideMode>("single");
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [library, setLibrary] = useState<Template[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const textStyle = useRef<TextStyle>({});
  const [print, setPrint] = useState({ sheetKey: "a4", landscape: false, gap: 3, margin: 8 });
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const savedSnapshot = useRef<string>("");
  const restored = useRef(false);
  const leaving = useRef(false);

  const visibleSides: Side[] = sideMode === "double" ? ["front", "back"] : ["front"];

  useEffect(() => { void restoreCustomFonts(); }, []);
  useEffect(() => {
    api.get<{ templates: Template[] }>("/admin/templates", { params: { purpose: "all" } })
      .then((r) => setLibrary(r.data.templates ?? []))
      .catch(() => undefined)
      .finally(() => setLibraryLoaded(true));
  }, []);
  useEffect(() => {
    if (!orgId) return;
    api.get(`/admin/${orgKind === "school" ? "schools" : "institutes"}`)
      .then((r) => {
        const list: { id: string; name: string }[] = r.data[orgKind === "school" ? "schools" : "institutes"] ?? [];
        const found = list.find((o) => o.id === orgId);
        if (found) setOrgName(found.name);
      })
      .catch(() => undefined);
    let live = true;
    say("Loading records…");
    api.get<{ students: Student[] }>("/admin/students", { params: orgKind === "school" ? { schoolId: orgId } : { instituteId: orgId } })
      .then((r) => {
        if (!live) return;
        const list = (r.data.students ?? []).filter((s) => s.app_visible !== false);
        const built = studentsToRows(list);
        setStudents(list);
        setColumns(built.columns);
        setRows(built.rows);
        serverBlobs.current.clear();
        setLayout((l) => ({ ...l, roles: built.roles, matchColumn: "Photo ID" }));
        try {
          const saved = JSON.parse(localStorage.getItem(failedKey(orgId)) ?? "[]") as string[];
          if (Array.isArray(saved)) setFailedIds(saved);
        } catch {
          /* nothing saved */
        }
        setStatus(null);
      })
      .catch(() => say("Records could not be loaded.", "error"))
      .finally(() => { if (live) setStudentsLoaded(true); });
    return () => { live = false; };
  }, [orgId, orgKind]);

  // ---------- media ----------
  const serverBlob = useCallback(async (kind: "photo" | "parentSign", index: number): Promise<Blob | null> => {
    const s = students[index];
    if (!s) return null;
    if (kind === "photo" && !s.photo_url) return null;
    if (kind === "parentSign" && !s.signature_url) return null;
    const key = `${kind}:${s.id}:${s.updated_at ?? ""}`;
    const hit = serverBlobs.current.get(key);
    if (hit) return hit;
    const url = kind === "photo" ? await authenticatedStudentPhotoUrl(s.id, { version: s.updated_at }) : await authenticatedStudentSignatureUrl(s.id, { version: s.updated_at });
    if (!url) return null;
    const blob = await (await fetch(url)).blob();
    serverBlobs.current.set(key, blob);
    return blob;
  }, [students]);

  const resolverFor = useCallback((index: number): MediaResolver => async (kind, el) => {
    try {
      if (kind === "static") return el.imageData ? await blobToBitmap(await dataUrlToBlob(el.imageData)) : null;
      const row = rows[index];
      if (!row) return null;
      if (kind === "photo" || kind === "parentSign") {
        const map = kind === "photo" ? media.photo : media.parentSign;
        const local = findMedia(map, row, "Photo ID", index, "column");
        const blob = local ?? (await serverBlob(kind, index));
        return blob ? await blobToBitmap(blob) : null;
      }
      return null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, serverBlob]);

  const hasPhoto = useCallback((index: number) => {
    const row = rows[index];
    return Boolean(row && (findMedia(media.photo, row, "Photo ID", index, "column") || students[index]?.photo_url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, students]);

  // ---------- records: every record gets a card (a missing photo leaves an empty photo area) ----------
  const allRows = useMemo(() => rows.map((row, index) => ({ row, index })), [rows]);
  const withPhotoAll = useMemo(() => allRows.filter(({ index }) => hasPhoto(index)).length, [allRows, hasPhoto]);
  const classes = useMemo(() => Array.from(new Set(rows.map((r) => r.Class).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows]);
  const inClass = useMemo(() => allRows.filter(({ row }) => !className || row.Class === className), [allRows, className]);
  const readyAll = inClass;
  const ready = useMemo(
    () => (onlyFailed && failedIds.length ? readyAll.filter(({ row }) => failedIds.includes(row["Photo ID"] ?? "")) : readyAll),
    [readyAll, onlyFailed, failedIds]
  );
  const noPhotoInBatch = useMemo(() => ready.filter(({ index }) => !hasPhoto(index)).length, [ready, hasPhoto]);
  useEffect(() => { setPreviewIndex(0); }, [className]);
  const current = ready[Math.min(previewIndex, Math.max(0, ready.length - 1))] ?? inClass[0];
  const previewRow = current?.row ?? {};
  const previewResolver = useMemo(() => resolverFor(current?.index ?? -1), [resolverFor, current?.index]);

  // ---------- layout editing ----------
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  const patchEl = useCallback((id: string, patch: Partial<CardElement>) => {
    setLayout((l) => ({
      ...l,
      elements: l.elements.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch } as CardElement;
        if (next.kind === "text") {
          const style = pickStyle(patch as Partial<TextElement>);
          if (Object.keys(style).length) textStyle.current = { ...textStyle.current, ...style };
        }
        return next;
      }),
    }));
  }, []);
  /** A column on the card shows only its value; + puts it under the last field, a drop puts it where it was dropped. */
  const columnText = (s: Side, column: string, at?: Partial<TextElement>) => {
    const el = newText(s, column, { ...textStyle.current, prefix: "", ...(at ?? nextTextSpot(layout, s)) });
    // The box fits the text it shows (so the selection box matches the text on the card).
    const shown = textValue(el, previewRow);
    if (!shown) return el;
    const box = measureTextBox(el, shown);
    return { ...el, w: Math.max(5, Math.min(box.w, layout.card.w - el.x)), h: box.h };
  };
  const fitBox = (id: string) => {
    const el = layout.elements.find((e) => e.id === id);
    if (!el || el.kind !== "text") return;
    const box = measureTextBox(el, textValue(el, previewRow) || el.column || "Text");
    patchEl(id, { w: Math.max(5, box.w), h: el.multiline ? Math.max(el.h, box.h) : box.h });
  };
  const addEl = (el: CardElement) => { setLayout((l) => ({ ...l, elements: [...l.elements, el] })); setSelectedId(el.id); setPanelOpen(true); };
  const removeEl = (id: string) => { setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) })); setSelectedId(null); };
  /** Line up every other text field on this side with the selected one (left edge or width). */
  const alignTexts = (how: "left" | "width") => {
    if (!selected) return;
    setLayout((l) => ({
      ...l,
      elements: l.elements.map((e) => (e.kind === "text" && e.side === selected.side && e.id !== selected.id ? { ...e, ...(how === "left" ? { x: selected.x } : { w: selected.w }) } : e)),
    }));
  };
  const layerEl = (id: string, dir: -1 | 1) => setLayout((l) => {
    const i = l.elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.elements.length) return l;
    const next = [...l.elements];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...l, elements: next };
  });
  useEffect(() => { void ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font)); }, [layout.elements]);

  // ---------- templates ----------
  /** The card is exactly the template's own size: its pixels at its own DPI (read from the file, else 300). */
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, libraryId?: string, sizeCard = true) {
    const [bitmap, fileDpi] = await Promise.all([blobToBitmap(blob, 10000), readImageDpi(blob)]);
    const dpi = fileDpi ?? DEFAULT_DPI;
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, libraryId, dpi } };
    });
    if (target !== "front") return;
    setLayout((l) => (sizeCard ? fitLayoutToTemplate({ ...l, dpi }, bitmap.width, bitmap.height, dpi) : fitLayoutToTemplate(l, bitmap.width, bitmap.height, l.dpi ?? dpi)));
  }

  async function uploadTemplate(target: Side, file: File) {
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        const form = new FormData();
        form.append("pdf", file);
        form.append("page", "1");
        const { data } = await api.post("/admin/id-generator/rasterize-pdf", form, { responseType: "blob" });
        await setTemplateFromBlob(target, data, file.name);
      } else {
        await setTemplateFromBlob(target, file, file.name);
      }
      say(`${target === "front" ? "Front" : "Back"} template added.`, "ok");
    } catch (e) {
      say(apiError(e, "Template could not be loaded."), "error");
    } finally {
      setBusy(null);
    }
  }

  function removeTemplate(target: Side) {
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: null };
    });
    say(`${target === "front" ? "Front" : "Back"} template removed.`, "info");
  }

  const snapshot = useCallback(
    () => JSON.stringify({ layout, sideMode, f: templates.front ? templates.front.libraryId ?? templates.front.name : null, b: sideMode === "double" && templates.back ? templates.back.libraryId ?? templates.back.name : null }),
    [layout, sideMode, templates]
  );

  /** A design saved earlier (before saving was removed) still opens for this school. */
  async function applyDesign(t: Template) {
    if (!isLayout(t.config_json)) return;
    const saved = stripColumnLabels(t.config_json as Layout) as Layout & { sideMode?: SideMode };
    const mode: SideMode = saved.sideMode ?? (saved.backTemplateId || saved.elements.some((e) => e.side === "back") ? "double" : "single");
    setLayout((l) => ({ ...saved, roles: l.roles, matchColumn: "Photo ID", matchBy: "column" }));
    setSideMode(mode);
    const frontId = saved.frontTemplateId ?? t.id;
    const fr = await api.get(`/admin/id-generator/template-image/${frontId}`, { responseType: "blob" });
    await setTemplateFromBlob("front", fr.data, t.name, frontId, false);
    if (saved.backTemplateId) {
      const br = await api.get(`/admin/id-generator/template-image/${saved.backTemplateId}`, { responseType: "blob" });
      await setTemplateFromBlob("back", br.data, `${t.name} (back)`, saved.backTemplateId, false);
    }
    setSide("front");
  }

  async function loadLibraryTemplate(t: Template) {
    if (isLayout(t.config_json)) await applyDesign(t);
    else {
      const r = await api.get(`/admin/id-generator/template-image/${t.id}`, { responseType: "blob" });
      await setTemplateFromBlob("front", r.data, t.name, t.id);
    }
  }

  // ---------- reopen where the admin left off for this school (work is kept automatically) ----------
  useEffect(() => {
    if (restored.current || !orgId || !libraryLoaded || !studentsLoaded) return;
    restored.current = true;
    void (async () => {
      const draft = await loadDraft(orgId);
      if (draft) {
        setBusy({ label: "Opening your last work for this school…", done: 0, total: 0 });
        try {
          setLayout((l) => ({ ...stripColumnLabels(draft.layout), roles: l.roles, matchColumn: "Photo ID", matchBy: "column" }));
          setSideMode(draft.sideMode);
          setPrint(draft.print);
          if (draft.templates.front) await setTemplateFromBlob("front", draft.templates.front.blob, draft.templates.front.name, draft.templates.front.libraryId, false);
          if (draft.templates.back) await setTemplateFromBlob("back", draft.templates.back.blob, draft.templates.back.name, draft.templates.back.libraryId, false);
          savedSnapshot.current = draft.savedSnapshot;
        } finally {
          setBusy(null);
        }
        return;
      }
      const templateParam = params.get("templateId");
      const fromParam = templateParam ? library.find((x) => x.id === templateParam) : undefined;
      const mine = library.filter((t) => isLayout(t.config_json) && (t.config_json as unknown as { orgId?: string }).orgId === orgId);
      const pick = fromParam ?? mine[0];
      if (pick) {
        setBusy({ label: "Opening the design…", done: 0, total: 0 });
        try {
          await loadLibraryTemplate(pick);
        } catch (e) {
          say(apiError(e, "The design could not be opened."), "error");
        } finally {
          setBusy(null);
        }
      }
      savedSnapshot.current = "start";
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, libraryLoaded, studentsLoaded]);

  // Keep the work for this school in the browser so a refresh / close / app restart reopens it.
  useEffect(() => {
    if (!orgId || !restored.current) return;
    const t = setTimeout(() => {
      const slot = (s: TemplateSlot) => (s ? { blob: s.blob, name: s.name, libraryId: s.libraryId } : null);
      const draft: Draft = {
        layout, sideMode, designId: null, print, className: "",
        templates: { front: slot(templates.front), back: slot(templates.back) },
        savedSnapshot: snapshot(),
        savedAt: Date.now(),
      };
      void saveDraft(orgId, draft);
    }, 700);
    return () => clearTimeout(t);
  }, [layout, sideMode, templates, print, orgId, snapshot]);

  const backTo = orgId ? (orgKind === "school" ? `/students?schoolId=${orgId}&schoolName=${encodeURIComponent(orgName)}` : `/institute-members?instituteId=${orgId}&instituteName=${encodeURIComponent(orgName)}`) : "/schools";
  const onBack = () => { leaving.current = true; navigate(backTo); };

  // Photo / signature messages belong to step 1: don't repeat them in the editor.
  useEffect(() => {
    if (stage === "editor") setStatus((s) => (s && s.tone !== "error" ? null : s));
  }, [stage]);

  // ---------- bulk photos / signatures ----------
  async function addBulk(list: FileList, kind: "photo" | "parentSign") {
    setBusy({ label: kind === "photo" ? "Reading photos…" : "Reading signatures…", done: 0, total: 0 });
    try {
      const picked = Array.from(list);
      const files = [];
      for (const f of picked) {
        if (/\.zip$/i.test(f.name)) files.push(...(await filesFromZip(f)));
        else files.push(...filesFromInput([f]));
      }
      const summary = addToStore(media, files, kind);
      setMedia(media);
      setMediaVersion((v) => v + 1);
      const label = picked.length === 1 ? picked[0].name : `${picked.length} files`;
      if (kind === "photo") setPhotoFiles(label); else setSignFiles(label);
      const count = kind === "photo" ? summary.photos : summary.parentSigns;
      const map = kind === "photo" ? media.photo : media.parentSign;
      const matched = rows.filter((r, i) => findMedia(map, r, "Photo ID", i, "column")).length;
      say(`${count} ${kind === "photo" ? "photos" : "signatures"} added — ${matched} matched to ${orgKind === "school" ? "students" : "members"} by Photo ID.`, "ok");
      if (kind === "parentSign" && !layout.elements.some((e) => e.kind === "image" && e.media === "parentSign")) {
        addEl(newImage("front", "parentSign", { x: 30, y: 76, w: 20, h: 7 }));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "Files could not be read.", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- generate ----------
  /** Output resolution = the template's own DPI, exactly. */
  const outputDpi = layout.dpi ?? templates.front?.dpi ?? DEFAULT_DPI;
  const genLayout = useMemo<Layout>(
    () => (sideMode === "double" ? layout : { ...layout, elements: layout.elements.filter((e) => e.side === "front") }),
    [layout, sideMode]
  );
  const genTemplates = { front: templates.front?.bitmap ?? null, back: sideMode === "double" ? templates.back?.bitmap ?? null : null };

  async function generate() {
    setConfirmOpen(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const phone: { id: string; blob: Blob }[] = [];
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const sheet = SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0];
      let target: FolderHandle | null = outFolder;
      if (target && !(await folderAllowed(target))) {
        say(`No permission to save into “${target.name}”. The cards will download as a ZIP instead.`, "info");
        target = null;
      }
      const { file, problems, savedTo } = await exportBundle({
        outputFolder: target,
        layout: genLayout,
        rows: ready,
        columns,
        templates: genTemplates,
        media: resolverFor,
        fileNamePattern: "{Photo ID}",
        jobName: `${orgName || "ID cards"}${className ? ` - ${className}` : ""}${onlyFailed ? " - corrected" : ""}`,
        print: { sheet, landscape: print.landscape, gap: print.gap, margin: print.margin },
        idColumn: "Photo ID",
        nameColumn: "Name",
        dpi: outputDpi,
        onFront: async (index, canvas) => {
          const s = students[index];
          if (!s) return;
          const blob = await phoneCopy(canvas);
          if (blob) phone.push({ id: s.id, blob });
        },
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      if (file) download(file);
      const where = savedTo ? `saved in “${savedTo}”` : `“${file?.name ?? "ID cards.zip"}” downloaded`;
      const ids = Array.from(new Set(problems.map((p: CardProblem) => p.id).filter(Boolean)));
      setFailedIds(ids);
      setOnlyFailed(false);
      try {
        if (ids.length) localStorage.setItem(failedKey(orgId), JSON.stringify(ids));
        else localStorage.removeItem(failedKey(orgId));
      } catch {
        /* storage blocked */
      }
      // Save each front side so the teacher app shows the ID card instead of the plain photo.
      let sent = 0;
      let failedUploads = 0;
      const queue = [...phone];
      const worker = async () => {
        for (let job = queue.shift(); job; job = queue.shift()) {
          const form = new FormData();
          form.append("image", job.blob, "card.jpg");
          try { await api.post(`/admin/students/${job.id}/id-card`, form); } catch { failedUploads++; }
          sent++;
          setBusy({ label: "Sending cards to the teacher app…", done: sent, total: phone.length });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
      say(
        problems.length
          ? `${ready.length} ID cards ${where}. ${ids.length} card(s) have text that is cut off or outside the card — see “ERRORS - cards to correct.csv”, correct them, then use “Regenerate errors only”.`
          : `${ready.length} ID cards ready — ${where}.${failedUploads ? ` ${failedUploads} could not be sent to the teacher app.` : " The cards now also show in the teacher app."}`,
        problems.length || failedUploads ? "error" : "ok"
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") say("Generation cancelled.", "info");
      else say(e instanceof Error ? e.message : "ID cards could not be generated.", "error");
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  const sheetLabel = (SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0]).label;
  const needFolder = !outFolder && !zipChosen;
  const inputReady = rows.length > 0 && !needFolder && (sideMode === "single" || !templates.front || Boolean(templates.back));
  const inputHint = !rows.length
    ? "There are no records for this school yet."
    : needFolder
      ? "Choose where to save the ID cards (a folder, or download as ZIP)."
      : sideMode === "double" && templates.front && !templates.back
        ? "Upload the back template too (or choose Single side)."
        : "Ready.";
  const steps: { key: Stage; label: string }[] = [
    { key: "input", label: "1. Input" },
    { key: "output", label: "2. Output" },
    { key: "editor", label: "3. Design & generate" },
  ];
  const cardInfo = `${sizeText(layout.card)} · ${+outputDpi.toFixed(2)} DPI`;

  /** Template chooser: single side or front & back, with an upload / remove slot per side. Optional. */
  const templatePicker = (
    <div className="idg-tplpick">
      <div className="idg-mode" role="radiogroup" aria-label="Template type">
        {(["single", "double"] as SideMode[]).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={sideMode === m} className={sideMode === m ? "is-on" : ""} onClick={() => { setSideMode(m); if (m === "single") setSide("front"); }}>
            <span className={`idg-mode-ic${m === "double" ? " is-two" : ""}`} aria-hidden><i /><i /></span>
            <span className="idg-mode-text">
              <span className="idg-mode-title">{m === "single" ? "Single side" : "Front & back"}</span>
              <span className="idg-mode-sub">{m === "single" ? "One template, one side printed" : "Two templates: front and back"}</span>
            </span>
          </button>
        ))}
      </div>
      <div className={`idg-slots${sideMode === "double" ? " is-two" : ""}`}>
        {visibleSides.map((s) => {
          const t = templates[s];
          return (
            <div key={s} className="idg-slot">
              <div className="idg-slot-img">{t ? <img src={t.url} alt={`${s} template`} /> : <span>No {sideMode === "double" ? `${s} ` : ""}template (optional)</span>}</div>
              <div className="idg-slot-info">
                <b>{sideMode === "double" ? (s === "front" ? "Front side" : "Back side") : "Template"}</b>
                <small>{t ? `${t.name} · ${t.bitmap.width} × ${t.bitmap.height} px · ${t.dpi} DPI` : "PNG, JPG or PDF — any size, up to A4"}</small>
              </div>
              <div className="idg-slot-actions">
                <label className="btn-secondary">
                  <input type="file" accept="image/png,image/jpeg,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTemplate(s, f); }} />
                  {t ? "Replace" : "Upload"}
                </label>
                {t && <button type="button" className="btn-secondary idg-danger" onClick={() => removeTemplate(s)}>Remove</button>}
              </div>
            </div>
          );
        })}
      </div>
      {templates.front ? (
        <p className="idg-muted">Card size from the template: <b>{cardInfo}</b>. Generated cards keep exactly this size and resolution.</p>
      ) : (
        <div className="idg-grid2">
          <Field label="Card width (mm)"><Num value={layout.card.w} step={0.1} min={10} max={600} onChange={(v) => setLayout((l) => ({ ...l, card: customCard(v, l.card.h) }))} /></Field>
          <Field label="Card height (mm)"><Num value={layout.card.h} step={0.1} min={10} max={600} onChange={(v) => setLayout((l) => ({ ...l, card: customCard(l.card.w, v) }))} /></Field>
        </div>
      )}
    </div>
  );

  const statusBar = (
    <>
      {status && <div className={`idg-status is-${status.tone}`} role="status">{status.text}<button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">×</button></div>}
      {busy && (
        <div className="idg-progress" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total || undefined}>
          <div><span>{busy.label}</span>{busy.total > 0 && <b>{busy.done} / {busy.total}</b>}{abortRef.current && <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}</div>
          <i style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : "35%" }} className={busy.total ? "" : "is-indeterminate"} />
        </div>
      )}
    </>
  );

  const header = (
    <section className="idg-top card">
      <button type="button" className="idg-back" onClick={onBack} aria-label={`Back to ${orgName || (orgKind === "school" ? "the school" : "the institute")}`}>
        <span aria-hidden>←</span> Back
      </button>
      <div className="idg-top-title">
        <img className="idg-brand" src="/harsha-h.png" alt="Harsha ID Solutions" />
        <div>
          <small className="idg-app-name">{APP_NAME}</small>
          <h2>{orgName || "ID Card Generator"}</h2>
        </div>
      </div>
      <nav className="idg-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <button key={s.key} type="button" className={stage === s.key ? "is-on" : ""} onClick={() => setStage(s.key)} disabled={i > 0 && !inputReady}>{s.label}</button>
        ))}
      </nav>
    </section>
  );

  // ---------- Step 1: input ----------
  if (stage === "input") {
    return (
      <div className="app-page idg idg-simple idg-full idg-wizard">
        {header}
        {statusBar}
        <div className="idg-wizard-body">
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">1</span><div><h3>Records &amp; photos</h3><p className="idg-muted">From {orgName || "this organisation"}</p></div></div>
            <div className="idg-wiz-stats is-four">
              <div><b>{rows.length}</b><span>Total records</span></div>
              <div><b>{media.photo.size}</b><span>Photos uploaded</span></div>
              <div className="is-ok"><b>{withPhotoAll}</b><span>Records with photo</span></div>
              <div className="is-warn"><b>{Math.max(0, rows.length - withPhotoAll)}</b><span>Records without photo</span></div>
            </div>
            <Field label="Photo file names match">
              <input className="input-field" value="Photo ID" readOnly />
            </Field>
            <div className="idg-pickrow">
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Upload photos (ZIP / images)
              </label>
              <span className="idg-path">{photoFiles || "Optional — photos captured in the app are used automatically"}</span>
            </div>
            <div className="idg-pickrow">
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
                Upload signatures
              </label>
              <span className="idg-path">{signFiles || "Optional"}</span>
            </div>
            <div className="idg-pickrow">
              {canPickFolder ? (
                <button type="button" className={outFolder ? "btn-secondary" : "btn-primary"} onClick={() => void chooseFolder()}>{outFolder ? "Change output folder" : "Choose output folder *"}</button>
              ) : null}
              <span className="idg-path">
                {outFolder ? <>Output: <b>{outFolder.name}</b> — Front and Back folders are made inside it</> : zipChosen ? <>Output: <b>one ZIP file</b> in Downloads, with Front and Back folders inside</> : canPickFolder ? "Required — choose a folder (you can create a new one in the window) or download as ZIP" : "Required — the cards download as one ZIP file"}
              </span>
              {!outFolder && !zipChosen && <button type="button" className={canPickFolder ? "btn-secondary" : "btn-primary"} onClick={resetToDownloads}>Download as ZIP *</button>}
              {(outFolder || zipChosen) && <button type="button" className="idg-linkbtn" onClick={() => { if (outFolder) resetToDownloads(); else setZipChosen(false); }}>{outFolder ? "Download as ZIP instead" : "Change"}</button>}
            </div>
            <p className="idg-muted">Every record gets a card. Where a photo is missing, the photo area is left empty (white) so a photo can be added later.</p>
          </section>
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">2</span><div><h3>Template</h3><p className="idg-muted">Optional — one side, or front and back</p></div></div>
            {templatePicker}
          </section>
        </div>
        <div className="idg-wizard-foot">
          <span className="idg-muted">{inputHint}</span>
          <button type="button" className="btn-primary" disabled={!inputReady} onClick={() => setStage("output")}>Next: Output →</button>
        </div>
      </div>
    );
  }

  // ---------- Step 2: output ----------
  if (stage === "output") {
    return (
      <div className="app-page idg idg-simple idg-full idg-wizard">
        {header}
        {statusBar}
        <div className="idg-wizard-body">
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">1</span><div><h3>Print sheets</h3><p className="idg-muted">Paper and spacing for printing</p></div></div>
            <div className="idg-grid2">
              <Field label="Paper / press sheet">
                <select className="input-field" value={print.sheetKey} onChange={(e) => setPrint((p) => ({ ...p, sheetKey: e.target.value }))}>
                  {SHEET_SIZES.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                </select>
              </Field>
              <Field label="Sheet direction">
                <select className="input-field" value={print.landscape ? "landscape" : "portrait"} onChange={(e) => setPrint((p) => ({ ...p, landscape: e.target.value === "landscape" }))}>
                  <option value="portrait">Vertical (portrait)</option>
                  <option value="landscape">Horizontal (landscape)</option>
                </select>
              </Field>
              <Field label="Gap between cards (mm)">
                <input className="input-field" type="number" min={0} max={30} step={0.5} value={print.gap} onChange={(e) => setPrint((p) => ({ ...p, gap: Math.max(0, Math.min(30, Number(e.target.value) || 0)) }))} />
              </Field>
              <Field label="Sheet margin (mm)">
                <input className="input-field" type="number" min={0} max={30} step={0.5} value={print.margin} onChange={(e) => setPrint((p) => ({ ...p, margin: Math.max(0, Math.min(30, Number(e.target.value) || 0)) }))} />
              </Field>
            </div>
          </section>
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">2</span><div><h3>Output</h3><p className="idg-muted">What you get after Generate</p></div></div>
            <ul className="idg-outlist">
              <li><b>Save to</b><span>{outFolder ? `${outFolder.name} (a new folder for each batch)` : "One ZIP file in your Downloads folder"}</span></li>
              <li><b>Front folder</b><span>Front/&lt;Photo ID&gt;.jpg</span></li>
              {sideMode === "double" && <li><b>Back folder</b><span>Back/&lt;Photo ID&gt;.jpg</span></li>}
              <li><b>Card size</b><span>{cardInfo}{templates.front ? ` — ${templates.front.bitmap.width} × ${templates.front.bitmap.height} px, same as the template` : ""}</span></li>
              <li><b>Print sheets</b><span>PDF and a ZIP of sheet images ({sheetLabel}{print.landscape ? ", landscape" : ""}) with crop marks</span></li>
              <li><b>Also</b><span>Card details and an error list if text is cut off</span></li>
            </ul>
          </section>
        </div>
        <div className="idg-wizard-foot">
          <button type="button" className="btn-secondary" onClick={() => setStage("input")}>← Input</button>
          <button type="button" className="btn-primary" disabled={!inputReady} onClick={() => setStage("editor")}>Next: Design →</button>
        </div>
      </div>
    );
  }

  // ---------- Step 3: editor (playground) ----------
  return (
    <div className="app-page idg idg-simple idg-full">
      {header}
      {statusBar}

      <div className={`idg-workspace${panelOpen ? "" : " is-panel-hidden"}`}>
        {/* Left: Excel columns (scroll on their own); Add field and Preview / Generate always in view */}
        <aside className="card idg-left">
          <h3>Excel columns</h3>
          <p className="idg-muted">Tap + or drag onto the card. A column can be added more than once.</p>
          <ul className="idg-columns">
            {columns.map((c) => (
              <li key={c} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-idg-column", c); e.dataTransfer.effectAllowed = "copy"; }}>
                <span className="idg-grip" aria-hidden>⋮⋮</span>
                <span className="idg-col-name">{niceLabel(c)}</span>
                <button type="button" onClick={() => addEl(columnText(side, c))} aria-label={`Add ${c}`}>+</button>
              </li>
            ))}
            {!columns.length && <li className="idg-muted">Open the generator from a school or institute to see its columns.</li>}
          </ul>
          <h3 className="idg-add-title">Add field</h3>
          <div className="idg-add">
            <button type="button" onClick={() => addEl(newImage(side, "photo"))}><b>☺</b>Import photo</button>
            <button type="button" onClick={() => addEl(newImage(side, "parentSign", { x: 30, y: 76, w: 20, h: 7 }))}><b>✎</b>Signature</button>
          </div>
          <div className="idg-left-actions">
            <button type="button" className="btn-secondary" disabled={!ready.length} onClick={() => setPreviewOpen(true)}>Preview</button>
            {failedIds.length > 0 && (
              <button type="button" className="btn-secondary idg-errors-btn" disabled={Boolean(busy)} onClick={() => { setOnlyFailed(true); setConfirmOpen(true); }}>
                Regenerate errors only ({failedIds.length})
              </button>
            )}
            <button type="button" className="btn-primary idg-cta" disabled={!readyAll.length || Boolean(busy)} onClick={() => { setOnlyFailed(false); setConfirmOpen(true); }}>Generate ID cards ({readyAll.length})</button>
          </div>
        </aside>

        {/* Centre: the card(s) — one side, or front and back */}
        <section className="card idg-center">
          <div className="idg-center-bar">
            <label className="idg-class">
              <span>Class</span>
              <select className="input-field" value={className} onChange={(e) => setClassName(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <div className="idg-preview-nav">
              <button type="button" className="idg-tool" disabled={previewIndex <= 0} onClick={() => setPreviewIndex((i) => i - 1)} aria-label="Previous person">‹</button>
              <span>{ready.length ? Math.min(previewIndex + 1, ready.length) : 0} / {ready.length}</span>
              <button type="button" className="idg-tool" disabled={previewIndex >= ready.length - 1} onClick={() => setPreviewIndex((i) => i + 1)} aria-label="Next person">›</button>
            </div>
            <div className="idg-zoom">
              <button type="button" className="idg-tool" disabled={zoom <= 0.5} onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label="Zoom out">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="idg-tool" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label="Zoom in">+</button>
            </div>
            <button type="button" className="idg-tool idg-panel-btn" onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen}>{panelOpen ? "Hide settings" : "Show settings"}</button>
          </div>
          <TextToolbar el={selected?.kind === "text" ? selected : null} patch={(pt) => selected && patchEl(selected.id, pt)} />
          <div className={`idg-sides${visibleSides.length === 1 ? " is-single" : ""}`}>
            {visibleSides.map((s) => (
              <div key={s} className={`idg-side${side === s ? " is-active" : ""}`} onPointerDownCapture={() => { if (side !== s) setSide(s); }}>
                {visibleSides.length > 1 && <div className="idg-side-label">{s === "front" ? "Front" : "Back"}{side === s ? " · adding here" : ""}</div>}
                <CardCanvas
                  layout={layout}
                  side={s}
                  row={previewRow}
                  template={templates[s]?.bitmap ?? null}
                  media={previewResolver}
                  selectedId={selectedId}
                  zoom={zoom}
                  onSelect={setSelectedId}
                  onChange={patchEl}
                  onDelete={removeEl}
                  onDropColumn={(c, x, y) => { setSide(s); addEl(columnText(s, c, { x: Math.max(0, x), y: Math.max(0, y) })); }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Right: settings of the selected photo / text — always in the same place, can be hidden */}
        {panelOpen && (
          <aside className={`card idg-right${selected ? " has-sel" : ""}`}>
            <div className="idg-right-head">
              <h3>{selected ? (selected.kind === "text" ? (selected.column ? niceLabel(selected.column) : "Text") : selected.kind === "image" ? mediaLabel(selected.media) : selected.kind === "qr" ? "QR code" : "Barcode") : "Settings"}</h3>
              <button type="button" className="idg-tool" onClick={() => (window.matchMedia("(max-width: 760px)").matches ? setSelectedId(null) : setPanelOpen(false))} aria-label="Close settings">×</button>
            </div>
            {selected ? (
              <Properties
                key={selected.id}
                el={selected}
                columns={columns}
                patch={(pt) => patchEl(selected.id, pt)}
                onDelete={() => removeEl(selected.id)}
                onLayer={(d) => layerEl(selected.id, d)}
                onAlign={alignTexts}
                onFitBox={() => fitBox(selected.id)}
              />
            ) : (
              <p className="idg-muted">Click a field or photo on the card to change it.</p>
            )}
          </aside>
        )}
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate ID cards" onClick={() => setConfirmOpen(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">{onlyFailed ? `Regenerate ${ready.length} corrected ID cards?` : `Generate ${ready.length} ID cards?`}</h3>
            <p className="text-sm text-text-muted">
              {orgName}{className ? ` · ${className}` : " · all classes"}. {outFolder ? `Saved into “${outFolder.name}”` : "One ZIP is downloaded"} with a <b>Front</b> folder{sideMode === "double" ? " and a Back folder" : ""} (JPG files named by Photo ID, {cardInfo}),
              print sheets on {sheetLabel}{print.landscape ? " (horizontal)" : ""} as a PDF and a ZIP of images, and a details sheet.
              {noPhotoInBatch > 0 ? ` ${noPhotoInBatch} without a photo get an empty photo area.` : ""}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={() => void generate()}>OK, generate</button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <BatchPreview
          layout={genLayout}
          rows={ready}
          start={previewIndex}
          templates={genTemplates}
          resolverFor={resolverFor}
          nameCol="Name"
          idCol="Photo ID"
          showBack={sideMode === "double"}
          dpi={outputDpi}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
