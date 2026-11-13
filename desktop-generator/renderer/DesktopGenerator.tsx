import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { niceLabel } from "@admin/utils/formFieldHelpers";
import { detectRoles } from "@gen/columns";
import { blankLayout, customCard, DEFAULT_DPI, fitLayoutToTemplate, newImage, newText, nextTextSpot, sizeText } from "@gen/defaults";
import { exportBundle, type CardProblem, type OutputFolder } from "@gen/exporter";
import { ensureFonts, restoreCustomFonts } from "@gen/fonts";
import { SHEET_SIZES } from "@gen/impose";
import { clearDraft, loadDraft, saveDraft, type Draft } from "@gen/draftStore";
import { dataUrlToBlob, readImageDpi } from "@gen/imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "@gen/media";
import { blobToBitmap, measureTextBox, mediaLabel, textValue, type Bitmap, type MediaResolver } from "@gen/render";
import type { CardElement, Layout, MediaStore, Row, Side, TextElement } from "@gen/types";
import { BatchPreview } from "@gen/ui/BatchPreview";
import { CardCanvas } from "@gen/ui/CardCanvas";
import { Field, Num, Properties, TextToolbar } from "@gen/ui/Inspector";
import { desktop, type LicenseStatus } from "./bridge";
import { pdfToImage } from "./pdfTemplate";
import { readSheet } from "./sheet";

export const APP_NAME = "Harsha ID Solutions – ID Card Generator";

type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob; dpi: number } | null;
type SideMode = "single" | "double";
type Stage = "input" | "output" | "editor";

const ROW_NUMBER = "__row";
/** The design used for the last Generate: offered (never applied automatically) on the next start. */
const LAST_DESIGN = "desktop-last-design";
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

/** Text formatting that new text fields copy from the last text styled (not the position). */
const STYLE_KEYS = ["font", "weight", "italic", "underline", "size", "minSize", "autoShrink", "multiline", "textCase", "align", "vAlign", "letterSpacing", "lineHeight", "color", "gradient", "stroke"] as const;
type TextStyle = Partial<Pick<TextElement, (typeof STYLE_KEYS)[number]>>;
const pickStyle = (el: Partial<TextElement>): TextStyle => {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (el[k] !== undefined) out[k] = el[k];
  return out as TextStyle;
};

/** Where picked files live on this computer: the full path of a file, or of the folder it was chosen from. */
function pickedPath(files: File[]): string {
  const first = files[0];
  if (!first) return "";
  const full = desktop().pathForFile?.(first) ?? "";
  const rel = (first as File & { webkitRelativePath?: string }).webkitRelativePath ?? "";
  if (rel && full) {
    // Folder picked: cut the file's own path inside the folder off the full path.
    const depth = rel.split("/").length - 1;
    const parts = full.split(/[\\/]/);
    return parts.slice(0, parts.length - depth).join(full.includes("\\") ? "\\" : "/");
  }
  if (files.length > 1) return `${files.length} files${full ? ` from ${full.replace(/[\\/][^\\/]+$/, "")}` : ""}`;
  return full || first.name;
}

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
 *   1. Input   — Excel / CSV, photos, signatures, template and the output folder
 *   2. Output  — print sheets: paper, direction, gap and margin
 *   3. Editor  — columns on the left, the card(s) in the middle, the selected item on the right
 * Every launch starts clean: no Excel, template or folders from the previous school.
 */
