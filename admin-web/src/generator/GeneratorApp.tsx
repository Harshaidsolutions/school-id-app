import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { HeaderBack } from "../components/HeaderBack";
import type { Student, Template } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { detectRoles } from "./columns";
import { defaultLayout, isLayout, newImage, newText, uid } from "./defaults";
import { exportBundle, type ExportFile } from "./exporter";
import { ensureFonts, restoreCustomFonts } from "./fonts";
import { CARD_SIZES } from "./impose";
import { dataUrlToBlob, fileToDataUrl } from "./imageData";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia } from "./media";
import { blobToBitmap, mediaLabel, type Bitmap, type MediaResolver } from "./render";
import type { CardElement, ImageElement, Layout, MediaStore, Row, Side } from "./types";
import { BatchPreview } from "./ui/BatchPreview";
import { CardCanvas } from "./ui/CardCanvas";
import { Colour, Field, Num, Properties, SHAPES, TextToolbar } from "./ui/Inspector";

type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob; libraryId?: string } | null;
type CardBorder = NonNullable<Layout["cardBorder"]>;

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
  return { columns: used, rows, roles: { ...detectRoles(used), admission: "Photo ID", name: "Name", class: "", classSection: "Class", father: "Parent Name", phone: "Phone" } };
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

