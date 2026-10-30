import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { detectRoles } from "@gen/columns";
import { defaultLayout, isLayout, newImage, newText, uid } from "@gen/defaults";
import { exportBundle } from "@gen/exporter";
import { ensureFonts, restoreCustomFonts } from "@gen/fonts";
import { CARD_SIZES } from "@gen/impose";
import { dataUrlToBlob, fileToDataUrl } from "@gen/imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "@gen/media";
import { blobToBitmap, mediaLabel, type Bitmap, type MediaResolver } from "@gen/render";
import type { CardElement, ImageElement, Layout, MediaStore, Row, Side } from "@gen/types";
import { BatchPreview } from "@gen/ui/BatchPreview";
import { CardCanvas } from "@gen/ui/CardCanvas";
import { Colour, Field, Num, Properties, SHAPES, TextToolbar } from "@gen/ui/Inspector";
import { desktop, type LicenseStatus } from "./bridge";
import { pdfToImage } from "./pdfTemplate";
import { readSheet } from "./sheet";

type TemplateSlot = { bitmap: Bitmap; name: string; blob: Blob } | null;
type CardBorder = NonNullable<Layout["cardBorder"]>;
type DesignFile = { kind: "msidc-design-v1"; layout: Layout; templates: { front?: { name: string; data: string }; back?: { name: string; data: string } } };

const isPhotoEl = (e: CardElement): e is ImageElement => e.kind === "image" && e.media === "photo";
const DEFAULT_BORDER: CardBorder = { width: 0, color: "#4f46e5", radius: 3, style: "solid" };
const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "ID cards";

/**
 * Offline ID card generator (Windows desktop).
 * Excel/CSV → columns; ZIP/folder of photos & signatures matched by an ID column;
 * PNG/JPG/PDF template; design on the card; Generate → one ZIP saved to this computer.
 */