export function DesktopGenerator({ license }: { license: LicenseStatus }) {
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  const [stage, setStage] = useState<Stage>("input");
  const [jobName, setJobName] = useState("");
  const [sheetPath, setSheetPath] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [classCol, setClassCol] = useState("");
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [photoPath, setPhotoPath] = useState("");
  const [signPath, setSignPath] = useState("");
  const [outFolder, setOutFolder] = useState<string | null>(null);

  const [layout, setLayout] = useState<Layout>(() => ({ ...blankLayout(), dpi: DEFAULT_DPI }));
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [sideMode, setSideMode] = useState<SideMode>("single");
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const textStyle = useRef<TextStyle>({});
  const [print, setPrint] = useState({ sheetKey: "a4", landscape: false, gap: 3, margin: 8 });
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const visibleSides: Side[] = sideMode === "double" ? ["front", "back"] : ["front"];
  const matchColumn = layout.matchColumn;
  const byRow = layout.matchBy === "rownumber";
  const idCol = matchColumn || columns[0] || "Photo ID";
  const nameCol = layout.roles.name || columns.find((c) => /name/i.test(c)) || columns[0] || "Name";

  useEffect(() => { void restoreCustomFonts(); }, []);

  // ---------- last design (replaces "Save design"): the start stays clean, reusing it is one click ----------
  const [lastDesign, setLastDesign] = useState<Draft | null>(null);
  useEffect(() => { void loadDraft(LAST_DESIGN).then((d) => setLastDesign(d ?? null)); }, []);
  async function applyLastDesign() {
    if (!lastDesign) return;
    setBusy({ label: "Opening the last design…", done: 0, total: 0 });
    try {
      setLayout((l) => ({ ...lastDesign.layout, roles: l.roles, matchColumn: l.matchColumn || lastDesign.layout.matchColumn, matchBy: l.matchColumn ? l.matchBy : lastDesign.layout.matchBy }));
      setSideMode(lastDesign.sideMode);
      setPrint(lastDesign.print);
      setTemplates({ front: null, back: null });
      if (lastDesign.templates.front) await setTemplateFromBlob("front", lastDesign.templates.front.blob, lastDesign.templates.front.name, false);
      if (lastDesign.templates.back) await setTemplateFromBlob("back", lastDesign.templates.back.blob, lastDesign.templates.back.name, false);
      say("Last design opened: template, fields and print settings.", "ok");
    } catch {
      say("The last design could not be opened.", "error");
    } finally {
      setBusy(null);
    }
  }
  function forgetLastDesign() {
    void clearDraft(LAST_DESIGN);
    setLastDesign(null);
  }

  // ---------- Excel / CSV ----------
  async function importSheet(file: File) {
    setBusy({ label: "Reading Excel…", done: 0, total: 0 });
    try {
      const sheet = await readSheet(file);
      const roles = detectRoles(sheet.columns);
      const match = sheet.columns.find((c) => /photo\s*(id|no|number)/i.test(c)) || roles.admission || sheet.columns[0] || "";
      setColumns(sheet.columns);
      setRows(sheet.rows);
      setSheetPath(pickedPath([file]));
      if (!jobName) setJobName(file.name.replace(/\.[^.]+$/, ""));
      setClassCol(roles.classSection || roles.class || "");
      setClassName("");
      setLayout((l) => ({ ...l, roles, matchColumn: match, matchBy: "column" }));
      say(`${sheet.rows.length} records and ${sheet.columns.length} columns loaded from “${file.name}”. Photos are matched by “${match}”.`, "ok");
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

  // ---------- records: every Excel record gets a card (a missing photo leaves an empty photo area) ----------
  const allRows = useMemo(() => rows.map((row, index) => ({ row, index })), [rows]);
  const withPhotoAll = useMemo(() => allRows.filter(({ index }) => hasPhoto(index)).length, [allRows, hasPhoto]);
  const classes = useMemo(() => (classCol ? Array.from(new Set(rows.map((r) => r[classCol]).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : []), [rows, classCol]);
  const inClass = useMemo(() => allRows.filter(({ row }) => !className || row[classCol] === className), [allRows, className, classCol]);
  const readyAll = inClass;
  const ready = useMemo(
    () => (onlyFailed && failedIds.length ? readyAll.filter(({ row }) => failedIds.includes(row[idCol] ?? "")) : readyAll),
    [readyAll, onlyFailed, failedIds, idCol]
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

  // ---------- templates (optional) ----------
  /** The card is exactly the template's own size: its pixels at its own DPI (read from the file, else 300). */
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, sizeCard = true) {
    const [bitmap, fileDpi] = await Promise.all([blobToBitmap(blob, 10000), readImageDpi(blob)]);
    const dpi = fileDpi ?? DEFAULT_DPI;
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, dpi } };
    });
    if (target === "front") setLayout((l) => (sizeCard ? fitLayoutToTemplate({ ...l, dpi }, bitmap.width, bitmap.height, dpi) : fitLayoutToTemplate(l, bitmap.width, bitmap.height, l.dpi ?? dpi)));
  }

  async function uploadTemplate(target: Side, file: File) {
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      const blob = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await pdfToImage(file) : file;
      await setTemplateFromBlob(target, blob, pickedPath([file]));
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

  // Photo / signature messages belong to step 1: don't repeat them in the editor.
  useEffect(() => {
    if (stage === "editor") setStatus((s) => (s && s.tone !== "error" ? null : s));
  }, [stage]);

  // ---------- bulk photos / signatures (optional) ----------
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
      if (kind === "photo") setPhotoPath(pickedPath(picked)); else setSignPath(pickedPath(picked));
      const count = kind === "photo" ? summary.photos : summary.parentSigns;
      const map = kind === "photo" ? media.photo : media.parentSign;
      const matched = rows.filter((r, i) => findMedia(map, r, matchColumn, i, layout.matchBy)).length;
      say(`${count} ${kind === "photo" ? "photos" : "signatures"} added — ${matched} of ${rows.length} records matched by ${byRow ? "row number" : `“${matchColumn}”`}.`, matched || !rows.length ? "ok" : "info");
      if (kind === "parentSign" && !layout.elements.some((e) => e.kind === "image" && e.media === "parentSign")) {
        addEl(newImage("front", "parentSign", { x: 30, y: 76, w: 20, h: 7 }));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "Files could not be read.", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- output folder (chosen once in step 1, used for every Generate) ----------
  async function chooseFolder() {
    try {
      const picked = await desktop().pickFolder();
      if (picked) setOutFolder(picked);
    } catch (e) {
      say(e instanceof Error ? e.message : "That folder could not be opened.", "error");
    }
  }

  // ---------- generate ----------
  const outputDpi = layout.dpi ?? templates.front?.dpi ?? DEFAULT_DPI;
  const genLayout = useMemo<Layout>(
    () => (sideMode === "double" ? layout : { ...layout, elements: layout.elements.filter((e) => e.side === "front") }),
    [layout, sideMode]
  );
  const genTemplates = { front: templates.front?.bitmap ?? null, back: sideMode === "double" ? templates.back?.bitmap ?? null : null };

  async function generate() {
    setConfirmOpen(false);
    if (!outFolder) { say("Choose the output folder in step 1.", "error"); setStage("input"); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const sheet = SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0];
      let lastWritten = "";
      const { problems, savedTo } = await exportBundle({
        outputFolder: folderTarget(outFolder, (p) => { lastWritten = p; }),
        layout: genLayout,
        rows: ready,
        columns,
        templates: genTemplates,
        media: resolverFor,
        fileNamePattern: byRow ? "{#}" : `{${idCol}}`,
        jobName: `${jobName || "ID cards"}${className ? ` - ${className}` : ""}${onlyFailed ? " - corrected" : ""}`,
        print: { sheet, landscape: print.landscape, gap: print.gap, margin: print.margin },
        idColumn: idCol,
        nameColumn: nameCol,
        dpi: outputDpi,
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      if (lastWritten) void desktop().reveal(lastWritten);
      // Keep this design so it can be reused next time with "Use last design".
      const slot = (t: TemplateSlot) => (t ? { blob: t.blob, name: t.name } : null);
      const keep: Draft = { layout, sideMode, designId: null, print, className: "", templates: { front: slot(templates.front), back: slot(templates.back) }, savedSnapshot: "", savedAt: Date.now() };
      void saveDraft(LAST_DESIGN, keep).then(() => setLastDesign(keep));
      const where = `saved in “${savedTo ?? baseName(outFolder)}”`;
      const ids = Array.from(new Set(problems.map((p: CardProblem) => p.id).filter(Boolean)));
      setFailedIds(ids);
      setOnlyFailed(false);
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

  const sheetLabel = (SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0]).label;
  const backMissing = sideMode === "double" && Boolean(templates.front) && !templates.back;
  const inputReady = rows.length > 0 && Boolean(outFolder) && !backMissing;
  const inputHint = !rows.length ? "Import the Excel / CSV file." : !outFolder ? "Choose the output folder." : backMissing ? "Upload the back template too (or choose Single side)." : "Ready.";
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
      <div className="idg-top-title">
        <img className="idg-brand" src="./harsha-h.png" alt="Harsha ID Solutions" />
        <div>
          <small className="idg-app-name">{APP_NAME}</small>
          <h2>{jobName || "New batch"}</h2>
        </div>
      </div>
      <nav className="idg-steps" aria-label="Steps">
        {steps.map((s, i) => (
          <button key={s.key} type="button" className={stage === s.key ? "is-on" : ""} onClick={() => setStage(s.key)} disabled={i > 0 && !inputReady}>{s.label}</button>
        ))}
      </nav>
      <span className="idg-licensed">Licensed to {license.customer}</span>
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
            <div className="idg-wiz-head"><span className="idg-wiz-num">1</span><div><h3>Records, photos &amp; output</h3><p className="idg-muted">Fields marked * are required</p></div></div>
            <div className="idg-wiz-stats is-four">
              <div><b>{rows.length}</b><span>Total records</span></div>
              <div><b>{media.photo.size}</b><span>Photos uploaded</span></div>
              <div className="is-ok"><b>{withPhotoAll}</b><span>Records with photo</span></div>
              <div className="is-warn"><b>{Math.max(0, rows.length - withPhotoAll)}</b><span>Records without photo</span></div>
            </div>
            <div className="idg-pickrow">
              <label className={rows.length ? "btn-secondary" : "btn-primary"}>
                <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importSheet(f); }} />
                {rows.length ? "Change Excel / CSV" : "Import Excel / CSV *"}
              </label>
              <span className="idg-path">{sheetPath ? <><b>{baseName(sheetPath)}</b> — {sheetPath}</> : "Required"}</span>
            </div>
            <div className="idg-pickrow">
              <label className="btn-secondary">
                <input type="file" multiple hidden {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Photos folder
              </label>
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
                Photos ZIP / images
              </label>
              <span className="idg-path">{photoPath || "Optional — cards without a photo get an empty photo area"}</span>
            </div>
            <div className="idg-pickrow">
              <label className="btn-secondary">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
                Signatures
              </label>
              <span className="idg-path">{signPath || "Optional"}</span>
            </div>
            <div className="idg-pickrow">
              <button type="button" className={outFolder ? "btn-secondary" : "btn-primary"} onClick={() => void chooseFolder()}>{outFolder ? "Change output folder" : "Choose output folder *"}</button>
              <span className="idg-path">{outFolder ? <><b>{outFolder}</b> — Front and Back folders are made inside it</> : "Required — you can also make a new folder in the window that opens"}</span>
            </div>
            <div className="idg-grid2">
              <Field label="School / batch name">
                <input className="input-field" value={jobName} placeholder="e.g. Sri Vidya High School" onChange={(e) => setJobName(e.target.value)} />
              </Field>
              <Field label="Photo file names match">
                <select className="input-field" value={byRow ? ROW_NUMBER : matchColumn} disabled={!columns.length} onChange={(e) => setLayout((l) => (e.target.value === ROW_NUMBER ? { ...l, matchBy: "rownumber" } : { ...l, matchBy: "column", matchColumn: e.target.value }))}>
                  {!columns.length && <option value="">Import Excel first</option>}
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  {columns.length > 0 && <option value={ROW_NUMBER}>Row number (1.jpg, 2.jpg…)</option>}
                </select>
              </Field>
              <Field label="Class column (for class-wise generation)">
                <select className="input-field" value={classCol} disabled={!columns.length} onChange={(e) => { setClassCol(e.target.value); setClassName(""); }}>
                  <option value="">None</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            </div>
          </section>
          <section className="card idg-wiz-card">
            <div className="idg-wiz-head"><span className="idg-wiz-num">2</span><div><h3>Template</h3><p className="idg-muted">Optional — one side, or front and back</p></div></div>
            {lastDesign && (
              <div className="idg-pickrow idg-lastdesign">
                <button type="button" className="btn-secondary" onClick={() => void applyLastDesign()}>Use last design</button>
                <span className="idg-path">Template, fields and print settings from the last Generate ({new Date(lastDesign.savedAt).toLocaleDateString("en-IN")})</span>
                <button type="button" className="idg-linkbtn" onClick={forgetLastDesign}>Forget it</button>
              </div>
            )}
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
              <li><b>Save to</b><span>{outFolder ?? "—"} (a new folder for each batch)</span></li>
              <li><b>Front folder</b><span>Front/&lt;{byRow ? "row number" : idCol}&gt;.jpg</span></li>
              {sideMode === "double" && <li><b>Back folder</b><span>Back/&lt;{byRow ? "row number" : idCol}&gt;.jpg</span></li>}
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
            {!columns.length && <li className="idg-muted">Import an Excel or CSV file in step 1 to see its columns.</li>}
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
              {jobName || "ID cards"}{className ? ` · ${className}` : " · all classes"}. Saved into “{outFolder ? baseName(outFolder) : ""}” with a <b>Front</b> folder{sideMode === "double" ? " and a Back folder" : ""} (JPG files named by {byRow ? "row number" : idCol}, {cardInfo}),
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
          nameCol={nameCol}
          idCol={idCol}
          showBack={sideMode === "double"}
          dpi={outputDpi}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
