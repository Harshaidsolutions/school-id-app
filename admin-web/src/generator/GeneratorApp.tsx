import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import type { Student, Template } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { detectRoles } from "./columns";
import { blankLayout, isLayout, newImage, newText, uid } from "./defaults";
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
  // Left panel shows only the Excel columns (each once). The fixed keys (Photo ID, Name,
  // Class…) stay in every row for photo matching and file names, but are not listed twice.
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

/** Text formatting that new text fields copy from the last text the admin styled. */
const STYLE_KEYS = ["font", "weight", "italic", "underline", "size", "minSize", "autoShrink", "multiline", "textCase", "align", "vAlign", "letterSpacing", "lineHeight", "color", "gradient", "stroke", "w", "h"] as const;
type TextStyle = Partial<Pick<TextElement, (typeof STYLE_KEYS)[number]>>;
const pickStyle = (el: Partial<TextElement>): TextStyle => {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (el[k] !== undefined) out[k] = el[k];
  return out as TextStyle;
};
const failedKey = (orgId: string) => `idg-failed:${orgId}`;

/**
 * Simple ID card generator for one school / institute:
 * template on top, columns on the left, the card in the middle, photo & card styling on the right.
 * Pick a class → everyone with a captured (or bulk-uploaded) photo is ready → Preview → Generate.
 */
