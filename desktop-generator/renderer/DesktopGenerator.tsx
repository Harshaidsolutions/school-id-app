import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { niceLabel } from "@admin/utils/formFieldHelpers";
import { detectRoles } from "@gen/columns";
import { blankLayout, isLayout, newImage, newText, uid } from "@gen/defaults";
import { clearDraft, loadDraft, saveDraft, type Draft } from "@gen/draftStore";
import { exportBundle, type CardProblem, type OutputFolder } from "@gen/exporter";
import { ensureFonts, restoreCustomFonts } from "@gen/fonts";
import { CARD_SIZES, SHEET_SIZES } from "@gen/impose";
import { dataUrlToBlob, fileToDataUrl } from "@gen/imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "@gen/media";
import { blobToBitmap, mediaLabel, type Bitmap, type MediaResolver } from "@gen/render";
import type { CardElement, Layout, MediaStore, Row, Side, TextElement } from "@gen/types";
import { BatchPreview } from "@gen/ui/BatchPreview";
import { CardCanvas } from "@gen/ui/CardCanvas";
import { Field, Properties, TextToolbar } from "@gen/ui/Inspector";
import { desktop, type LicenseStatus } from "./bridge";
import { pdfToImage } from "./pdfTemplate";
import { readSheet } from "./sheet";

type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob } | null;
type SideMode = "single" | "double";
type Stage = "input" | "output" | "editor";
type DesignFile = {
  kind: "msidc-design-v1";
  layout: Layout;
  sideMode?: SideMode;
  templates: { front?: { name: string; data: string }; back?: { name: string; data: string } };
};

const DRAFT_KEY = "desktop";
const FOLDER_KEY = "idg-desk-folder";
const FAILED_KEY = "idg-desk-failed";
const ROW_NUMBER = "__row";

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "ID cards";
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

/** Text formatting that new text fields copy from the last text styled (not the position). */
const STYLE_KEYS = ["font", "weight", "italic", "underline", "size", "minSize", "autoShrink", "multiline", "textCase", "align", "vAlign", "letterSpacing", "lineHeight", "color", "gradient", "stroke"] as const;
type TextStyle = Partial<Pick<TextElement, (typeof STYLE_KEYS)[number]>>;
const pickStyle = (el: Partial<TextElement>): TextStyle => {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (el[k] !== undefined) out[k] = el[k];
  return out as TextStyle;
};

/** A folder on this computer, written through the app (same shape the exporter uses for a browser folder). */
function folderTarget(root: string, onWrite: (fullPath: string) => void): OutputFolder {
  const make = (rel: string): OutputFolder => ({
    name: rel ? baseName(rel) : baseName(root),
    getDirectoryHandle: async (n) => make(rel ? `${rel}/${n}` : n),
    getFileHandle: async (n) => ({
      createWritable: async () => {
        const parts: Blob[] = [];
        return {
          write: async (d: Blob) => { parts.push(d); },
          close: async () => {
            const full = await desktop().writeInFolder(root, rel ? `${rel}/${n}` : n, await new Blob(parts).arrayBuffer());
            onWrite(full);
          },
        };
      },
    }),
  });
  return make("");
}

/**
 * Offline ID card generator (Windows) — the same screens as the website's generator:
 *   1. Input   — Excel / CSV, photos, and the template (single side or front & back)
 *   2. Output  — press sheet / paper, gap and margin, and where to save
 *   3. Editor  — columns on the left, the card(s) in the middle, the selected item on the right
 */
