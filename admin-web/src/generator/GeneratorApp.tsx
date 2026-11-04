import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/client";
import type { Student, Template } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { detectRoles } from "./columns";
import { blankLayout, isLayout, newImage, newText, uid } from "./defaults";
import { clearDraft, loadDraft, saveDraft, type Draft } from "./draftStore";
import { exportBundle, type CardProblem, type ExportFile } from "./exporter";
import { ensureFonts, restoreCustomFonts } from "./fonts";
import { CARD_SIZES, SHEET_SIZES } from "./impose";
import { dataUrlToBlob, fileToDataUrl } from "./imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "./media";
import { blobToBitmap, mediaLabel, type Bitmap, type MediaResolver } from "./render";
import type { CardElement, Layout, MediaStore, Row, Side, TextElement } from "./types";
import { BatchPreview } from "./ui/BatchPreview";
import { CardCanvas } from "./ui/CardCanvas";
import { Field, Properties, TextToolbar } from "./ui/Inspector";
import { niceLabel } from "../utils/formFieldHelpers";

type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob; libraryId?: string } | null;
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
 * ID card generator for one school / institute — same flow as the desktop app:
 *   1. Input   — records, photos, and the template (single side or front & back)
 *   2. Output  — press sheet / paper, gap and margin; cards come out at the template's resolution
 *   3. Editor  — playground: columns on the left, the card(s) in the middle, the selected item on the right
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
  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const serverBlobs = useRef(new Map<string, Blob>());

  const [layout, setLayout] = useState<Layout>(() => blankLayout());
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [sideMode, setSideMode] = useState<SideMode>("single");
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [library, setLibrary] = useState<Template[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplDialog, setTplDialog] = useState(false);
  const [saveDialog, setSaveDialog] = useState<{ thenLeave: boolean } | null>(null);
  const [leaveDialog, setLeaveDialog] = useState(false);
  const textStyle = useRef<TextStyle>({});
  const [print, setPrint] = useState({ sheetKey: "a4", landscape: false, gap: 3, margin: 8 });
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Saved-design tracking: what was last saved, and whether the admin changed anything since.
  const [designId, setDesignId] = useState<string | null>(null);
  const savedSnapshot = useRef<string>("");
  const restored = useRef(false);
  const leaving = useRef(false);

  const visibleSides: Side[] = sideMode === "double" ? ["front", "back"] : ["front"];

  useEffect(() => { void restoreCustomFonts(); }, []);
  useEffect(() => {
    api.get<{ templates: Template[] }>("/admin/templates")
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

  // ---------- class selection: people of the class who have a photo ----------
  const classes = useMemo(() => Array.from(new Set(rows.map((r) => r.Class).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [rows]);
  const inClass = useMemo(() => rows.map((row, index) => ({ row, index })).filter(({ row }) => !className || row.Class === className), [rows, className]);
  const readyAll = useMemo(() => inClass.filter(({ index }) => hasPhoto(index)), [inClass, hasPhoto]);
  const ready = useMemo(
    () => (onlyFailed && failedIds.length ? readyAll.filter(({ row }) => failedIds.includes(row["Photo ID"] ?? "")) : readyAll),
    [readyAll, onlyFailed, failedIds]
  );
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
  /** New text field: the default box (Arial 8 pt, X 18, Y 55, 30 × 3.5 mm) with the last formatting used. */
  const styledText = (s: Side, column: string, at: Partial<TextElement> = {}) => newText(s, column, { ...textStyle.current, ...at });
  const columnText = (s: Side, column: string, at: Partial<TextElement> = {}) => styledText(s, column, { prefix: `${niceLabel(column)}: `, ...at });
  const addEl = (el: CardElement) => { setLayout((l) => ({ ...l, elements: [...l.elements, el] })); setSelectedId(el.id); };
  const removeEl = (id: string) => { setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) })); setSelectedId(null); };
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
  /** The card takes the template's own size: a standard size when the shape matches, otherwise its pixels at 300 DPI. */
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, libraryId?: string, sizeCard = true) {
    const bitmap = await blobToBitmap(blob, 6000);
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, libraryId } };
    });
    if (!sizeCard || target !== "front") return;
    const ratio = bitmap.width / bitmap.height;
    const match = CARD_SIZES.find((c) => Math.abs(c.w / c.h - ratio) / ratio < 0.02);
    const card = match ?? { key: "custom", label: `Template size (${bitmap.width} × ${bitmap.height} px)`, w: +((bitmap.width / 300) * 25.4).toFixed(2), h: +((bitmap.height / 300) * 25.4).toFixed(2) };
    setLayout((l) => ({ ...l, card }));
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

  async function applyDesign(t: Template, quiet = false) {
    if (!isLayout(t.config_json)) return;
    const saved = t.config_json as Layout & { sideMode?: SideMode };
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
    setDesignId(t.id);
    setSide("front");
    savedSnapshot.current = JSON.stringify({ layout: { ...saved, roles: layout.roles, matchColumn: "Photo ID", matchBy: "column" }, sideMode: mode, f: frontId, b: mode === "double" ? saved.backTemplateId ?? null : null });
    if (!quiet) say(`Design “${t.name}” opened.`, "ok");
  }

  async function loadLibraryTemplate(t: Template) {
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      if (isLayout(t.config_json)) await applyDesign(t);
      else {
        const r = await api.get(`/admin/id-generator/template-image/${t.id}`, { responseType: "blob" });
        await setTemplateFromBlob("front", r.data, t.name, t.id);
        say(`Template “${t.name}” added.`, "ok");
      }
    } catch (e) {
      say(apiError(e, "Template could not be loaded."), "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- reopen where the admin left off: unsaved draft first, else the last saved design ----------
  useEffect(() => {
    if (restored.current || !orgId || !libraryLoaded || !studentsLoaded) return;
    restored.current = true;
    void (async () => {
      const draft = await loadDraft(orgId);
      if (draft) {
        setBusy({ label: "Opening your unsaved work…", done: 0, total: 0 });
        try {
          setLayout((l) => ({ ...draft.layout, roles: l.roles, matchColumn: "Photo ID", matchBy: "column" }));
          setSideMode(draft.sideMode);
          setPrint(draft.print);
          setClassName(draft.className);
          setDesignId(draft.designId);
          if (draft.templates.front) await setTemplateFromBlob("front", draft.templates.front.blob, draft.templates.front.name, draft.templates.front.libraryId, false);
          if (draft.templates.back) await setTemplateFromBlob("back", draft.templates.back.blob, draft.templates.back.name, draft.templates.back.libraryId, false);
          savedSnapshot.current = draft.savedSnapshot;
          setStage("editor");
          say("Your unsaved changes were restored. Click “Save design” to keep them.", "info");
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
        setBusy({ label: "Opening your saved design…", done: 0, total: 0 });
        try {
          if (isLayout(pick.config_json)) await applyDesign(pick, true);
          else await loadLibraryTemplate(pick);
          if (isLayout(pick.config_json)) say(`Saved design “${pick.name}” opened.`, "ok");
        } catch (e) {
          say(apiError(e, "Saved design could not be opened."), "error");
        } finally {
          setBusy(null);
        }
      } else {
        savedSnapshot.current = snapshot();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, libraryLoaded, studentsLoaded]);

  const dirty = restored.current && savedSnapshot.current !== "" && snapshot() !== savedSnapshot.current;

  // Keep unsaved work in the browser so a refresh / close / app restart reopens it.
  useEffect(() => {
    if (!orgId || !restored.current) return;
    const t = setTimeout(() => {
      if (!dirty) { void clearDraft(orgId); return; }
      const slot = (s: TemplateSlot) => (s ? { blob: s.blob, name: s.name, libraryId: s.libraryId } : null);
      const draft: Draft = {
        layout, sideMode, designId, print, className,
        templates: { front: slot(templates.front), back: slot(templates.back) },
        savedSnapshot: savedSnapshot.current,
        savedAt: Date.now(),
      };
      void saveDraft(orgId, draft);
    }, 700);
    return () => clearTimeout(t);
  }, [dirty, layout, sideMode, templates, designId, print, className, orgId]);

  // Refresh / close the tab with unsaved changes → the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  // ---------- save design (kept on the server: still there after logout, on any device) ----------
  async function saveDesign(name: string): Promise<boolean> {
    if (!templates.front) { say("Upload a front template first.", "error"); return false; }
    setBusy({ label: "Saving design…", done: 0, total: 0 });
    try {
      const both = sideMode === "double";
      const orientation = (two: boolean) => `${layout.card.h >= layout.card.w ? "vertical" : "horizontal"}_${two ? "both" : "single"}`;
      let backId = both ? templates.back?.libraryId : undefined;
      if (both && templates.back && !backId) {
        const form = new FormData();
        form.append("name", `${name} (back)`);
        form.append("orientation", orientation(false));
        form.append("image", templates.back.blob, templates.back.name || "back.png");
        const { data } = await api.post("/admin/templates", form);
        backId = data.template?.id;
      }
      const nextLayout = { ...layout, name };
      const form = new FormData();
      form.append("name", name);
      form.append("orientation", orientation(both));
      const config = { ...nextLayout, orgId, sideMode, backTemplateId: backId, frontTemplateId: templates.front.libraryId };
      form.append("config_json", JSON.stringify(config));
      if (!templates.front.libraryId) form.append("image", templates.front.blob, templates.front.name || "front.png");
      const { data } = designId ? await api.put(`/admin/templates/${designId}`, form) : await api.post("/admin/templates", form);
      const saved = data.template as Template | undefined;
      if (saved) {
        setLibrary((l) => [saved, ...l.filter((x) => x.id !== saved.id)]);
        setDesignId(saved.id);
        const frontId = templates.front.libraryId ?? saved.id;
        setTemplates((t) => ({
          front: t.front ? { ...t.front, libraryId: frontId } : t.front,
          back: t.back && backId ? { ...t.back, libraryId: backId } : t.back,
        }));
        setLayout(nextLayout);
        savedSnapshot.current = JSON.stringify({ layout: nextLayout, sideMode, f: frontId, b: both ? backId ?? null : null });
      }
      await clearDraft(orgId);
      say(`Design “${name}” saved. It opens automatically next time, on any device.`, "ok");
      return true;
    } catch (e) {
      say(apiError(e, "Design could not be saved."), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const backTo = orgId ? (orgKind === "school" ? `/students?schoolId=${orgId}&schoolName=${encodeURIComponent(orgName)}` : `/institute-members?instituteId=${orgId}&instituteName=${encodeURIComponent(orgName)}`) : "/schools";
  const leave = async (discard: boolean) => {
    leaving.current = true;
    if (discard) await clearDraft(orgId);
    navigate(backTo);
  };
  const onBack = () => (dirty ? setLeaveDialog(true) : void leave(false));

  // ---------- bulk photos / signatures ----------
  async function addBulk(list: FileList, kind: "photo" | "parentSign") {
    setBusy({ label: kind === "photo" ? "Reading photos…" : "Reading signatures…", done: 0, total: 0 });
    try {
      const files = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) files.push(...(await filesFromZip(f)));
        else files.push(...filesFromInput([f]));
      }
      const summary = addToStore(media, files, kind);
      setMedia(media);
      setMediaVersion((v) => v + 1);
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
  /** Output resolution = the template's own resolution (pixels across the card width). */
  const outputDpi = templates.front ? Math.round((templates.front.bitmap.width / layout.card.w) * 25.4) : 300;
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
      const { file, problems } = await exportBundle({
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
      download(file);
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
          ? `${ready.length} ID cards downloaded. ${ids.length} card(s) have text that is cut off or outside the card — see “ERRORS - cards to correct.csv” in the ZIP, correct them, then use “Regenerate errors only”.`
          : `${ready.length} ID cards ready — “${file.name}” downloaded.${failedUploads ? ` ${failedUploads} could not be sent to the teacher app.` : " The cards now also show in the teacher app."}`,
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

  const savedDesigns = library.filter((t) => isLayout(t.config_json));
  const missing = inClass.length - ready.length;
  const sheetLabel = (SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0]).label;
  const templatesReady = Boolean(templates.front) && (sideMode === "single" || Boolean(templates.back));
  const steps: { key: Stage; label: string }[] = [
    { key: "input", label: "1. Input" },
    { key: "output", label: "2. Output" },
    { key: "editor", label: "3. Design & generate" },
  ];

  /** Template chooser: single side or front & back, with an upload / remove slot per side. */
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
              <div className="idg-slot-img">{t ? <img src={t.url} alt={`${s} template`} /> : <span>No {sideMode === "double" ? `${s} ` : ""}template yet</span>}</div>
              <div className="idg-slot-info">
                <b>{sideMode === "double" ? (s === "front" ? "Front side" : "Back side") : "Template"}</b>
                <small>{t ? `${t.name} · ${t.bitmap.width} × ${t.bitmap.height} px` : "PNG, JPG or PDF"}</small>
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
      {savedDesigns.length > 0 && (
        <label className="idg-field is-wide">
          <span>Or open a saved design</span>
          <select className="input-field" value="" onChange={(e) => { const t = library.find((x) => x.id === e.target.value); if (t) void loadLibraryTemplate(t); }}>
            <option value="">Choose a saved design…</option>
            {savedDesigns.slice(0, 50).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
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
        <span className="idg-badge" aria-hidden>ID</span>
        <div>
          <h2>{orgName || "ID Card Generator"}</h2>
          <p>{rows.length} {orgKind === "school" ? "students" : "members"} · <b>{ready.length} ready</b>{className ? ` in ${className}` : ""}{missing > 0 ? ` · ${missing} without photo` : ""}{dirty ? " · unsaved changes" : ""}</p>
        </div>
      </div>
      <nav className="idg-steps" aria-label="Steps">
        {steps.map((s) => (
          <button key={s.key} type="button" className={stage === s.key ? "is-on" : ""} onClick={() => setStage(s.key)} disabled={s.key === "editor" && !templates.front}>{s.label}</button>
        ))}
      </nav>
      {stage === "editor" && (
        <div className="idg-top-actions">
          <button type="button" className="btn-secondary" onClick={() => setTplDialog(true)}>Upload template{templates.front ? " ✓" : ""}</button>
          <button type="button" className="btn-secondary" disabled={!templates.front || Boolean(busy)} onClick={() => setSaveDialog({ thenLeave: false })}>Save design{dirty ? " •" : ""}</button>
        </div>
      )}
    </section>
  );

  const dialogs = (
    <>
      {tplDialog && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Upload template" onClick={() => setTplDialog(false)}>
          <div className="card workflow-dialog idg-dialog-wide" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">Upload template</h3>
            <p className="text-sm text-text-muted">Is this ID card printed on one side, or front and back?</p>
            {templatePicker}
            <div className="flex justify-end"><button type="button" className="btn-primary" onClick={() => setTplDialog(false)}>Done</button></div>
          </div>
        </div>
      )}
      {saveDialog && (
        <SaveDialog
          initial={layout.name === "My ID card layout" && orgName ? `${orgName} ID card` : layout.name}
          onCancel={() => setSaveDialog(null)}
          onSave={async (name) => {
            const ok = await saveDesign(name);
            const thenLeave = saveDialog.thenLeave;
            setSaveDialog(null);
            if (ok && thenLeave) await leave(false);
          }}
        />
      )}
      {leaveDialog && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Save changes?" onClick={() => setLeaveDialog(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">Do you want to save these changes?</h3>
            <p className="text-sm text-text-muted">Your design has changes that are not saved yet.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setLeaveDialog(false)}>Stay here</button>
              <button type="button" className="btn-secondary idg-danger" onClick={() => { setLeaveDialog(false); void leave(true); }}>Don't save</button>
              <button type="button" className="btn-primary" disabled={!templates.front} onClick={() => { setLeaveDialog(false); setSaveDialog({ thenLeave: true }); }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
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
            <div className="idg-wiz-stats">
              <div><b>{inClass.length}</b><span>{orgKind === "school" ? "Students" : "Members"}</span></div>
              <div className="is-ok"><b>{readyAll.length}</b><span>With photo</span></div>
              <div className="is-warn"><b>{Math.max(0, inClass.length - readyAll.length)}</b><span>Without photo</span></div>
            </div>
            <div className="idg-grid2">
              <Field label="Class">
                <select className="input-field" value={className} onChange={(e) => setClassName(e.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Photo file names match">
                <input className="input-field" value="Photo ID" readOnly />
              </Field>
            </div>
            <div className="idg-wiz-uploads">
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Bulk photos (ZIP / images){media.photo.size ? ` · ${media.photo.size}` : ""}
              </label>
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
                Bulk signatures{media.parentSign.size ? ` · ${media.parentSign.size}` : ""}
              </label>
            </div>
            <p className="idg-muted">Photos captured in the app are used automatically. Bulk photos are optional.</p>
          </section>
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">2</span><div><h3>Template</h3><p className="idg-muted">One side, or front and back</p></div></div>
            {templatePicker}
          </section>
        </div>
        <div className="idg-wizard-foot">
          <span className="idg-muted">{templatesReady ? "Template ready." : sideMode === "double" ? "Upload the front and back templates." : "Upload the template."}</span>
          <button type="button" className="btn-primary" disabled={!templates.front} onClick={() => setStage("output")}>Next: Output →</button>
        </div>
        {dialogs}
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
              <li><b>Where</b><span>One ZIP file in your Downloads folder</span></li>
              <li><b>Front folder</b><span>Front/&lt;Photo ID&gt;.png</span></li>
              {sideMode === "double" && <li><b>Back folder</b><span>Back/&lt;Photo ID&gt;.png</span></li>}
              <li><b>Resolution</b><span>{templates.front ? `${templates.front.bitmap.width} × ${templates.front.bitmap.height} px (${outputDpi} DPI) — same as the template` : "Upload a template first"}</span></li>
              <li><b>Card size</b><span>{layout.card.w} × {layout.card.h} mm</span></li>
              <li><b>Also</b><span>Print sheets PDF ({sheetLabel}), card details and an error list if text is cut off</span></li>
            </ul>
          </section>
        </div>
        <div className="idg-wizard-foot">
          <button type="button" className="btn-secondary" onClick={() => setStage("input")}>← Input</button>
          <button type="button" className="btn-primary" disabled={!templates.front} onClick={() => setStage("editor")}>Next: Design →</button>
        </div>
        {dialogs}
      </div>
    );
  }

  // ---------- Step 3: editor (playground) ----------
  return (
    <div className="app-page idg idg-simple idg-full">
      {header}
      {statusBar}

      <div className={`idg-workspace${selected ? "" : " is-panel-hidden"}`}>
        {/* Left: Excel columns (scroll on their own) + add field + Preview / Generate at the bottom */}
        <aside className="card idg-left">
          <h3>Excel columns</h3>
          <p className="idg-muted">Tap + to add to the {side} card, or drag onto a card.</p>
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
          <h3>Add field</h3>
          <div className="idg-add">
            <button type="button" onClick={() => addEl(styledText(side, "", { staticText: "Text" }))}><b>T</b>Text</button>
            <label className="idg-add-upload">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                try { addEl(newImage(side, "static", { x: 18, y: 30, w: 18, h: 18, fit: "contain", shape: "rect", border: { width: 0, color: "#4f46e5" }, cleanSignature: false, required: false, imageData: await fileToDataUrl(f) })); }
                catch (err) { say(err instanceof Error ? err.message : "Image could not be read.", "error"); }
              }} />
              <b>▣</b>Photo / QR image
            </label>
            <button type="button" onClick={() => addEl(newImage(side, "photo"))}><b>☺</b>Student photo</button>
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
              <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
            </div>
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
                  onDropColumn={(c, x, y) => { setSide(s); addEl(columnText(s, c, { x: Math.max(0, x - 10), y: Math.max(0, y - 2) })); }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Right: only the settings of the selected text / photo */}
        {selected && (
          <aside className="card idg-right">
            <div className="idg-right-head">
              <h3>{selected.kind === "text" ? (selected.column ? niceLabel(selected.column) : "Text") : selected.kind === "image" ? mediaLabel(selected.media) : selected.kind === "qr" ? "QR code" : "Barcode"}</h3>
              <button type="button" className="idg-tool" onClick={() => setSelectedId(null)} aria-label="Close">×</button>
            </div>
            <Properties
              el={selected}
              columns={columns}
              patch={(pt) => patchEl(selected.id, pt)}
              onDelete={() => removeEl(selected.id)}
              onDuplicate={() => addEl({ ...selected, id: uid(), x: selected.x + 2, y: selected.y + 2 } as CardElement)}
              onLayer={(d) => layerEl(selected.id, d)}
            />
          </aside>
        )}
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate ID cards" onClick={() => setConfirmOpen(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">{onlyFailed ? `Regenerate ${ready.length} corrected ID cards?` : `Generate ${ready.length} ID cards?`}</h3>
            <p className="text-sm text-text-muted">
              {orgName}{className ? ` · ${className}` : " · all classes"}. One ZIP is downloaded with a <b>Front</b> folder{sideMode === "double" ? " and a Back folder" : ""} (files named by Photo ID, {outputDpi} DPI — the template's resolution),
              print sheets on {sheetLabel}{print.landscape ? " (horizontal)" : ""} with crop marks, and a details sheet.
              {missing > 0 ? ` ${missing} without a photo are left out.` : ""}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => { setConfirmOpen(false); setStage("output"); }}>Change output</button>
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
      {dialogs}
    </div>
  );
}

function SaveDialog({ initial, onCancel, onSave }: { initial: string; onCancel: () => void; onSave: (name: string) => void | Promise<void> }) {
  const [name, setName] = useState(initial);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Save design" onClick={onCancel}>
      <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-text-navy">Save design</h3>
        <p className="text-sm text-text-muted">The template and every field stay exactly where you placed them — also after you log out, on any device.</p>
        <Field label="Design name" wide><input className="input-field" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void onSave(name.trim()); }} /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => void onSave(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}