const isPhotoEl = (e: CardElement): e is ImageElement => e.kind === "image" && e.media === "photo";
const DEFAULT_BORDER: CardBorder = { width: 0, color: "#4f46e5", radius: 3, style: "solid" };

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

  const [layout, setLayout] = useState<Layout>(() => ({ ...defaultLayout({}), cardBorder: DEFAULT_BORDER }));
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
        setLayout((l) => (l.elements.length > 1 && l.roles.name ? { ...l, roles: built.roles, matchColumn: "Photo ID" } : { ...defaultLayout(built.roles, "Photo ID"), cardBorder: l.cardBorder }));
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
  const ready = useMemo(() => inClass.filter(({ index }) => hasPhoto(index)), [inClass, hasPhoto]);
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
    const i = l.elements.findIndex((e) => e.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= l.elements.length) return l;
    const next = [...l.elements];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...l, elements: next };
  });
  useEffect(() => { void ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font)); }, [layout.elements]);

  // Photo style applies to the selected photo, or to every photo on the card
  const photoTargets = selected && isPhotoEl(selected) ? [selected] : layout.elements.filter(isPhotoEl);
  const photoStyle = photoTargets[0];
  const patchPhotos = (patch: Partial<ImageElement>) => photoTargets.forEach((p) => patchEl(p.id, patch));
  const border: CardBorder = layout.cardBorder ?? DEFAULT_BORDER;
  const setBorder = (patch: Partial<CardBorder>) => setLayout((l) => ({ ...l, cardBorder: { ...(l.cardBorder ?? DEFAULT_BORDER), ...patch } }));

  // ---------- templates ----------
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, libraryId?: string) {
    const bitmap = await blobToBitmap(blob, 4000);
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, libraryId } };
    });
    setSide(target);
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
      const file = await exportBundle({
        layout,
        rows: ready,
        columns,
        templates: { front: templates.front?.bitmap ?? null, back: templates.back?.bitmap ?? null },
        media: resolverFor,
        fileNamePattern: "{Photo ID}_{Name}",
        jobName: `${orgName || "ID cards"}${className ? ` - ${className}` : ""}`,
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      download(file);
      say(`${ready.length} ID cards ready — “${file.name}” downloaded (card images, A4 print PDF and details).`, "ok");
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
  const plainTemplates = library.filter((t) => !isLayout(t.config_json) && t.image_url);
  const missing = inClass.length - ready.length;
  const hasBack = Boolean(templates.back) || layout.elements.some((e) => e.side === "back");

  return (
    <div className="app-page idg idg-simple">
      <HeaderBack to={back}>← Back</HeaderBack>

      {/* Top bar: school, template, bulk uploads, preview, generate */}
      <section className="idg-top card">
        <div className="idg-top-title">
          <span className="idg-badge" aria-hidden>ID</span>
          <div>
            <h2>{orgName || "ID Card Generator"}</h2>
            <p>{rows.length} {orgKind === "school" ? "students" : "members"} · <b>{ready.length} ready</b>{className ? ` in ${className}` : ""}{missing > 0 ? ` · ${missing} without photo` : ""}</p>
          </div>
        </div>
        <div className="idg-top-actions">
          <div className="idg-menu">
            <button type="button" className="btn-secondary" onClick={() => setTplMenu((v) => !v)} aria-expanded={tplMenu}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M12 16V8M9 11l3-3 3 3" /></svg>
              Upload template
            </button>
            {tplMenu && (
              <div className="idg-menu-pop">
                {(["front", "back"] as Side[]).map((s) => (
                  <label key={s} className="idg-menu-item">
                    <input type="file" accept="image/png,image/jpeg,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTemplate(s, f); }} />
                    <b>{s === "front" ? "Front side" : "Back side"}{templates[s] ? " ✓" : ""}</b><small>PNG, JPG or PDF from your computer</small>
                  </label>
                ))}
                {plainTemplates.length > 0 && <div className="idg-menu-label">From Templates ({side})</div>}
                {plainTemplates.slice(0, 10).map((t) => (
                  <button key={t.id} type="button" className="idg-menu-item" onClick={() => void loadLibraryTemplate(side, t)}><b>{t.name}</b><small>Use as {side}</small></button>
                ))}
                {savedDesigns.length > 0 && <div className="idg-menu-label">Saved designs</div>}
                {savedDesigns.slice(0, 10).map((t) => (
                  <button key={t.id} type="button" className="idg-menu-item" onClick={() => void loadLibraryTemplate("front", t)}><b>{t.name}</b><small>Template with all fields</small></button>
                ))}
                <button type="button" className="idg-menu-close" onClick={() => setTplMenu(false)}>Close</button>
              </div>
            )}
          </div>
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "photo"); e.target.value = ""; }} />
            Bulk photos{media.photo.size ? ` · ${media.photo.size}` : ""}
          </label>
          <label className="btn-secondary">
            <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addBulk(e.target.files, "parentSign"); e.target.value = ""; }} />
            Bulk signatures{media.parentSign.size ? ` · ${media.parentSign.size}` : ""}
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
        {/* Left: columns + add field */}
        <aside className="card idg-left">
          <h3>Excel columns</h3>
          <p className="idg-muted">Drag onto the card or tap +.</p>
          <ul className="idg-columns">
            {columns.map((c) => (
              <li key={c} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-idg-column", c); e.dataTransfer.effectAllowed = "copy"; }}>
                <span className="idg-grip" aria-hidden>⋮⋮</span>
                <span className="idg-col-name">{c}<small>{previewRow[c] || "—"}</small></span>
                <button type="button" onClick={() => addEl(newText(side, c, { y: 8 + (layout.elements.length % 10) * 6 }))} aria-label={`Add ${c}`}>+</button>
              </li>
            ))}
            {!columns.length && <li className="idg-muted">Open the generator from a school or institute to see its columns.</li>}
          </ul>
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
              <b>▣</b>Photo / QR image
            </label>
            <button type="button" onClick={() => addEl(newImage(side, "photo"))}><b>☺</b>Student photo</button>
            <button type="button" onClick={() => addEl(newImage(side, "parentSign", { x: 30, y: 76, w: 20, h: 7 }))}><b>✎</b>Signature</button>
          </div>
        </aside>

        {/* Centre: class + toolbar + card */}
        <section className="card idg-center">
          <div className="idg-center-bar">
            <label className="idg-class">
              <span>Class</span>
              <select className="input-field" value={className} onChange={(e) => setClassName(e.target.value)}>
                <option value="">All classes</option>
                {classes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
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
          {!templates[side] && <p className="idg-muted idg-center-hint">Use “Upload template” to put your ready-made {side} design behind the fields.</p>}
        </section>

        {/* Right: photo style, card border, selected field */}
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
            <button type="button" className="btn-secondary" disabled={!templates.front || Boolean(busy)} onClick={() => void saveDesign()}>Save design</button>
          </div>
        </aside>
      </div>

      {confirmOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate ID cards" onClick={() => setConfirmOpen(false)}>
          <div className="card workflow-dialog" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-text-navy">Generate {ready.length} ID cards?</h3>
            <p className="text-sm text-text-muted">
              {orgName}{className ? ` · ${className}` : " · all classes"}. One folder (ZIP) will be downloaded with every card as a 300 DPI image,
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
          nameCol="Name"
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}