export function DesktopGenerator({ license }: { license: LicenseStatus }) {
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  const [stage, setStage] = useState<Stage>("input");
  const [jobName, setJobName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [classCol, setClassCol] = useState("");
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [outFolder, setOutFolder] = useState<string | null>(() => store.get(FOLDER_KEY));

  const [layout, setLayout] = useState<Layout>(() => blankLayout());
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [sideMode, setSideMode] = useState<SideMode>("single");
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplDialog, setTplDialog] = useState(false);
  const [saveDialog, setSaveDialog] = useState(false);
  const textStyle = useRef<TextStyle>({});
  const [print, setPrint] = useState({ sheetKey: "a4", landscape: false, gap: 3, margin: 8 });
  const [failedIds, setFailedIds] = useState<string[]>(() => { try { const v = JSON.parse(store.get(FAILED_KEY) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; } });
  const [onlyFailed, setOnlyFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const savedSnapshot = useRef<string>("");
  const restored = useRef(false);

  const visibleSides: Side[] = sideMode === "double" ? ["front", "back"] : ["front"];
  const matchColumn = layout.matchColumn;
  const byRow = layout.matchBy === "rownumber";
  const idCol = matchColumn || columns[0] || "Photo ID";
  const nameCol = layout.roles.name || columns.find((c) => /name/i.test(c)) || columns[0] || "Name";

  useEffect(() => { void restoreCustomFonts(); }, []);

  // ---------- Excel / CSV ----------
  async function importSheet(file: File) {
    setBusy({ label: "Reading Excel…", done: 0, total: 0 });
    try {
      const sheet = await readSheet(file);
      const roles = detectRoles(sheet.columns);
      const match = sheet.columns.find((c) => /photo\s*(id|no|number)/i.test(c)) || roles.admission || sheet.columns[0] || "";
      setColumns(sheet.columns);
      setRows(sheet.rows);
      setSheetName(file.name);
      if (!jobName) setJobName(file.name.replace(/\.[^.]+$/, ""));
      setClassCol(roles.classSection || roles.class || "");
      setClassName("");
      setLayout((l) => ({ ...l, roles, matchColumn: match, matchBy: "column" }));
      say(`${sheet.rows.length} rows and ${sheet.columns.length} columns loaded from “${file.name}”. Photos are matched by “${match}”.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "The file could not be read.", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- media ----------
  const resolverFor = useCallback((index: number): MediaResolver => async (kind, el) => {
    try {
      if (kind === "static") return el.imageData ? await blobToBitmap(await dataUrlToBlob(el.imageData)) : null;
      const row = rows[index];
      if (!row) return null;
      if (kind === "photo" || kind === "parentSign" || kind === "thumb") {
        const map = kind === "photo" ? media.photo : kind === "parentSign" ? media.parentSign : media.thumb;
        const blob = findMedia(map, row, matchColumn, index, layout.matchBy);
        return blob ? await blobToBitmap(blob) : null;
      }
      if (kind === "principalSign") return media.principalSign ? await blobToBitmap(media.principalSign) : null;
      if (kind === "logo") return media.logo ? await blobToBitmap(media.logo) : null;
      return null;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, matchColumn, layout.matchBy]);

  const hasPhoto = useCallback((index: number) => {
    const row = rows[index];
    return Boolean(row && findMedia(media.photo, row, matchColumn, index, layout.matchBy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, matchColumn, layout.matchBy]);

  // ---------- class selection ----------
  const classes = useMemo(() => (classCol ? Array.from(new Set(rows.map((r) => r[classCol]).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : []), [rows, classCol]);
  const inClass = useMemo(() => rows.map((row, index) => ({ row, index })).filter(({ row }) => !className || row[classCol] === className), [rows, className, classCol]);
  const withPhoto = useMemo(() => inClass.filter(({ index }) => hasPhoto(index)), [inClass, hasPhoto]);
  const needsPhoto = layout.elements.some((e) => e.kind === "image" && e.media === "photo");
  const readyAll = needsPhoto ? withPhoto : inClass;
  const ready = useMemo(
    () => (onlyFailed && failedIds.length ? readyAll.filter(({ row }) => failedIds.includes(row[idCol] ?? "")) : readyAll),
    [readyAll, onlyFailed, failedIds, idCol]
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
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, sizeCard = true) {
    const bitmap = await blobToBitmap(blob, 6000);
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob } };
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
      const blob = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await pdfToImage(file) : file;
      await setTemplateFromBlob(target, blob, file.name);
      say(`${target === "front" ? "Front" : "Back"} template added.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Template could not be loaded.", "error");
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
    () => JSON.stringify({ layout, sideMode, f: templates.front?.name ?? null, b: sideMode === "double" ? templates.back?.name ?? null : null }),
    [layout, sideMode, templates]
  );

  // ---------- reopen where the user left off (unsaved work is kept on this computer) ----------
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    void (async () => {
      const draft = await loadDraft(DRAFT_KEY);
      if (!draft) { savedSnapshot.current = snapshot(); return; }
      setBusy({ label: "Opening your unsaved work…", done: 0, total: 0 });
      try {
        setLayout(draft.layout);
        setSideMode(draft.sideMode);
        setPrint(draft.print);
        if (draft.templates.front) await setTemplateFromBlob("front", draft.templates.front.blob, draft.templates.front.name, false);
        if (draft.templates.back) await setTemplateFromBlob("back", draft.templates.back.blob, draft.templates.back.name, false);
        savedSnapshot.current = draft.savedSnapshot;
        say("Your last design was restored. Import the Excel file and photos to continue.", "info");
      } finally {
        setBusy(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirty = restored.current && savedSnapshot.current !== "" && snapshot() !== savedSnapshot.current;

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      if (!dirty) { void clearDraft(DRAFT_KEY); return; }
      const slot = (s: TemplateSlot) => (s ? { blob: s.blob, name: s.name } : null);
      const draft: Draft = {
        layout, sideMode, designId: null, print, className: "",
        templates: { front: slot(templates.front), back: slot(templates.back) },
        savedSnapshot: savedSnapshot.current,
        savedAt: Date.now(),
      };
      void saveDraft(DRAFT_KEY, draft);
    }, 700);
    return () => clearTimeout(t);
  }, [dirty, layout, sideMode, templates, print]);

  // ---------- design files (.msidc) ----------
  async function saveDesign(name: string): Promise<boolean> {
    if (!templates.front) { say("Upload a front template first.", "error"); return false; }
    setBusy({ label: "Saving design…", done: 0, total: 0 });
    try {
      const nextLayout = { ...layout, name };
      const design: DesignFile = { kind: "msidc-design-v1", layout: nextLayout, sideMode, templates: {} };
      for (const s of visibleSides) {
        const t = templates[s];
        if (t) design.templates[s] = { name: t.name, data: await blobToDataUrl(t.blob) };
      }
      const data = new TextEncoder().encode(JSON.stringify(design));
      const res = await desktop().saveFile(`${safeName(name)}.msidc`, data.buffer as ArrayBuffer, [{ name: "ID card design", extensions: ["msidc"] }]);
      if (!res.saved) { say("Save cancelled.", "info"); return false; }
      setLayout(nextLayout);
      savedSnapshot.current = JSON.stringify({ layout: nextLayout, sideMode, f: templates.front.name, b: sideMode === "double" ? templates.back?.name ?? null : null });
      await clearDraft(DRAFT_KEY);
      say(`Design “${name}” saved to ${res.filePath}. Open it next time with “Open a saved design”.`, "ok");
      return true;
    } catch (e) {
      say(e instanceof Error ? e.message : "Design could not be saved.", "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function openDesign() {
    try {
      const file = await desktop().openFile([{ name: "ID card design", extensions: ["msidc"] }]);
      if (!file) return;
      setBusy({ label: "Opening design…", done: 0, total: 0 });
      const design = JSON.parse(new TextDecoder().decode(file.data)) as DesignFile;
      if (design.kind !== "msidc-design-v1" || !isLayout(design.layout)) throw new Error("This is not an ID card design file.");
      const mode: SideMode = design.sideMode ?? (design.templates.back || design.layout.elements.some((e) => e.side === "back") ? "double" : "single");
      const next = { ...design.layout, roles: Object.keys(layout.roles).length ? layout.roles : design.layout.roles, matchColumn: layout.matchColumn || design.layout.matchColumn, matchBy: layout.matchColumn ? layout.matchBy : design.layout.matchBy };
      setLayout(next);
      setSideMode(mode);
      setTemplates({ front: null, back: null });
      for (const s of ["front", "back"] as Side[]) {
        const t = design.templates[s];
        if (t) await setTemplateFromBlob(s, await dataUrlToBlob(t.data), t.name, false);
      }
      setSide("front");
      savedSnapshot.current = JSON.stringify({ layout: next, sideMode: mode, f: design.templates.front?.name ?? null, b: mode === "double" ? design.templates.back?.name ?? null : null });
      say(`Design “${design.layout.name}” opened.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Design could not be opened.", "error");
    } finally {
      setBusy(null);
    }
  }

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
      const matched = rows.filter((r, i) => findMedia(map, r, matchColumn, i, layout.matchBy)).length;
      say(`${count} ${kind === "photo" ? "photos" : "signatures"} added — ${matched} of ${rows.length} rows matched by ${byRow ? "row number" : `“${matchColumn}”`}.`, matched || !rows.length ? "ok" : "info");
      if (kind === "parentSign" && !layout.elements.some((e) => e.kind === "image" && e.media === "parentSign")) {
        addEl(newImage("front", "parentSign", { x: 30, y: 76, w: 20, h: 7 }));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "Files could not be read.", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- output folder ----------
  async function chooseFolder() {
    try {
      const picked = await desktop().pickFolder();
      if (!picked) return;
      setOutFolder(picked);
      store.set(FOLDER_KEY, picked);
    } catch (e) {
      say(e instanceof Error ? e.message : "That folder could not be opened.", "error");
    }
  }
  function resetToAsk() {
    setOutFolder(null);
    store.set(FOLDER_KEY, null);
  }

  // ---------- generate ----------
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
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const sheet = SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0];
      let lastWritten = "";
      const target = outFolder ? folderTarget(outFolder, (p) => { lastWritten = p; }) : null;
      const { file, problems, savedTo } = await exportBundle({
        outputFolder: target,
        layout: genLayout,
        rows: ready,
        columns,
        templates: genTemplates,
        media: resolverFor,
        fileNamePattern: byRow ? "card" : `{${idCol}}`,
        jobName: `${jobName || "ID cards"}${className ? ` - ${className}` : ""}${onlyFailed ? " - corrected" : ""}`,
        print: { sheet, landscape: print.landscape, gap: print.gap, margin: print.margin },
        idColumn: idCol,
        nameColumn: nameCol,
        dpi: outputDpi,
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      let where = "";
      if (file) {
        setBusy({ label: "Saving…", done: 0, total: 0 });
        const res = await desktop().saveFile(file.name, await file.blob.arrayBuffer(), [{ name: "ZIP folder", extensions: ["zip"] }]);
        if (!res.saved || !res.filePath) { say("Save cancelled.", "info"); return; }
        where = `saved to ${res.filePath}`;
        void desktop().reveal(res.filePath);
      } else {
        where = `saved in “${savedTo ?? baseName(outFolder ?? "")}”`;
        if (lastWritten) void desktop().reveal(lastWritten);
      }
      const ids = Array.from(new Set(problems.map((p: CardProblem) => p.id).filter(Boolean)));
      setFailedIds(ids);
      setOnlyFailed(false);
      store.set(FAILED_KEY, ids.length ? JSON.stringify(ids) : null);
      say(
        problems.length
          ? `${ready.length} ID cards ${where}. ${ids.length} card(s) have text that is cut off or outside the card — see “ERRORS - cards to correct.csv”, correct them, then use “Regenerate errors only”.`
          : `${ready.length} ID cards ready — ${where}.`,
        problems.length ? "error" : "ok"
      );
    } catch (e) {
      if ((e as Error).name === "AbortError") say("Generation cancelled.", "info");
      else say(e instanceof Error ? e.message : "ID cards could not be generated.", "error");
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

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
      <label className="idg-field is-wide">
        <span>Or open a saved design</span>
        <button type="button" className="btn-secondary" onClick={() => void openDesign()}>Open saved design (.msidc)…</button>
      </label>
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
      <div className="idg-top-title">
        <span className="idg-badge" aria-hidden>ID</span>
        <div>
          <h2>{jobName || "ID Card Generator"}</h2>
          <p>{rows.length} records · <b>{ready.length} ready</b>{className ? ` in ${className}` : ""}{missing > 0 ? ` · ${missing} without photo` : ""}{dirty ? " · unsaved changes" : ""} · Licensed to {license.customer}</p>
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
          <button type="button" className="btn-secondary" disabled={!templates.front || Boolean(busy)} onClick={() => setSaveDialog(true)}>Save design{dirty ? " •" : ""}</button>
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
          initial={layout.name === "My ID card layout" && jobName ? `${jobName} ID card` : layout.name}
          onCancel={() => setSaveDialog(false)}
          onSave={async (name) => { const ok = await saveDesign(name); if (ok) setSaveDialog(false); }}
        />
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
            <div className="idg-wiz-head"><span className="idg-wiz-num">1</span><div><h3>Records &amp; photos</h3><p className="idg-muted">{sheetName ? `From ${sheetName}` : "From your Excel or CSV file"}</p></div></div>
            <div className="idg-wiz-stats">
              <div><b>{inClass.length}</b><span>Records</span></div>
              <div className="is-ok"><b>{withPhoto.length}</b><span>With photo</span></div>
              <div className="is-warn"><b>{Math.max(0, inClass.length - withPhoto.length)}</b><span>Without photo</span></div>
            </div>
            <div className="idg-grid2">
              <Field label="School / batch name">
                <input className="input-field" value={jobName} placeholder="e.g. Sri Vidya High School" onChange={(e) => setJobName(e.target.value)} />
              </Field>
              <Field label="Class">
                <select className="input-field" value={className} disabled={!classCol} onChange={(e) => setClassName(e.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Class column">
                <select className="input-field" value={classCol} disabled={!columns.length} onChange={(e) => { setClassCol(e.target.value); setClassName(""); }}>
                  <option value="">None</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Photo file names match">
                <select className="input-field" value={byRow ? ROW_NUMBER : matchColumn} disabled={!columns.length} onChange={(e) => setLayout((l) => (e.target.value === ROW_NUMBER ? { ...l, matchBy: "rownumber" } : { ...l, matchBy: "column", matchColumn: e.target.value }))}>
                  {!columns.length && <option value="">Import Excel first</option>}
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  {columns.length > 0 && <option value={ROW_NUMBER}>Row number (1.jpg, 2.jpg…)</option>}
                </select>
              </Field>
            </div>
            <div className="idg-wiz-uploads">
              <label className="btn-primary">
                <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importSheet(f); }} />
                {rows.length ? "Change Excel / CSV" : "Import Excel / CSV"}
              </label>
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Bulk photos (ZIP / images){media.photo.size ? ` · ${media.photo.size}` : ""}
              </label>
              <label className="btn-secondary">
                <input type="file" multiple hidden {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Photos folder
              </label>
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
                Bulk signatures{media.parentSign.size ? ` · ${media.parentSign.size}` : ""}
              </label>
            </div>
            <p className="idg-muted">Photo file names must match the chosen column (for example 1023.jpg for Photo ID 1023).</p>
          </section>
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">2</span><div><h3>Template</h3><p className="idg-muted">One side, or front and back</p></div></div>
            {templatePicker}
          </section>
        </div>
        <div className="idg-wizard-foot">
          <span className="idg-muted">{!rows.length ? "Import the Excel / CSV file." : templatesReady ? "Template ready." : sideMode === "double" ? "Upload the front and back templates." : "Upload the template."}</span>
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
              <li className="idg-outwhere">
                <b>Save to</b>
                <span>
                  {outFolder ? <>Folder “{outFolder}” — a new sub-folder is made for each batch</> : "One ZIP file — you choose where to save it after Generate"}
                  <span className="idg-outbtns">
                    <button type="button" className="btn-secondary" onClick={() => void chooseFolder()}>{outFolder ? "Change folder…" : "Choose folder…"}</button>
                    {outFolder && <button type="button" className="btn-secondary" onClick={resetToAsk}>Save as ZIP instead</button>}
                  </span>
                </span>
              </li>
              <li><b>Front folder</b><span>Front/&lt;{byRow ? "row number" : idCol}&gt;.png</span></li>
              {sideMode === "double" && <li><b>Back folder</b><span>Back/&lt;{byRow ? "row number" : idCol}&gt;.png</span></li>}
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
            {!columns.length && <li className="idg-muted">Import an Excel or CSV file in step 1 to see its columns.</li>}
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

        <section className="card idg-center">
          <div className="idg-center-bar">
            <label className="idg-class">
              <span>Class</span>
              <select className="input-field" value={className} disabled={!classCol} onChange={(e) => setClassName(e.target.value)}>
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
              {jobName || "ID cards"}{className ? ` · ${className}` : " · all classes"}. {outFolder ? `Saved into “${baseName(outFolder)}”` : "One ZIP is saved on this computer"} with a <b>Front</b> folder{sideMode === "double" ? " and a Back folder" : ""} (files named by {byRow ? "row number" : idCol}, {outputDpi} DPI — the template's resolution),
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
          nameCol={nameCol}
          idCol={idCol}
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
        <p className="text-sm text-text-muted">Saves a .msidc file with the template and every field exactly where you placed them. Open it again any time from step 1.</p>
        <Field label="Design name" wide><input className="input-field" value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) void onSave(name.trim()); }} /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!name.trim()} onClick={() => void onSave(name.trim())}>Save</button>
        </div>
      </div>
    </div>
  );
}