export function GeneratorApp() {
  const [params] = useSearchParams();
  const schoolId = params.get("schoolId"), instituteId = params.get("instituteId");
  const orgKind: "school" | "institute" = instituteId ? "institute" : "school";
  const orgId = instituteId ?? schoolId ?? "";
  const [orgName, setOrgName] = useState(params.get("schoolName") ?? params.get("instituteName") ?? "");
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  const [students, setStudents] = useState<Student[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [className, setClassName] = useState("");
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const serverBlobs = useRef(new Map<string, Blob>());

  const [layout, setLayout] = useState<Layout>(() => blankLayout());
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [library, setLibrary] = useState<Template[]>([]);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tplMenu, setTplMenu] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const textStyle = useRef<TextStyle>({});
  const [print, setPrint] = useState({ sheetKey: "a4", landscape: false, gap: 3, margin: 8 });
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [onlyFailed, setOnlyFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { void restoreCustomFonts(); }, []);
  useEffect(() => {
    api.get<{ templates: Template[] }>("/admin/templates").then((r) => setLibrary(r.data.templates ?? [])).catch(() => undefined);
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
      .catch(() => say("Records could not be loaded.", "error"));
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
  useEffect(() => {
    if (selectedId) setPanelOpen(true);
  }, [selectedId]);
  const patchEl = useCallback((id: string, patch: Partial<CardElement>) => {
    setLayout((l) => ({
      ...l,
      elements: l.elements.map((e) => {
        if (e.id !== id) return e;
        const next = { ...e, ...patch } as CardElement;
        // Keep this text formatting for the next text fields added from the left panel.
        if (next.kind === "text") {
          const style = pickStyle(patch as Partial<TextElement>);
          if (Object.keys(style).length) textStyle.current = { ...textStyle.current, ...style };
        }
        return next;
      }),
    }));
  }, []);
  /** New text field using the last formatting the admin set. */
  const styledText = (s: Side, column: string, at: Partial<TextElement> = {}) => newText(s, column, { ...textStyle.current, ...at });
  /** Excel column added as "Label: value". */
  const columnText = (s: Side, column: string, at: Partial<TextElement> = {}) =>
    styledText(s, column, { prefix: `${niceLabel(column)}: `, ...at });
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
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, libraryId?: string) {
    const bitmap = await blobToBitmap(blob, 4000);
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, libraryId } };
    });
    const ratio = bitmap.width / bitmap.height;
    const match = CARD_SIZES.find((c) => Math.abs(c.w / c.h - ratio) / ratio < 0.04);
    if (match) setLayout((l) => ({ ...l, card: match }));
  }

  async function uploadTemplate(target: Side, file: File) {
    setTplMenu(false);
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

  async function loadLibraryTemplate(target: Side, t: Template) {
    setTplMenu(false);
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      if (isLayout(t.config_json)) {
        const saved = t.config_json as Layout;
        setLayout((l) => ({ ...saved, roles: l.roles, matchColumn: "Photo ID", matchBy: "column" }));
        const frontId = saved.frontTemplateId ?? t.id;
        const fr = await api.get(`/admin/id-generator/template-image/${frontId}`, { responseType: "blob" });
        await setTemplateFromBlob("front", fr.data, t.name, frontId);
        if (saved.backTemplateId) {
          const br = await api.get(`/admin/id-generator/template-image/${saved.backTemplateId}`, { responseType: "blob" });
          await setTemplateFromBlob("back", br.data, `${t.name} (back)`, saved.backTemplateId);
        }
        setSide("front");
      } else {
        const r = await api.get(`/admin/id-generator/template-image/${t.id}`, { responseType: "blob" });
        await setTemplateFromBlob(target, r.data, t.name, t.id);
      }
      say(`Template “${t.name}” added.`, "ok");
    } catch (e) {
      say(apiError(e, "Template could not be loaded."), "error");
    } finally {
      setBusy(null);
    }
  }

  // Opened from Templates → "Use"
  const templateParam = params.get("templateId");
  const templateApplied = useRef(false);
  useEffect(() => {
    if (!templateParam || templateApplied.current || !library.length) return;
    const t = library.find((x) => x.id === templateParam);
    if (!t) return;
    templateApplied.current = true;
    void loadLibraryTemplate("front", t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateParam, library]);

  async function saveDesign() {
    if (!templates.front) { say("Upload a front template first.", "error"); return; }
    setBusy({ label: "Saving design…", done: 0, total: 0 });
    try {
      let backId = templates.back?.libraryId;
      const orientation = (both: boolean) => `${layout.card.h >= layout.card.w ? "vertical" : "horizontal"}_${both ? "both" : "single"}`;
      if (templates.back && !backId) {
        const form = new FormData();
        form.append("name", `${layout.name} (back)`);
        form.append("orientation", orientation(false));
        form.append("image", templates.back.blob, templates.back.name || "back.png");
        const { data } = await api.post("/admin/templates", form);
        backId = data.template?.id;
      }
      const form = new FormData();
      form.append("name", layout.name);
      form.append("orientation", orientation(Boolean(templates.back)));
      form.append("config_json", JSON.stringify({ ...layout, backTemplateId: backId, frontTemplateId: templates.front.libraryId }));
      if (!templates.front.libraryId) form.append("image", templates.front.blob, templates.front.name || "front.png");
      const { data } = await api.post("/admin/templates", form);
      if (data.template) setLibrary((l) => [data.template as Template, ...l]);
      say(`Design “${layout.name}” saved. Pick it next time under Upload template → Saved designs.`, "ok");
    } catch (e) {
      say(apiError(e, "Design could not be saved."), "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- bulk photos / signatures (ZIPs from the Download section) ----------
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
  async function generate() {
    setConfirmOpen(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const sheet = SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0];
      const { file, problems } = await exportBundle({
        layout,
        rows: ready,
        columns,
        templates: { front: templates.front?.bitmap ?? null, back: templates.back?.bitmap ?? null },
        media: resolverFor,
        fileNamePattern: "{Photo ID}_{Name}",
        jobName: `${orgName || "ID cards"}${className ? ` - ${className}` : ""}${onlyFailed ? " - corrected" : ""}`,
        print: { sheet, landscape: print.landscape, gap: print.gap, margin: print.margin },
        idColumn: "Photo ID",
        nameColumn: "Name",
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      download(file);
      const ids = Array.from(new Set(problems.map((p: CardProblem) => p.id).filter(Boolean)));
      const remaining = onlyFailed ? ids : Array.from(new Set([...ids]));
      setFailedIds(remaining);
      setOnlyFailed(false);
      try {
        if (remaining.length) localStorage.setItem(failedKey(orgId), JSON.stringify(remaining));
        else localStorage.removeItem(failedKey(orgId));
      } catch {
        /* storage blocked */
      }
      say(
        problems.length
          ? `${ready.length} ID cards downloaded (Front and Back folders). ${ids.length} card(s) have text that is cut off or outside the card — see “ERRORS - cards to correct.csv” in the ZIP. Correct them, then use “Regenerate errors only”.`
          : `${ready.length} ID cards ready — “${file.name}” downloaded (Front and Back folders, print sheets and details).`,
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

  const back = orgId ? (orgKind === "school" ? `/students?schoolId=${orgId}&schoolName=${encodeURIComponent(orgName)}` : `/institute-members?instituteId=${orgId}&instituteName=${encodeURIComponent(orgName)}`) : "/schools";
  const savedDesigns = library.filter((t) => isLayout(t.config_json));
  const missing = inClass.length - ready.length;
  const hasBack = Boolean(templates.back) || layout.elements.some((e) => e.side === "back");
  const sheetLabel = (SHEET_SIZES.find((x) => x.key === print.sheetKey) ?? SHEET_SIZES[0]).label;

  return (
    <div className="app-page idg idg-simple idg-full">
      {/* Top bar: back, school, template uploads, bulk uploads, preview, generate */}
      <section className="idg-top card">
        {/* Real link (the page header is hidden in this full-screen view). */}
        <Link to={back} className="idg-back" aria-label={`Back to ${orgName || (orgKind === "school" ? "the school" : "the institute")}`}>
          <span aria-hidden>←</span> Back
        </Link>
        <div className="idg-top-title">
          <span className="idg-badge" aria-hidden>ID</span>
          <div>
            <h2>{orgName || "ID Card Generator"}</h2>
            <p>{rows.length} {orgKind === "school" ? "students" : "members"} · <b>{ready.length} ready</b>{className ? ` in ${className}` : ""}{missing > 0 ? ` · ${missing} without photo` : ""}</p>
          </div>
        </div>
        <div className="idg-top-actions">
          {(["front", "back"] as Side[]).map((s) => (
            <label key={s} className="btn-secondary" title={`Upload the ${s} side design (PNG, JPG or PDF)`}>
              <input type="file" accept="image/png,image/jpeg,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTemplate(s, f); }} />
              {s === "front" ? "Front side upload" : "Back side upload"}{templates[s] ? " ✓" : ""}
            </label>
          ))}
          {savedDesigns.length > 0 && (
            <div className="idg-menu">
              <button type="button" className="btn-secondary" onClick={() => setTplMenu((v) => !v)} aria-expanded={tplMenu}>Saved designs</button>
              {tplMenu && (
                <div className="idg-menu-pop">
                  {savedDesigns.slice(0, 20).map((t) => (
                    <button key={t.id} type="button" className="idg-menu-item" onClick={() => void loadLibraryTemplate("front", t)}><b>{t.name}</b><small>Template with all fields</small></button>
                  ))}
                  <button type="button" className="idg-menu-close" onClick={() => setTplMenu(false)}>Close</button>
                </div>
              )}
            </div>
          )}
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
            Bulk photos{media.photo.size ? ` · ${media.photo.size}` : ""}
          </label>
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
            Bulk signatures{media.parentSign.size ? ` · ${media.parentSign.size}` : ""}
          </label>
          <button type="button" className="btn-secondary" disabled={!ready.length} onClick={() => setPreviewOpen(true)}>Preview</button>
          {failedIds.length > 0 && (
            <button type="button" className="btn-secondary idg-errors-btn" disabled={Boolean(busy)} onClick={() => { setOnlyFailed(true); setConfirmOpen(true); }} title="Generate again only the cards that had text cut off">
              Regenerate errors only ({failedIds.length})
            </button>
          )}
          <button type="button" className="btn-primary idg-cta" disabled={!readyAll.length || Boolean(busy)} onClick={() => { setOnlyFailed(false); setConfirmOpen(true); }}>Generate ID cards ({readyAll.length})</button>
        </div>
      </section>

      {status && <div className={`idg-status is-${status.tone}`} role="status">{status.text}<button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">×</button></div>}
      {busy && (
        <div className="idg-progress" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total || undefined}>
          <div><span>{busy.label}</span>{busy.total > 0 && <b>{busy.done} / {busy.total}</b>}{abortRef.current && <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}</div>
          <i style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : "35%" }} className={busy.total ? "" : "is-indeterminate"} />
        </div>
      )}

      <div className={`idg-workspace${panelOpen ? "" : " is-panel-hidden"}`}>
        {/* Left: Excel columns + add field */}
        <aside className="card idg-left">
          <h3>Excel columns</h3>
          <p className="idg-muted">Tap + to add “Column: value” to the {side} card, or drag it onto a card.</p>
          <ul className="idg-columns">
            {columns.map((c) => (
              <li key={c} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-idg-column", c); e.dataTransfer.effectAllowed = "copy"; }}>
                <span className="idg-grip" aria-hidden>⋮⋮</span>
                <span className="idg-col-name">{niceLabel(c)}<small>{previewRow[c] || "—"}</small></span>
                <button type="button" onClick={() => addEl(columnText(side, c, { x: 4, y: 8 + (layout.elements.filter((e) => e.side === side).length % 12) * 6 }))} aria-label={`Add ${c}`}>+</button>
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
        </aside>

        {/* Centre: front and back side by side */}
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
            <button type="button" className="btn-secondary idg-panel-toggle" onClick={() => setPanelOpen((v) => !v)} aria-expanded={panelOpen} title={panelOpen ? "Hide the editing panel to get a bigger playground" : "Show the editing panel"}>
              {panelOpen ? "Hide panel ⟩" : "⟨ Show panel"}
            </button>
            <div className="idg-zoom">
              <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
            </div>
          </div>
          <TextToolbar el={selected?.kind === "text" ? selected : null} patch={(pt) => selected && patchEl(selected.id, pt)} />
          <div className="idg-sides">
            {(["front", "back"] as Side[]).map((s) => (
              <div
                key={s}
                className={`idg-side${side === s ? " is-active" : ""}`}
                onPointerDownCapture={() => { if (side !== s) setSide(s); }}
              >
                <div className="idg-side-label">{s === "front" ? "Front" : "Back"}{side === s ? " · adding here" : ""}</div>
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
                  onDropColumn={(c, x, y) => { setSide(s); addEl(columnText(s, c, { x: Math.max(0, x - 10), y: Math.max(0, y - 3) })); }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Right: only the controls of the selected item */}
        <aside className="card idg-right" hidden={!panelOpen}>
          {selected ? (
            <>
              <h3>{selected.kind === "text" ? `Text · ${selected.column ? niceLabel(selected.column) : "Text"}` : selected.kind === "image" ? mediaLabel(selected.media) : selected.kind === "qr" ? "QR code" : "Barcode"}</h3>
              <Properties
                el={selected}
                columns={columns}
                patch={(pt) => patchEl(selected.id, pt)}
                onDelete={() => removeEl(selected.id)}
                onDuplicate={() => addEl({ ...selected, id: uid(), x: selected.x + 2, y: selected.y + 2 } as CardElement)}
                onLayer={(d) => layerEl(selected.id, d)}
              />
            </>
          ) : (
            <>
              <h3>Edit</h3>
              <p className="idg-muted">Click a text, photo or signature on a card to edit only that item here.</p>
              <ul className="idg-layers">
                {layout.elements.map((e) => (
                  <li key={e.id}><button type="button" onClick={() => { setSide(e.side); setSelectedId(e.id); }}>{e.side === "front" ? "Front" : "Back"} · {e.kind === "text" ? (e.column ? niceLabel(e.column) : `“${e.staticText}”`) : e.kind === "image" ? mediaLabel(e.media) : e.kind === "qr" ? "QR code" : "Barcode"}</button></li>
                ))}
                {!layout.elements.length && <li className="idg-muted">The cards are empty. Add columns, text or a photo from the left.</li>}
              </ul>
            </>
          )}
          <div className="idg-save">
            <Field label="Design name" wide><input className="input-field" value={layout.name} onChange={(e) => setLayout((l) => ({ ...l, name: e.target.value }))} /></Field>
            <button type="button" className="btn-secondary" disabled={!templates.front || Boolean(busy)} onClick={() => void saveDesign()}>Save design</button>
          </div>
        </aside>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate ID cards" onClick={() => setConfirmOpen(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">{onlyFailed ? `Regenerate ${ready.length} corrected ID cards?` : `Generate ${ready.length} ID cards?`}</h3>
            <p className="text-sm text-text-muted">
              {orgName}{className ? ` · ${className}` : " · all classes"}. One ZIP is downloaded with a <b>Front</b> folder{hasBack ? " and a Back folder" : ""} (300 DPI images),
              print sheets with crop marks and a details sheet. If any text is cut off, an error report is added.
              {missing > 0 ? ` ${missing} without a photo are left out.` : ""}
            </p>
            <div className="idg-grid2">
              <Field label="Paper size">
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
            <p className="text-xs text-text-muted">Print sheets: {sheetLabel}{print.landscape ? ", horizontal" : ", vertical"} · {print.gap} mm gap.</p>
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
          nameCol="Name"
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