export function DesktopGenerator({ license }: { license: LicenseStatus }) {
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  const [jobName, setJobName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [classCol, setClassCol] = useState("");
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [onlyWithPhoto, setOnlyWithPhoto] = useState(true);

  const [layout, setLayout] = useState<Layout>(() => ({ ...defaultLayout({}), cardBorder: DEFAULT_BORDER }));
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplMenu, setTplMenu] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { void restoreCustomFonts(); }, []);
  const matchColumn = layout.matchColumn;

  // ---------- Excel / CSV ----------
  async function importSheet(file: File) {
    setBusy({ label: "Reading Excel…", done: 0, total: 0 });
    try {
      const sheet = await readSheet(file);
      const roles = detectRoles(sheet.columns);
      const match = roles.admission || sheet.columns.find((c) => /photo\s*(id|no|number)/i.test(c)) || sheet.columns[0];
      setColumns(sheet.columns);
      setRows(sheet.rows);
      setSheetName(file.name);
      if (!jobName) setJobName(file.name.replace(/\.[^.]+$/, ""));
      const cls = roles.classSection || roles.class || "";
      setClassCol(cls);
      setClassName("");
      setLayout((l) => (l.elements.length > 1 ? { ...l, roles, matchColumn: match, matchBy: "column" } : { ...defaultLayout(roles, match), cardBorder: l.cardBorder }));
      say(`${sheet.rows.length} rows and ${sheet.columns.length} columns loaded from “${file.name}”. Photos will be matched by “${match}”.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "The file could not be read.", "error");
    } finally { setBusy(null); }
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
    } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, matchColumn, layout.matchBy]);

  const hasPhoto = useCallback((index: number) => {
    const row = rows[index];
    return Boolean(row && findMedia(media.photo, row, matchColumn, index, layout.matchBy));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, media, mediaVersion, matchColumn, layout.matchBy]);

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
      say(`${count} ${kind === "photo" ? "photos" : "signatures"} added — ${matched} of ${rows.length} rows matched by “${matchColumn || "row number"}”.`, matched ? "ok" : "info");
      if (kind === "parentSign" && !layout.elements.some((e) => e.kind === "image" && e.media === "parentSign")) addEl(newImage("front", "parentSign", { x: 30, y: 76, w: 20, h: 7 }));
    } catch (e) {
      say(e instanceof Error ? e.message : "Files could not be read.", "error");
    } finally { setBusy(null); }
  }

  async function setSingle(kind: "principalSign" | "logo", file: File) {
    media[kind] = file;
    setMedia(media);
    setMediaVersion((v) => v + 1);
    if (!layout.elements.some((e) => e.kind === "image" && e.media === kind)) addEl(newImage(side, kind, kind === "logo" ? { x: 4, y: 4, w: 12, h: 12, fit: "contain" } : { x: 34, y: 78, w: 18, h: 6, fit: "contain" }));
    say(kind === "logo" ? "School logo added." : "Principal signature added.", "ok");
  }

  // ---------- class filter ----------
  const classes = useMemo(() => classCol ? Array.from(new Set(rows.map((r) => r[classCol]).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [], [rows, classCol]);
  const inClass = useMemo(() => rows.map((row, index) => ({ row, index })).filter(({ row }) => !className || row[classCol] === className), [rows, className, classCol]);
  const needsPhoto = onlyWithPhoto && layout.elements.some(isPhotoEl);
  const ready = useMemo(() => (needsPhoto ? inClass.filter(({ index }) => hasPhoto(index)) : inClass), [inClass, hasPhoto, needsPhoto]);
  useEffect(() => { setPreviewIndex(0); }, [className]);
  const current = ready[Math.min(previewIndex, Math.max(0, ready.length - 1))] ?? inClass[0];
  const previewRow = current?.row ?? {};
  const previewResolver = useMemo(() => resolverFor(current?.index ?? -1), [resolverFor, current?.index]);

  // ---------- layout editing ----------
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;
  const patchEl = useCallback((id: string, patch: Partial<CardElement>) => {
    setLayout((l) => ({ ...l, elements: l.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as CardElement) : e)) }));
  }, []);
  const addEl = (el: CardElement) => { setLayout((l) => ({ ...l, elements: [...l.elements, el] })); setSelectedId(el.id); };
  const removeEl = (id: string) => { setLayout((l) => ({ ...l, elements: l.elements.filter((e) => e.id !== id) })); setSelectedId(null); };
  const layerEl = (id: string, dir: -1 | 1) => setLayout((l) => {
    const i = l.elements.findIndex((e) => e.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= l.elements.length) return l;
    const next = [...l.elements];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...l, elements: next };
  });
  useEffect(() => { void ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font)); }, [layout.elements]);

  const photoTargets = selected && isPhotoEl(selected) ? [selected] : layout.elements.filter(isPhotoEl);
  const photoStyle = photoTargets[0];
  const patchPhotos = (patch: Partial<ImageElement>) => photoTargets.forEach((p) => patchEl(p.id, patch));
  const border: CardBorder = layout.cardBorder ?? DEFAULT_BORDER;
  const setBorder = (patch: Partial<CardBorder>) => setLayout((l) => ({ ...l, cardBorder: { ...(l.cardBorder ?? DEFAULT_BORDER), ...patch } }));

  // ---------- templates ----------
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, fitCard = true) {
    const bitmap = await blobToBitmap(blob, 4000);
    setTemplates((t) => ({ ...t, [target]: { bitmap, name, blob } }));
    setSide(target);
    if (fitCard) {
      const ratio = bitmap.width / bitmap.height;
      const match = CARD_SIZES.find((c) => Math.abs(c.w / c.h - ratio) / ratio < 0.04);
      if (match) setLayout((l) => ({ ...l, card: match }));
    }
  }

  async function uploadTemplate(target: Side, file: File) {
    setTplMenu(false);
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      const blob = /\.pdf$/i.test(file.name) || file.type === "application/pdf" ? await pdfToImage(file) : file;
      await setTemplateFromBlob(target, blob, file.name);
      say(`${target === "front" ? "Front" : "Back"} template added.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Template could not be loaded.", "error");
    } finally { setBusy(null); }
  }

  // ---------- design files (.msidc) ----------
  async function saveDesign() {
    setBusy({ label: "Saving design…", done: 0, total: 0 });
    try {
      const design: DesignFile = { kind: "msidc-design-v1", layout, templates: {} };
      for (const s of ["front", "back"] as Side[]) {
        const t = templates[s];
        if (t) design.templates[s] = { name: t.name, data: await blobToDataUrl(t.blob) };
      }
      const data = new TextEncoder().encode(JSON.stringify(design));
      const res = await desktop().saveFile(`${safeName(layout.name)}.msidc`, data.buffer as ArrayBuffer, [{ name: "ID card design", extensions: ["msidc"] }]);
      if (res.saved) say(`Design saved: ${res.filePath}`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Design could not be saved.", "error");
    } finally { setBusy(null); }
  }

  async function openDesign() {
    setTplMenu(false);
    try {
      const file = await desktop().openFile([{ name: "ID card design", extensions: ["msidc"] }]);
      if (!file) return;
      setBusy({ label: "Opening design…", done: 0, total: 0 });
      const design = JSON.parse(new TextDecoder().decode(file.data)) as DesignFile;
      if (design.kind !== "msidc-design-v1" || !isLayout(design.layout)) throw new Error("This is not an ID card design file.");
      setLayout((l) => ({ ...design.layout, roles: Object.keys(l.roles).length ? l.roles : design.layout.roles, matchColumn: l.matchColumn || design.layout.matchColumn }));
      setTemplates({ front: null, back: null });
      for (const s of ["front", "back"] as Side[]) {
        const t = design.templates[s];
        if (t) await setTemplateFromBlob(s, await dataUrlToBlob(t.data), t.name, false);
      }
      setSide("front");
      say(`Design “${design.layout.name}” opened.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Design could not be opened.", "error");
    } finally { setBusy(null); }
  }

  // ---------- generate ----------
  async function generate() {
    setConfirmOpen(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const nameCol = layout.roles.name || columns[0] || "";
      const file = await exportBundle({
        layout,
        rows: ready,
        columns,
        templates: { front: templates.front?.bitmap ?? null, back: templates.back?.bitmap ?? null },
        media: resolverFor,
        fileNamePattern: matchColumn && nameCol ? `{${matchColumn}}_{${nameCol}}` : "card",
        jobName: `${jobName || "ID cards"}${className ? ` - ${className}` : ""}`,
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      setBusy({ label: "Saving…", done: 0, total: 0 });
      const res = await desktop().saveFile(file.name, await file.blob.arrayBuffer(), [{ name: "ZIP folder", extensions: ["zip"] }]);
      if (res.saved && res.filePath) {
        say(`${ready.length} ID cards saved to ${res.filePath}`, "ok");
        void desktop().reveal(res.filePath);
      } else say("Save cancelled.", "info");
    } catch (e) {
      if ((e as Error).name === "AbortError") say("Generation cancelled.", "info");
      else say(e instanceof Error ? e.message : "ID cards could not be generated.", "error");
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  const missing = inClass.length - ready.length;
  const hasBack = Boolean(templates.back) || layout.elements.some((e) => e.side === "back");
  const photosMatched = rows.filter((_, i) => hasPhoto(i)).length;

  return (
    <div className="app-page idg idg-simple desk">
      <section className="idg-top card">
        <div className="idg-top-title">
          <span className="idg-badge" aria-hidden>ID</span>
          <div>
            <input className="desk-job" value={jobName} placeholder="School / batch name" onChange={(e) => setJobName(e.target.value)} aria-label="School or batch name" />
            <p>{rows.length} rows{sheetName ? ` · ${sheetName}` : ""} · <b>{ready.length} ready</b>{className ? ` in ${className}` : ""}{missing > 0 ? ` · ${missing} without photo` : ""}</p>
          </div>
        </div>
        <div className="idg-top-actions">
          <label className="btn-primary">
            <input type="file" accept=".xlsx,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importSheet(f); }} />
            {rows.length ? "Change Excel" : "1 · Import Excel / CSV"}
          </label>
          <div className="idg-menu">
            <button type="button" className="btn-secondary" onClick={() => setTplMenu((v) => !v)} aria-expanded={tplMenu}>2 · Template{templates.front ? " ✓" : ""}</button>
            {tplMenu && (
              <div className="idg-menu-pop">
                {(["front", "back"] as Side[]).map((s) => (
                  <label key={s} className="idg-menu-item">
                    <input type="file" accept="image/png,image/jpeg,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTemplate(s, f); }} />
                    <b>{s === "front" ? "Front side" : "Back side"}{templates[s] ? " ✓" : ""}</b><small>PNG, JPG or PDF from this computer</small>
                  </label>
                ))}
                <button type="button" className="idg-menu-item" onClick={() => void openDesign()}><b>Open saved design…</b><small>.msidc file with template and all fields</small></button>
                <button type="button" className="idg-menu-close" onClick={() => setTplMenu(false)}>Close</button>
              </div>
            )}
          </div>
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
            3 · Photos{media.photo.size ? ` · ${media.photo.size}` : ""}
          </label>
          <label className="btn-secondary">
            <input type="file" multiple hidden {...({ webkitdirectory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
            Photos folder
          </label>
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
            Signatures{media.parentSign.size ? ` · ${media.parentSign.size}` : ""}
          </label>
          <button type="button" className="btn-secondary" disabled={!ready.length} onClick={() => setPreviewOpen(true)}>Preview</button>
          <button type="button" className="btn-primary idg-cta" disabled={!ready.length || Boolean(busy)} onClick={() => setConfirmOpen(true)}>Generate ID cards ({ready.length})</button>
        </div>
      </section>

      {status && <div className={`idg-status is-${status.tone}`} role="status">{status.text}<button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">×</button></div>}
      {busy && (
        <div className="idg-progress" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total || undefined}>
          <div><span>{busy.label}</span>{busy.total > 0 && <b>{busy.done} / {busy.total}</b>}{abortRef.current && <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}</div>
          <i style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : "35%" }} className={busy.total ? "" : "is-indeterminate"} />
        </div>
      )}

      <div className="idg-workspace">
        <aside className="card idg-left">
          <h3>Excel columns</h3>
          <p className="idg-muted">{columns.length ? "Drag onto the card or tap +." : "Import an Excel or CSV file to see its columns."}</p>
          <ul className="idg-columns">
            {columns.map((c) => (
              <li key={c} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-idg-column", c); e.dataTransfer.effectAllowed = "copy"; }}>
                <span className="idg-grip" aria-hidden>⋮⋮</span>
                <span className="idg-col-name">{c}<small>{previewRow[c] || "—"}</small></span>
                <button type="button" onClick={() => addEl(newText(side, c, { y: 8 + (layout.elements.length % 10) * 6 }))} aria-label={`Add ${c}`}>+</button>
              </li>
            ))}
          </ul>
          {columns.length > 0 && (
            <div className="desk-match">
              <Field label="Match photos by" wide>
                <select className="input-field" value={layout.matchBy === "rownumber" ? "__row" : matchColumn} onChange={(e) => setLayout((l) => (e.target.value === "__row" ? { ...l, matchBy: "rownumber" } : { ...l, matchBy: "column", matchColumn: e.target.value }))}>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  <option value="__row">Row number (1.jpg, 2.jpg…)</option>
                </select>
              </Field>
              <p className="idg-muted">{photosMatched} of {rows.length} rows have a photo.</p>
            </div>
          )}
          <h3>Add field</h3>
          <div className="idg-add">
            <button type="button" onClick={() => addEl(newText(side, "", { staticText: "Text" }))}><b>T</b>Text</button>
            <label className="idg-add-upload">
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = "";
                if (!f) return;
                try { addEl(newImage(side, "static", { x: 18, y: 30, w: 18, h: 18, fit: "contain", shape: "rect", border: { width: 0, color: "#4f46e5" }, cleanSignature: false, required: false, imageData: await fileToDataUrl(f) })); }
                catch (err) { say(err instanceof Error ? err.message : "Image could not be read.", "error"); }
              }} />
              <b>▣</b>Image / QR
            </label>
            <button type="button" onClick={() => addEl(newImage(side, "photo"))}><b>☺</b>Student photo</button>
            <button type="button" onClick={() => addEl(newImage(side, "parentSign", { x: 30, y: 76, w: 20, h: 7 }))}><b>✎</b>Signature</button>
            <label className="idg-add-upload">
              <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void setSingle("logo", f); }} />
              <b>◎</b>School logo
            </label>
            <label className="idg-add-upload">
              <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void setSingle("principalSign", f); }} />
              <b>✍</b>Principal sign
            </label>
          </div>
        </aside>

        <section className="card idg-center">
          <div className="idg-center-bar">
            <label className="idg-class">
              <span>Class</span>
              <select className="input-field" value={className} disabled={!classCol} onChange={(e) => setClassName(e.target.value)}>
                <option value="">All</option>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            {columns.length > 0 && (
              <label className="idg-class">
                <span>Class column</span>
                <select className="input-field" value={classCol} onChange={(e) => { setClassCol(e.target.value); setClassName(""); }}>
                  <option value="">None</option>
                  {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <div className="idg-seg" role="tablist" aria-label="Card side">
              {(["front", "back"] as Side[]).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} className={side === s ? "is-on" : ""} onClick={() => { setSide(s); setSelectedId(null); }}>{s === "front" ? "Front" : "Back"}</button>)}
            </div>
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
          <CardCanvas
            layout={layout}
            side={side}
            row={previewRow}
            template={templates[side]?.bitmap ?? null}
            media={previewResolver}
            selectedId={selectedId}
            zoom={zoom}
            onSelect={setSelectedId}
            onChange={patchEl}
            onDelete={removeEl}
            onDropColumn={(c, x, y) => addEl(newText(side, c, { x: Math.max(0, x - 10), y: Math.max(0, y - 3), w: Math.min(40, layout.card.w - x + 10) }))}
          />
          {!templates[side] && <p className="idg-muted idg-center-hint">Use “2 · Template” to put your ready-made {side} design behind the fields.</p>}
        </section>

        <aside className="card idg-right">
          <h3>Photo shape</h3>
          {photoStyle ? (
            <>
              <div className="idg-shapes" role="radiogroup" aria-label="Photo shape">
                {SHAPES.map((s) => (
                  <button key={s.key} type="button" role="radio" aria-checked={photoStyle.shape === s.key} className={photoStyle.shape === s.key ? "is-on" : ""} onClick={() => patchPhotos({ shape: s.key })} title={s.label}>
                    <svg viewBox="0 0 24 24" aria-hidden><path d={s.d} /></svg>
                  </button>
                ))}
              </div>
              <h4>Photo stroke</h4>
              <div className="idg-grid2">
                <Field label="Thickness"><Num value={photoStyle.border.width} step={0.1} min={0} max={5} suffix="mm" onChange={(v) => patchPhotos({ border: { ...photoStyle.border, width: v } })} /></Field>
                <Field label="Colour"><Colour label="Photo border colour" value={photoStyle.border.color} onChange={(v) => patchPhotos({ border: { ...photoStyle.border, color: v } })} /></Field>
              </div>
              <label className="idg-check"><input type="checkbox" checked={photoStyle.shadow.on} onChange={(e) => patchPhotos({ shadow: { ...photoStyle.shadow, on: e.target.checked } })} /> Photo shadow</label>
              <label className="idg-check"><input type="checkbox" checked={onlyWithPhoto} onChange={(e) => setOnlyWithPhoto(e.target.checked)} /> Only people with a photo</label>
            </>
          ) : <p className="idg-muted">Add “Student photo” from the left.</p>}

          <h3>Card border &amp; effects</h3>
          <div className="idg-grid2">
            <Field label="Border"><Num value={border.width} step={0.1} min={0} max={4} suffix="mm" onChange={(v) => setBorder({ width: v })} /></Field>
            <Field label="Colour"><Colour label="Card border colour" value={border.color} onChange={(v) => setBorder({ color: v })} /></Field>
            <Field label="Corners"><Num value={border.radius} step={0.5} min={0} max={10} suffix="mm" onChange={(v) => setBorder({ radius: v })} /></Field>
            <Field label="Style">
              <select className="input-field" value={border.style} onChange={(e) => setBorder({ style: e.target.value as CardBorder["style"] })}>
                <option value="solid">Solid</option><option value="double">Double</option><option value="dashed">Dashed</option>
              </select>
            </Field>
          </div>
          <Field label="Card size" wide>
            <select className="input-field" value={layout.card.key} onChange={(e) => { const c = CARD_SIZES.find((x) => x.key === e.target.value); if (c) setLayout((l) => ({ ...l, card: c })); }}>
              {CARD_SIZES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
              {!CARD_SIZES.some((c) => c.key === layout.card.key) && <option value={layout.card.key}>{layout.card.label}</option>}
            </select>
          </Field>

          <h3>{selected ? (selected.kind === "text" ? `Field · ${selected.column || "Text"}` : `Field · ${selected.kind === "image" ? mediaLabel(selected.media) : selected.kind}`) : "Fields on the card"}</h3>
          {selected ? (
            <Properties
              el={selected}
              columns={columns}
              patch={(pt) => patchEl(selected.id, pt)}
              onDelete={() => removeEl(selected.id)}
              onDuplicate={() => addEl({ ...selected, id: uid(), x: selected.x + 2, y: selected.y + 2 } as CardElement)}
              onLayer={(d) => layerEl(selected.id, d)}
            />
          ) : (
            <ul className="idg-layers">
              {layout.elements.filter((e) => e.side === side).map((e) => (
                <li key={e.id}><button type="button" onClick={() => setSelectedId(e.id)}>{e.kind === "text" ? e.column || `“${e.staticText}”` : e.kind === "image" ? mediaLabel(e.media) : e.kind === "qr" ? "QR code" : "Barcode"}</button></li>
              ))}
              {!layout.elements.some((e) => e.side === side) && <li className="idg-muted">Nothing on the {side} yet.</li>}
            </ul>
          )}
          <div className="idg-save">
            <Field label="Design name" wide><input className="input-field" value={layout.name} onChange={(e) => setLayout((l) => ({ ...l, name: e.target.value }))} /></Field>
            <button type="button" className="btn-secondary" disabled={Boolean(busy)} onClick={() => void saveDesign()}>Save design</button>
          </div>
          <p className="desk-licensed">Licensed to <b>{license.customer}</b></p>
        </aside>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate ID cards" onClick={() => setConfirmOpen(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">Generate {ready.length} ID cards?</h3>
            <p className="text-sm text-text-muted">
              {jobName || "ID cards"}{className ? ` · ${className}` : ""}. One ZIP folder will be saved on this computer with every card as a 300 DPI image,
              an A4 print PDF with crop marks{hasBack ? " (front and back)" : ""}, and a details sheet.
              {missing > 0 ? ` ${missing} without a photo are left out.` : ""}
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
          layout={layout}
          rows={ready}
          templates={{ front: templates.front?.bitmap ?? null, back: templates.back?.bitmap ?? null }}
          resolverFor={resolverFor}
          nameCol={layout.roles.name || columns[0] || ""}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
