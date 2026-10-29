import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import { HeaderBack } from "../components/HeaderBack";
import type { Student, Template } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";
import { ROLES, detectRoles } from "./columns";
import { defaultLayout, isLayout, newBarcode, newImage, newQr, newText, uid } from "./defaults";
import { exportCards, type DuplexMode, type ExportFile, type ExportFormat } from "./exporter";
import { ensureFonts, restoreCustomFonts } from "./fonts";
import { CARD_SIZES, SHEET_SIZES, cropMarks, impose } from "./impose";
import { addToStore, emptyMedia, filesFromInput, filesFromZip, findMedia, type IntakeSummary } from "./media";
import { runPreflight, type PreflightReport } from "./preflight";
import { blobToBitmap, mediaLabel, type Bitmap, type MediaResolver } from "./render";
import type { CardElement, Layout, MediaKind, MediaStore, Row, Side } from "./types";
import { CardCanvas } from "./ui/CardCanvas";
import { Colour, Field, Num, Properties, TextToolbar } from "./ui/Inspector";

type Source = "records" | "upload";
type TemplateSlot = { bitmap: Bitmap; url: string; name: string; blob: Blob; libraryId?: string } | null;
type Caps = { photoAi: boolean; backgroundRemoval: boolean; faceDetection: boolean; ghostscript: boolean };

const STEPS = ["Data & photos", "Card layout", "Photo AI", "Pre-flight check", "Print & export"] as const;
const BG_SWATCHES = ["#ffffff", "#dbeafe", "#bfdbfe", "#e0f2fe", "#dcfce7", "#fef3c7", "#fee2e2", "#e5e7eb"];

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
  return {
    columns: used,
    rows,
    roles: { ...detectRoles(used), admission: "Photo ID", name: "Name", class: "", classSection: "Class", father: "Parent Name", phone: "Phone" },
  };
}

function orientationFor(layout: Layout, hasBack: boolean): string {
  const v = layout.card.h >= layout.card.w ? "vertical" : "horizontal";
  return `${v}_${hasBack ? "both" : "single"}`;
}

function download(file: ExportFile) {
  const url = URL.createObjectURL(file.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function GeneratorApp() {
  const [params] = useSearchParams();
  const qSchool = params.get("schoolId"), qInstitute = params.get("instituteId");
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<{ tone: "info" | "ok" | "error"; text: string } | null>(null);
  const say = (text: string, tone: "info" | "ok" | "error" = "info") => setStatus({ text, tone });

  // ---------- data ----------
  const [source, setSource] = useState<Source>(qSchool || qInstitute ? "records" : "upload");
  const [orgKind, setOrgKind] = useState<"school" | "institute">(qInstitute ? "institute" : "school");
  const [orgId, setOrgId] = useState(qInstitute ?? qSchool ?? "");
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [media, setMedia] = useState<MediaStore>(emptyMedia);
  const [mediaVersion, setMediaVersion] = useState(0);
  const [intake, setIntake] = useState<IntakeSummary | null>(null);
  const [processed, setProcessed] = useState<Map<number, Blob>>(new Map());
  const serverBlobs = useRef(new Map<string, Blob>());

  // ---------- layout ----------
  const [layout, setLayout] = useState<Layout>(() => defaultLayout({}));
  const [templates, setTemplates] = useState<{ front: TemplateSlot; back: TemplateSlot }>({ front: null, back: null });
  const [side, setSide] = useState<Side>("front");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [library, setLibrary] = useState<Template[]>([]);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [busy, setBusy] = useState<{ label: string; done: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { void restoreCustomFonts(); }, []);
  useEffect(() => {
    api.get("/admin/id-generator/capabilities").then((r) => setCaps(r.data)).catch(() => setCaps(null));
    api.get<{ templates: Template[] }>("/admin/templates").then((r) => setLibrary(r.data.templates ?? [])).catch(() => undefined);
  }, []);
  useEffect(() => {
    if (source !== "records") return;
    api.get(`/admin/${orgKind === "school" ? "schools" : "institutes"}`)
      .then((r) => setOrgs(r.data[orgKind === "school" ? "schools" : "institutes"] ?? []))
      .catch(() => say("Schools could not be loaded.", "error"));
  }, [source, orgKind]);
  useEffect(() => {
    if (source !== "records" || !orgId) return;
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
        setProcessed(new Map());
        serverBlobs.current.clear();
        setLayout((l) => (l.elements.length > 1 && l.roles.name ? { ...l, roles: built.roles, matchColumn: "Photo ID" } : defaultLayout(built.roles, "Photo ID")));
        say(`${list.length} records loaded. Photos and signatures come from the app captures.`, "ok");
      })
      .catch(() => say("Records could not be loaded.", "error"));
    return () => { live = false; };
  }, [source, orgId, orgKind]);

  const orgName = orgs.find((o) => o.id === orgId)?.name ?? params.get("schoolName") ?? params.get("instituteName") ?? "";
  const jobName = (orgName || sheetName || layout.name || "ID cards").trim();

  // ---------- media resolution ----------
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

  const sourceBlob = useCallback(async (kind: MediaKind, index: number): Promise<Blob | null> => {
    if (kind === "principalSign") return media.principalSign;
    if (kind === "logo") return media.logo;
    const row = rows[index];
    if (!row) return null;
    const map = kind === "photo" ? media.photo : kind === "parentSign" ? media.parentSign : media.thumb;
    const local = findMedia(map, row, layout.matchColumn, index, layout.matchBy);
    if (local) return local;
    if (source === "records" && (kind === "photo" || kind === "parentSign")) return serverBlob(kind, index);
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, mediaVersion, rows, layout.matchColumn, layout.matchBy, source, serverBlob]);

  const resolverFor = useCallback((index: number): MediaResolver => async (kind) => {
    if (kind === "photo" && processed.has(index)) return blobToBitmap(processed.get(index)!);
    const blob = await sourceBlob(kind, index);
    if (!blob) return null;
    try { return await blobToBitmap(blob); } catch { return null; }
  }, [processed, sourceBlob]);

  const hasMedia = useCallback((kind: MediaKind, row: Row, index: number): boolean => {
    if (kind === "principalSign") return Boolean(media.principalSign);
    if (kind === "logo") return Boolean(media.logo);
    if (kind === "photo" && processed.has(index)) return true;
    const map = kind === "photo" ? media.photo : kind === "parentSign" ? media.parentSign : media.thumb;
    if (findMedia(map, row, layout.matchColumn, index, layout.matchBy)) return true;
    if (source === "records") {
      const s = students[index];
      if (kind === "photo") return Boolean(s?.photo_url);
      if (kind === "parentSign") return Boolean(s?.signature_url);
    }
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, mediaVersion, processed, layout.matchColumn, layout.matchBy, source, students]);

  const photoStats = useMemo(() => {
    let photos = 0;
    rows.forEach((r, i) => { if (hasMedia("photo", r, i)) photos++; });
    return { photos, missing: rows.length - photos };
  }, [rows, hasMedia]);

  const previewRow = rows[Math.min(previewIndex, Math.max(0, rows.length - 1))] ?? {};
  const previewResolver = useMemo(() => resolverFor(Math.min(previewIndex, Math.max(0, rows.length - 1))), [resolverFor, previewIndex, rows.length]);

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

  // ---------- data intake ----------
  async function uploadSheet(file: File) {
    setBusy({ label: "Reading spreadsheet…", done: 0, total: 0 });
    try {
      const form = new FormData();
      form.append("sheet", file);
      const { data } = await api.post("/admin/id-generator/parse-sheet", form);
      const cols: string[] = data.columns ?? [];
      const rs: Row[] = data.rows ?? [];
      const roles = detectRoles(cols);
      setColumns(cols);
      setRows(rs);
      setSheetName(file.name.replace(/\.[^.]+$/, ""));
      setProcessed(new Map());
      setPreviewIndex(0);
      setLayout((l) => (l.elements.length > 1 && l.elements.some((e) => "column" in e && cols.includes((e as { column: string }).column))
        ? { ...l, roles, matchColumn: cols.includes(l.matchColumn) ? l.matchColumn : roles.admission || roles.roll || roles.name || "" }
        : defaultLayout(roles)));
      say(`${rs.length} rows and ${cols.length} columns read from “${data.sheet}”. Columns were matched automatically — check them below.`, "ok");
    } catch (e) {
      say(apiError(e, "The spreadsheet could not be read."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function addMediaFiles(list: FileList | File[], forceKind?: MediaKind) {
    setBusy({ label: "Reading photos…", done: 0, total: 0 });
    try {
      const files = [];
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) files.push(...(await filesFromZip(f)));
        else files.push(...filesFromInput([f]));
      }
      const store = media;
      const summary = addToStore(store, files, forceKind);
      setMedia(store);
      setMediaVersion((v) => v + 1);
      setIntake(summary);
      say(`Added ${summary.photos} photos, ${summary.parentSigns} parent signatures, ${summary.thumbs} thumb impressions${summary.principal ? ", principal signature" : ""}${summary.logo ? ", school logo" : ""}.`, "ok");
    } catch (e) {
      say(e instanceof Error ? e.message : "Files could not be read.", "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- templates ----------
  async function setTemplateFromBlob(target: Side, blob: Blob, name: string, libraryId?: string) {
    const bitmap = await blobToBitmap(blob, 4000);
    setTemplates((t) => {
      if (t[target]) URL.revokeObjectURL(t[target]!.url);
      return { ...t, [target]: { bitmap, url: URL.createObjectURL(blob), name, blob, libraryId } };
    });
    setSide(target);
    const ratio = bitmap.width / bitmap.height;
    const cardRatio = layout.card.w / layout.card.h;
    if (Math.abs(ratio - cardRatio) / cardRatio > 0.04) {
      const match = CARD_SIZES.find((c) => Math.abs(c.w / c.h - ratio) / ratio < 0.04);
      if (match) {
        setLayout((l) => ({ ...l, card: match }));
        say(`Template shape matches ${match.label}; card size updated.`, "info");
      } else {
        say("This template's shape is different from the card size. Choose the right card size or a custom size so it is not stretched.", "error");
      }
    }
  }

  async function uploadTemplate(target: Side, file: File) {
    try {
      if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") {
        setBusy({ label: "Converting PDF template…", done: 0, total: 0 });
        const pages: Blob[] = [];
        for (const page of [1, 2]) {
          const form = new FormData();
          form.append("pdf", file);
          form.append("page", String(page));
          try {
            const { data } = await api.post("/admin/id-generator/rasterize-pdf", form, { responseType: "blob" });
            pages.push(data);
          } catch (e) {
            if (page === 1) throw e;
          }
        }
        await setTemplateFromBlob(target, pages[0], file.name);
        if (target === "front" && pages[1] && !templates.back) {
          await setTemplateFromBlob("back", pages[1], `${file.name} (page 2)`);
          setSide("front");
          say("PDF page 1 is the front and page 2 the back.", "ok");
        }
      } else {
        await setTemplateFromBlob(target, file, file.name);
      }
    } catch (e) {
      say(apiError(e, "Template could not be loaded."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function loadLibraryTemplate(target: Side, t: Template, applyLayout = true) {
    setBusy({ label: "Loading template…", done: 0, total: 0 });
    try {
      if (applyLayout && isLayout(t.config_json)) {
        const saved = t.config_json as Layout;
        setLayout({ ...saved, roles: Object.keys(saved.roles ?? {}).length ? saved.roles : layout.roles });
        await ensureFonts(saved.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
        const frontId = saved.frontTemplateId ?? t.id;
        const fr = await api.get(`/admin/id-generator/template-image/${frontId}`, { responseType: "blob" });
        await setTemplateFromBlob("front", fr.data, t.name, frontId);
        if (saved.backTemplateId) {
          const br = await api.get(`/admin/id-generator/template-image/${saved.backTemplateId}`, { responseType: "blob" });
          await setTemplateFromBlob("back", br.data, `${t.name} (back)`, saved.backTemplateId);
        }
        setSide("front");
        say(`Layout “${t.name}” loaded.`, "ok");
      } else {
        const r = await api.get(`/admin/id-generator/template-image/${t.id}`, { responseType: "blob" });
        await setTemplateFromBlob(target, r.data, t.name, t.id);
      }
    } catch (e) {
      say(apiError(e, "Template could not be loaded."), "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveLayout() {
    if (!templates.front) { say("Add a front template before saving the layout.", "error"); return; }
    setBusy({ label: "Saving layout…", done: 0, total: 0 });
    try {
      let backId = templates.back?.libraryId;
      if (templates.back && !backId) {
        const form = new FormData();
        form.append("name", `${layout.name} (back)`);
        form.append("orientation", orientationFor(layout, false));
        form.append("image", templates.back.blob, templates.back.name || "back.png");
        const { data } = await api.post("/admin/templates", form);
        backId = data.template?.id;
      }
      const config: Layout = { ...layout, backTemplateId: backId, frontTemplateId: templates.front.libraryId };
      const form = new FormData();
      form.append("name", layout.name);
      form.append("orientation", orientationFor(layout, Boolean(templates.back)));
      form.append("config_json", JSON.stringify(config));
      if (!templates.front.libraryId) form.append("image", templates.front.blob, templates.front.name || "front.png");
      const { data } = await api.post("/admin/templates", form);
      const saved: Template | undefined = data.template;
      if (saved) {
        setLibrary((l) => [saved, ...l]);
        if (!templates.front.libraryId) setTemplates((t) => (t.front ? { ...t, front: { ...t.front, libraryId: saved.id } } : t));
      }
      say(`Layout “${layout.name}” saved to Templates. Load it next time from “Saved layouts”.`, "ok");
    } catch (e) {
      say(apiError(e, "Layout could not be saved."), "error");
    } finally {
      setBusy(null);
    }
  }

  // ---------- photo AI ----------
  const photoEl = layout.elements.find((e) => e.kind === "image" && e.media === "photo");
  const [aiScope, setAiScope] = useState<"all" | "missing">("missing");
  async function runPhotoAi() {
    if (!rows.length) { say("Load data and photos first.", "error"); return; }
    const aspect = photoEl ? photoEl.w / photoEl.h : 0.8;
    const height = Math.min(2400, Math.max(750, Math.round(((photoEl?.h ?? 30) / 25.4) * 600)));
    const width = Math.round(height * aspect);
    const targets = rows.map((_, i) => i).filter((i) => (aiScope === "all" || !processed.has(i)));
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const next = new Map(processed);
    let done = 0, failed = 0, skipped = 0;
    let firstError = "";
    setBusy({ label: "Processing photos on the server…", done: 0, total: targets.length });
    const worker = async () => {
      while (targets.length && !ctrl.signal.aborted) {
        const i = targets.shift()!;
        const blob = await sourceBlob("photo", i);
        if (!blob) { skipped++; done++; continue; }
        try {
          const form = new FormData();
          form.append("photo", blob, "photo.jpg");
          form.append("removeBg", String(layout.photo.removeBg));
          form.append("bg", layout.photo.bg);
          form.append("face", String(layout.photo.face));
          form.append("enhance", String(layout.photo.enhance));
          form.append("width", String(width));
          form.append("height", String(height));
          const { data } = await api.post("/admin/id-generator/process-photo", form, { responseType: "blob", signal: ctrl.signal });
          next.set(i, data);
        } catch (e) {
          failed++;
          if (!firstError) firstError = await blobError(e);
        }
        done++;
        setBusy({ label: "Processing photos on the server…", done, total: done + targets.length });
        if (done % 5 === 0) setProcessed(new Map(next));
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setProcessed(new Map(next));
    setBusy(null);
    abortRef.current = null;
    if (failed) say(`${done - failed - skipped} photos processed, ${failed} failed: ${firstError}`, "error");
    else say(`${done - skipped} photos processed${skipped ? ` (${skipped} rows have no photo)` : ""}.`, "ok");
  }

  // ---------- pre-flight ----------
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [findingFilter, setFindingFilter] = useState<"all" | "error" | "warning">("all");
  async function check() {
    await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
    const r = runPreflight(rows, layout, hasMedia);
    setReport(r);
    say(r.findings.length ? `${r.rowsWithErrors.size} cards have errors, ${r.rowsWithWarnings.size} have warnings.` : "All cards passed the pre-flight check.", r.rowsWithErrors.size ? "error" : "ok");
    return r;
  }
  useEffect(() => { setReport(null); }, [rows, layout, media, mediaVersion, processed]);

  // ---------- export ----------
  const [format, setFormat] = useState<ExportFormat>("pdf-sheets");
  const [dpi, setDpi] = useState<300 | 600>(300);
  const [sheetKey, setSheetKey] = useState("a4");
  const [perSheet, setPerSheet] = useState(0);
  const [margin, setMargin] = useState(10);
  const [gap, setGap] = useState(4);
  const [allowRotate, setAllowRotate] = useState(true);
  const [marks, setMarks] = useState(true);
  const [cutLines, setCutLines] = useState(false);
  const [duplex, setDuplex] = useState<DuplexMode>("interleaved");
  const [mirrorBack, setMirrorBack] = useState(true);
  const [backOffset, setBackOffset] = useState({ x: 0, y: 0 });
  const [batchSize, setBatchSize] = useState(200);
  const [namePatternInput, setNamePattern] = useState("");
  const [cmyk, setCmyk] = useState(false);
  const [skipErrors, setSkipErrors] = useState(true);
  const [range, setRange] = useState({ from: 1, to: 0 });
  const [outputs, setOutputs] = useState<ExportFile[]>([]);
  const sheet = SHEET_SIZES.find((s) => s.key === sheetKey) ?? SHEET_SIZES[0];
  const imp = useMemo(() => impose({ sheet, card: layout.card, margin, gap, perSheet, allowRotate }), [sheet, layout.card, margin, gap, perSheet, allowRotate]);
  const maxFit = useMemo(() => impose({ sheet, card: layout.card, margin, gap, perSheet: 0, allowRotate }).capacity, [sheet, layout.card, margin, gap, allowRotate]);
  const namePattern = namePatternInput || (layout.roles.admission ? `{${layout.roles.admission}}_{${layout.roles.name || layout.roles.admission}}` : layout.roles.name ? `{#}_{${layout.roles.name}}` : "card_{#}");

  const pickRows = useCallback((r: PreflightReport | null) => {
    const to = range.to > 0 ? Math.min(range.to, rows.length) : rows.length;
    return rows.map((row, index) => ({ row, index })).filter(({ index }) => index + 1 >= range.from && index + 1 <= to && !(skipErrors && r?.rowsWithErrors.has(index)));
  }, [rows, range, skipErrors]);
  const exportRows = useMemo(() => pickRows(report), [pickRows, report]);

  async function generate() {
    const latest = report ?? (await check());
    const chosen = pickRows(latest);
    if (!chosen.length) { say("No cards to generate. Load data first, or include cards with errors.", "error"); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setOutputs([]);
    try {
      await ensureFonts(layout.elements.filter((e) => e.kind === "text").map((e) => (e as { font: string }).font));
      const files = await exportCards({
        layout, rows: chosen, dpi, format,
        templates: { front: templates.front?.bitmap ?? null, back: templates.back?.bitmap ?? null },
        media: resolverFor,
        impose: { sheet, margin, gap, perSheet, allowRotate },
        cropMarks: marks, cutLines, duplex, mirrorBack, backOffset, fileNamePattern: namePattern, batchSize, jobName,
        onProgress: (done, total, label) => setBusy({ label, done, total }),
        signal: ctrl.signal,
      });
      let final = files;
      if (cmyk && format.startsWith("pdf")) {
        final = [];
        for (const [k, f] of files.entries()) {
          setBusy({ label: `Converting to CMYK on the server (${k + 1}/${files.length})…`, done: k, total: files.length });
          const form = new FormData();
          form.append("pdf", f.blob, f.name);
          form.append("name", f.name.replace(/\.pdf$/, "_CMYK"));
          const { data } = await api.post("/admin/id-generator/cmyk-pdf", form, { responseType: "blob", timeout: 0, signal: ctrl.signal });
          final.push({ name: f.name.replace(/\.pdf$/, "_CMYK.pdf"), blob: data });
        }
      }
      setOutputs(final);
      final.forEach(download);
      say(`${chosen.length} cards generated in ${final.length} file${final.length > 1 ? "s" : ""}.`, "ok");
    } catch (e) {
      if ((e as Error).name === "AbortError" || (e as { code?: string }).code === "ERR_CANCELED") say("Generation cancelled.", "info");
      else if ((e as { response?: { status?: number } }).response?.status === 413) say("The server refused the file size (HTTP 413). Lower “Cards per PDF file”, or raise the upload limit — see admin-web/backend/deploy/nginx-upload-size.md.", "error");
      else say(await blobError(e, "Cards could not be generated."), "error");
    } finally {
      setBusy(null);
      abortRef.current = null;
    }
  }

  // ---------- render ----------
  const back = orgId ? (orgKind === "school" ? `/students?schoolId=${orgId}&schoolName=${encodeURIComponent(orgName)}` : `/institute-members?instituteId=${orgId}&instituteName=${encodeURIComponent(orgName)}`) : "/schools";
  const savedLayouts = library.filter((t) => isLayout(t.config_json));
  const plainTemplates = library.filter((t) => !isLayout(t.config_json) && t.image_url);
  const errorCount = report?.rowsWithErrors.size ?? 0;

  return (
    <div className="app-page idg">
      <HeaderBack to={back}>← Back</HeaderBack>

      <section className="idg-summary card">
        <div className="idg-summary-title">
          <span className="idg-badge" aria-hidden>ID</span>
          <div>
            <h2>{orgName || sheetName || "Bulk ID Card Generator"}</h2>
            <p>Upload a ready-made front/back template, map the data, and print press-ready sheets.</p>
          </div>
        </div>
        <div className="idg-chips">
          <span className="idg-chip is-green">Data: {rows.length} rows</span>
          <span className="idg-chip is-blue">Photos found: {photoStats.photos}</span>
          <span className={`idg-chip ${photoStats.missing ? "is-orange" : "is-green"}`}>Missing photos: {photoStats.missing}</span>
          {report && <span className={`idg-chip ${errorCount ? "is-red" : "is-green"}`}>Errors: {errorCount}</span>}
        </div>
        <div className="idg-summary-actions">
          <button type="button" className="btn-secondary" onClick={() => void saveLayout()} disabled={!templates.front || Boolean(busy)}>Save layout</button>
          <button type="button" className="btn-primary idg-cta" onClick={() => setStep(4)} disabled={!rows.length}>Generate ID cards ({rows.length})</button>
        </div>
      </section>

      <nav className="idg-steps" aria-label="Generator steps">
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={`idg-step${step === i ? " is-active" : ""}${i < step ? " is-done" : ""}`} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}>
            <b>{i + 1}</b><span>{s}</span>
          </button>
        ))}
      </nav>

      {status && <div className={`idg-status is-${status.tone}`} role="status">{status.text}<button type="button" onClick={() => setStatus(null)} aria-label="Dismiss">×</button></div>}
      {busy && (
        <div className="idg-progress" role="progressbar" aria-valuenow={busy.done} aria-valuemax={busy.total || undefined}>
          <div><span>{busy.label}</span>{busy.total > 0 && <b>{busy.done} / {busy.total}</b>}{abortRef.current && <button type="button" className="btn-secondary" onClick={() => abortRef.current?.abort()}>Cancel</button>}</div>
          <i style={{ width: busy.total ? `${(busy.done / busy.total) * 100}%` : "35%" }} className={busy.total ? "" : "is-indeterminate"} />
        </div>
      )}

      {/* ---------------- Step 1: data & media ---------------- */}
      {step === 0 && (
        <div className="idg-grid">
          <section className="card idg-panel">
            <h3>1. Card data</h3>
            <div className="idg-seg idg-seg-lg" role="tablist">
              <button type="button" role="tab" aria-selected={source === "upload"} className={source === "upload" ? "is-on" : ""} onClick={() => setSource("upload")}>Upload Excel / CSV</button>
              <button type="button" role="tab" aria-selected={source === "records"} className={source === "records" ? "is-on" : ""} onClick={() => setSource("records")}>Records in this app</button>
            </div>
            {source === "upload" ? (
              <label className="idg-drop">
                <input type="file" accept=".xlsx,.xls,.csv,.ods" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadSheet(f); }} />
                <svg viewBox="0 0 24 24" aria-hidden><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13l2 2 4-4" /></svg>
                <b>{sheetName ? `Replace “${sheetName}”` : "Choose Excel or CSV file"}</b>
                <span>Any column names — Std_Name, Full Name, Student… are detected automatically.</span>
              </label>
            ) : (
              <div className="idg-grid2">
                <Field label="Type">
                  <select className="input-field" value={orgKind} onChange={(e) => { setOrgKind(e.target.value as "school" | "institute"); setOrgId(""); }}>
                    <option value="school">School</option><option value="institute">Institute</option>
                  </select>
                </Field>
                <Field label={orgKind === "school" ? "School" : "Institute"}>
                  <select className="input-field" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                    <option value="">Select…</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {columns.length > 0 && (
              <>
                <h4>Smart column mapping</h4>
                <p className="idg-muted">Each card field is linked to a column. Change any that were guessed wrong.</p>
                <div className="idg-mapping">
                  {ROLES.map((role) => (
                    <Field key={role.key} label={role.label}>
                      <select className="input-field" value={layout.roles[role.key] ?? ""} onChange={(e) => setLayout((l) => ({ ...l, roles: { ...l.roles, [role.key]: e.target.value } }))}>
                        <option value="">— not used —</option>
                        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  ))}
                </div>
                <div className="idg-table-wrap">
                  <table className="idg-table">
                    <thead><tr><th>#</th>{columns.slice(0, 8).map((c) => <th key={c}>{c}</th>)}<th>Photo</th></tr></thead>
                    <tbody>
                      {rows.slice(0, 6).map((r, i) => (
                        <tr key={i}><td>{i + 1}</td>{columns.slice(0, 8).map((c) => <td key={c}>{r[c]}</td>)}<td>{hasMedia("photo", r, i) ? <span className="idg-ok">✓</span> : <span className="idg-miss">missing</span>}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="card idg-panel">
            <h3>2. Photos, signatures & thumbs</h3>
            <p className="idg-muted">Add everything at once as one ZIP or one folder. Sub-folders or file names like <code>Photos/</code>, <code>Parent sign/</code>, <code>Principal.png</code>, <code>Thumbs/</code> are sorted automatically.</p>
            <div className="idg-grid2">
              <label className="idg-drop is-small">
                <input type="file" accept=".zip,image/*" multiple hidden onChange={(e) => { if (e.target.files?.length) void addMediaFiles(e.target.files); e.target.value = ""; }} />
                <b>ZIP or images</b><span>Select a .zip or many photos</span>
              </label>
              <label className="idg-drop is-small">
                <input type="file" hidden multiple {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { if (e.target.files?.length) void addMediaFiles(e.target.files); e.target.value = ""; }} />
                <b>Whole folder</b><span>One click: every file inside</span>
              </label>
            </div>
            <div className="idg-media-kinds">
              {([["photo", "Student photos"], ["parentSign", "Parent signatures"], ["thumb", "Thumb impressions"], ["principalSign", "Principal signature"], ["logo", "School logo"]] as [MediaKind, string][]).map(([kind, text]) => {
                const count = kind === "photo" ? media.photo.size : kind === "parentSign" ? media.parentSign.size : kind === "thumb" ? media.thumb.size : (kind === "principalSign" ? media.principalSign : media.logo) ? 1 : 0;
                return (
                  <label key={kind} className="idg-kind">
                    <input type="file" accept="image/*,.zip" multiple={kind !== "principalSign" && kind !== "logo"} hidden onChange={(e) => { if (e.target.files?.length) void addMediaFiles(e.target.files, kind); e.target.value = ""; }} />
                    <span>{text}</span><b>{count || "Add"}</b>
                  </label>
                );
              })}
            </div>
            <h4>Match files to rows by</h4>
            <div className="idg-grid2">
              <Field label="Match using">
                <select className="input-field" value={layout.matchBy} onChange={(e) => setLayout((l) => ({ ...l, matchBy: e.target.value as Layout["matchBy"] }))}>
                  <option value="column">A column (file name = value)</option>
                  <option value="rownumber">Row number (1.jpg = first row)</option>
                </select>
              </Field>
              {layout.matchBy === "column" && (
                <Field label="Column">
                  <select className="input-field" value={layout.matchColumn} onChange={(e) => setLayout((l) => ({ ...l, matchColumn: e.target.value }))}>
                    <option value="">Select…</option>
                    {columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              )}
            </div>
            <p className="idg-muted">Capital letters, spaces and .jpg/.JPG/.png differences are ignored, and 00123 matches 123.</p>
            {intake && intake.skipped.length > 0 && <p className="idg-warn">{intake.skipped.length} files had no usable name and were skipped.</p>}
            <div className="idg-match-meter">
              <div><b>{photoStats.photos}</b><span>rows with a photo</span></div>
              <div className={photoStats.missing ? "is-warn" : ""}><b>{photoStats.missing}</b><span>rows without a photo</span></div>
              <div><b>{media.photo.size + media.parentSign.size + media.thumb.size}</b><span>files added</span></div>
            </div>
            <div className="idg-next"><button type="button" className="btn-primary" disabled={!rows.length} onClick={() => setStep(1)}>Next: card layout →</button></div>
          </section>
        </div>
      )}

      {/* ---------------- Step 2: layout ---------------- */}
      {step === 1 && (
        <div className="idg-workspace">
          <aside className="card idg-left">
            <h3>Excel columns</h3>
            <p className="idg-muted">Drag onto the card, or tap + to add.</p>
            <ul className="idg-columns">
              {columns.map((c) => (
                <li key={c} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-idg-column", c); e.dataTransfer.effectAllowed = "copy"; }}>
                  <span className="idg-grip" aria-hidden>⋮⋮</span>
                  <span className="idg-col-name">{c}<small>{previewRow[c] || "—"}</small></span>
                  <button type="button" onClick={() => addEl(newText(side, c, { y: 8 + (layout.elements.length % 10) * 6 }))} aria-label={`Add ${c}`}>+</button>
                </li>
              ))}
              {!columns.length && <li className="idg-muted">Load data in step 1.</li>}
            </ul>
            <h3>Add to card</h3>
            <div className="idg-add">
              <button type="button" onClick={() => addEl(newImage(side, "photo"))}>Photo</button>
              <button type="button" onClick={() => addEl(newImage(side, "parentSign"))}>Parent sign</button>
              <button type="button" onClick={() => addEl(newImage(side, "principalSign"))}>Principal sign</button>
              <button type="button" onClick={() => addEl(newImage(side, "thumb"))}>Thumb</button>
              <button type="button" onClick={() => addEl(newImage(side, "logo"))}>Logo</button>
              <button type="button" onClick={() => addEl(newQr(side, layout.roles.admission ?? ""))}>QR code</button>
              <button type="button" onClick={() => addEl(newBarcode(side, layout.roles.admission ?? layout.roles.roll ?? ""))}>Barcode</button>
              <button type="button" onClick={() => addEl(newText(side, ""))}>Text</button>
            </div>
          </aside>

          <section className="card idg-center">
            <TextToolbar el={selected?.kind === "text" ? selected : null} patch={(pt) => selected && patchEl(selected.id, pt)} />
            <div className="idg-center-bar">
              <div className="idg-seg" role="tablist" aria-label="Card side">
                {(["front", "back"] as Side[]).map((s) => <button key={s} type="button" role="tab" aria-selected={side === s} className={side === s ? "is-on" : ""} onClick={() => { setSide(s); setSelectedId(null); }}>{s === "front" ? "Front" : "Back"}</button>)}
              </div>
              <div className="idg-preview-nav">
                <button type="button" className="idg-tool" disabled={previewIndex <= 0} onClick={() => setPreviewIndex((i) => i - 1)} aria-label="Previous record">‹</button>
                <span>Record {rows.length ? Math.min(previewIndex + 1, rows.length) : 0} / {rows.length}</span>
                <button type="button" className="idg-tool" disabled={previewIndex >= rows.length - 1} onClick={() => setPreviewIndex((i) => i + 1)} aria-label="Next record">›</button>
              </div>
              <div className="idg-zoom">
                <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="Zoom out">−</button>
                <span>{Math.round(zoom * 100)}%</span>
                <button type="button" className="idg-tool" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} aria-label="Zoom in">+</button>
              </div>
            </div>
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
            {!templates[side] && <p className="idg-muted idg-center-hint">No {side} template yet — upload one on the right. Cards print on white until then.</p>}
          </section>

          <aside className="card idg-right">
            <h3>Template</h3>
            <div className="idg-templates">
              {(["front", "back"] as Side[]).map((s) => (
                <div key={s} className={`idg-tpl${side === s ? " is-current" : ""}`}>
                  <button type="button" className="idg-tpl-thumb" onClick={() => setSide(s)} style={{ aspectRatio: `${layout.card.w} / ${layout.card.h}`, ...(templates[s] ? { backgroundImage: `url(${templates[s]!.url})` } : {}) }} aria-label={`${s} template`}>
                    {!templates[s] && <span>{s === "front" ? "Front" : "Back"}</span>}
                  </button>
                  <label className="btn-secondary idg-small">
                    <input type="file" accept="image/png,image/jpeg,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadTemplate(s, f); }} />
                    Upload {s}
                  </label>
                  {templates[s] && <button type="button" className="idg-link" onClick={() => setTemplates((t) => ({ ...t, [s]: null }))}>Remove</button>}
                </div>
              ))}
            </div>
            {(plainTemplates.length > 0 || savedLayouts.length > 0) && (
              <div className="idg-grid1">
                {savedLayouts.length > 0 && (
                  <Field label="Saved layouts">
                    <select className="input-field" value="" onChange={(e) => { const t = savedLayouts.find((x) => x.id === e.target.value); if (t) void loadLibraryTemplate("front", t); }}>
                      <option value="">Load a saved layout…</option>
                      {savedLayouts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                )}
                {plainTemplates.length > 0 && (
                  <Field label={`From Templates library (${side})`}>
                    <select className="input-field" value="" onChange={(e) => { const t = plainTemplates.find((x) => x.id === e.target.value); if (t) void loadLibraryTemplate(side, t, false); }}>
                      <option value="">Choose a template…</option>
                      {plainTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            )}
            <div className="idg-grid2">
              <Field label="Card size" wide>
                <select className="input-field" value={CARD_SIZES.some((c) => c.key === layout.card.key) ? layout.card.key : "custom"} onChange={(e) => {
                  const c = CARD_SIZES.find((x) => x.key === e.target.value);
                  setLayout((l) => ({ ...l, card: c ?? { key: "custom", label: "Custom", w: l.card.w, h: l.card.h } }));
                }}>
                  {CARD_SIZES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  <option value="custom">Custom size…</option>
                </select>
              </Field>
              {layout.card.key === "custom" && (
                <>
                  <Field label="Width"><Num value={layout.card.w} min={20} max={300} suffix="mm" onChange={(v) => setLayout((l) => ({ ...l, card: { ...l.card, w: v } }))} /></Field>
                  <Field label="Height"><Num value={layout.card.h} min={20} max={300} suffix="mm" onChange={(v) => setLayout((l) => ({ ...l, card: { ...l.card, h: v } }))} /></Field>
                </>
              )}
              <Field label="Layout name" wide><input className="input-field" value={layout.name} onChange={(e) => setLayout((l) => ({ ...l, name: e.target.value }))} /></Field>
            </div>
            <h3>{selected ? "Selected field" : "Fields on this side"}</h3>
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
          </aside>
        </div>
      )}

      {/* ---------------- Step 3: photo AI ---------------- */}
      {step === 2 && (
        <div className="idg-grid">
          <section className="card idg-panel">
            <h3>Photo clean-up (AI on the server)</h3>
            {caps && !caps.photoAi && <p className="idg-warn">The AI service is not installed on the server yet. Face centring and light correction still work in basic mode; background removal needs <code>admin-web/scripts/setup-photo-ai.sh</code> on EC2.</p>}
            <div className="idg-ai-options">
              <label className="idg-ai-opt">
                <input type="checkbox" checked={layout.photo.removeBg} disabled={caps ? !caps.backgroundRemoval : false} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, removeBg: e.target.checked } }))} />
                <span><b>Remove background</b><small>Replaces any background with one uniform colour</small></span>
              </label>
              {layout.photo.removeBg && (
                <div className="idg-swatches" role="radiogroup" aria-label="Background colour">
                  {BG_SWATCHES.map((c) => <button key={c} type="button" role="radio" aria-checked={layout.photo.bg === c} className={layout.photo.bg === c ? "is-on" : ""} style={{ background: c }} onClick={() => setLayout((l) => ({ ...l, photo: { ...l.photo, bg: c } }))} aria-label={c} />)}
                  <Colour label="Custom background colour" value={layout.photo.bg} onChange={(v) => setLayout((l) => ({ ...l, photo: { ...l.photo, bg: v } }))} />
                </div>
              )}
              <label className="idg-ai-opt">
                <input type="checkbox" checked={layout.photo.face} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, face: e.target.checked } }))} />
                <span><b>Face centring & smart crop</b><small>Every face the same size and position</small></span>
              </label>
              <label className="idg-ai-opt">
                <input type="checkbox" checked={layout.photo.enhance} onChange={(e) => setLayout((l) => ({ ...l, photo: { ...l.photo, enhance: e.target.checked } }))} />
                <span><b>Auto light & contrast</b><small>Brightens dull or dark photos for print, adds sharpness</small></span>
              </label>
            </div>
            <div className="idg-grid2">
              <Field label="Process">
                <select className="input-field" value={aiScope} onChange={(e) => setAiScope(e.target.value as "all" | "missing")}>
                  <option value="missing">Only photos not processed yet</option>
                  <option value="all">All photos again</option>
                </select>
              </Field>
            </div>
            <div className="idg-row-actions">
              <button type="button" className="btn-primary" disabled={Boolean(busy) || !rows.length} onClick={() => void runPhotoAi()}>Process {aiScope === "all" ? rows.length : rows.length - processed.size} photos</button>
              {processed.size > 0 && <button type="button" className="btn-secondary" onClick={() => setProcessed(new Map())}>Use original photos</button>}
            </div>
            <p className="idg-muted">Signatures and thumb impressions are cleaned automatically on the card (paper removed, ink kept) — turn it off per field in the layout.</p>
          </section>
          <section className="card idg-panel">
            <h3>Results ({processed.size} processed)</h3>
            <PhotoGrid rows={rows} processed={processed} sourceBlob={sourceBlob} nameCol={layout.roles.name} />
          </section>
        </div>
      )}

      {/* ---------------- Step 4: pre-flight ---------------- */}
      {step === 3 && (
        <section className="card idg-panel">
          <div className="idg-check-head">
            <div>
              <h3>Pre-flight check</h3>
              <p className="idg-muted">Find missing photos, empty fields, wrong numbers, text that does not fit and duplicates — before printing.</p>
            </div>
            <button type="button" className="btn-primary" onClick={() => void check()} disabled={!rows.length}>Run check</button>
          </div>
          {report && (
            <>
              <div className="idg-match-meter">
                <div><b>{rows.length - report.rowsWithErrors.size}</b><span>cards ready</span></div>
                <div className={report.rowsWithErrors.size ? "is-bad" : ""}><b>{report.rowsWithErrors.size}</b><span>cards with errors</span></div>
                <div className={report.rowsWithWarnings.size ? "is-warn" : ""}><b>{report.rowsWithWarnings.size}</b><span>cards with warnings</span></div>
                <div className={report.duplicates.length ? "is-bad" : ""}><b>{report.duplicates.length}</b><span>duplicates</span></div>
              </div>
              <div className="idg-chips">
                {Object.entries(report.counts).map(([k, n]) => <span key={k} className="idg-chip">{k}: {n}</span>)}
              </div>
              <div className="idg-seg" role="tablist">
                {(["all", "error", "warning"] as const).map((f) => <button key={f} type="button" className={findingFilter === f ? "is-on" : ""} onClick={() => setFindingFilter(f)}>{f === "all" ? "All" : f === "error" ? "Errors" : "Warnings"}</button>)}
              </div>
              <div className="idg-table-wrap">
                <table className="idg-table">
                  <thead><tr><th>Row</th><th>{layout.roles.name ?? "Name"}</th><th>Problem</th><th>Field</th><th /></tr></thead>
                  <tbody>
                    {report.findings.filter((f) => findingFilter === "all" || f.severity === findingFilter).slice(0, 500).map((f, i) => (
                      <tr key={i} className={f.severity === "error" ? "is-error" : "is-warning"}>
                        <td>{f.row + 1}</td>
                        <td>{layout.roles.name ? rows[f.row]?.[layout.roles.name] : ""}</td>
                        <td>{f.message}</td>
                        <td>{f.field}</td>
                        <td><button type="button" className="idg-link" onClick={() => { setPreviewIndex(f.row); setStep(1); }}>View card</button></td>
                      </tr>
                    ))}
                    {report.findings.length === 0 && <tr><td colSpan={5} className="idg-ok">No problems found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="idg-next"><button type="button" className="btn-primary" onClick={() => setStep(4)}>Next: print & export →</button></div>
        </section>
      )}

      {/* ---------------- Step 5: export ---------------- */}
      {step === 4 && (
        <div className="idg-grid">
          <section className="card idg-panel">
            <h3>Output</h3>
            <div className="idg-formats" role="radiogroup">
              {([
                ["pdf-sheets", "Print sheets PDF", "Cards arranged on A4 / 12×18 / 13×19 with crop marks"],
                ["pdf-cards", "One card per page PDF", "For PVC card printers (Evolis, Zebra…)"],
                ["png-zip", "PNG images (ZIP)", "One high-quality file per card"],
                ["tiff-zip", "TIFF images (ZIP)", "Uncompressed, for print RIPs"],
                ["jpg-zip", "JPG images (ZIP)", "Smallest files"],
              ] as [ExportFormat, string, string][]).map(([k, t, d]) => (
                <button key={k} type="button" role="radio" aria-checked={format === k} className={format === k ? "is-on" : ""} onClick={() => setFormat(k)}>
                  <b>{t}</b><small>{d}</small>
                </button>
              ))}
            </div>
            <div className="idg-grid2">
              <Field label="Resolution">
                <select className="input-field" value={dpi} onChange={(e) => setDpi(Number(e.target.value) as 300 | 600)}>
                  <option value={300}>300 DPI (standard print)</option><option value={600}>600 DPI (premium)</option>
                </select>
              </Field>
              <Field label="Sides">
                <select className="input-field" value={duplex} onChange={(e) => setDuplex(e.target.value as DuplexMode)}>
                  <option value="interleaved">Front + back, duplex order</option>
                  <option value="separate">Front and back as separate files</option>
                  <option value="front-only">Front only</option>
                </select>
              </Field>
              {format.endsWith("zip") && (
                <Field label="File names" wide>
                  <input className="input-field" value={namePattern} onChange={(e) => setNamePattern(e.target.value)} />
                </Field>
              )}
              <Field label="From row"><Num value={range.from} step={1} min={1} max={Math.max(1, rows.length)} onChange={(v) => setRange((r) => ({ ...r, from: v }))} /></Field>
              <Field label="To row (0 = last)"><Num value={range.to} step={1} min={0} max={rows.length} onChange={(v) => setRange((r) => ({ ...r, to: v }))} /></Field>
              {format.startsWith("pdf") && <Field label="Cards per PDF file"><Num value={batchSize} step={50} min={10} max={2000} onChange={setBatchSize} /></Field>}
            </div>
            <div className="idg-switches">
              <span><input type="checkbox" checked={skipErrors} onChange={(e) => setSkipErrors(e.target.checked)} /> Leave out cards with pre-flight errors {report ? `(${report.rowsWithErrors.size})` : "(run check first)"}</span>
              {format.startsWith("pdf") && (
                <span><input type="checkbox" checked={cmyk} disabled={caps ? !caps.ghostscript : false} onChange={(e) => setCmyk(e.target.checked)} /> Convert to CMYK for offset press {caps && !caps.ghostscript ? "(needs Ghostscript on the server)" : ""}</span>
              )}
            </div>
            <div className="idg-generate">
              <button type="button" className="btn-primary idg-cta" disabled={Boolean(busy) || !exportRows.length} onClick={() => void generate()}>Generate {exportRows.length} ID cards</button>
              {outputs.length > 0 && (
                <ul className="idg-outputs">
                  {outputs.map((f) => <li key={f.name}><button type="button" className="idg-link" onClick={() => download(f)}>{f.name}</button><small>{fmtBytes(f.blob.size)}</small></li>)}
                </ul>
              )}
            </div>
          </section>

          {format === "pdf-sheets" ? (
            <section className="card idg-panel">
              <h3>Sheet layout (auto-imposition)</h3>
              <div className="idg-grid2">
                <Field label="Sheet">
                  <select className="input-field" value={sheetKey} onChange={(e) => { setSheetKey(e.target.value); setPerSheet(0); }}>
                    {SHEET_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label={`Cards per sheet (max ${maxFit})`}>
                  <select className="input-field" value={perSheet} onChange={(e) => setPerSheet(Number(e.target.value))}>
                    <option value={0}>Maximum ({maxFit})</option>
                    {Array.from({ length: Math.max(0, maxFit - 1) }, (_, i) => i + 1).reverse().map((n) => <option key={n} value={n}>{n} cards</option>)}
                  </select>
                </Field>
                <Field label="Margin"><Num value={margin} step={1} min={3} max={40} suffix="mm" onChange={setMargin} /></Field>
                <Field label="Gap between cards"><Num value={gap} step={0.5} min={0} max={20} suffix="mm" onChange={setGap} /></Field>
              </div>
              <div className="idg-switches">
                <span><input type="checkbox" checked={allowRotate} onChange={(e) => setAllowRotate(e.target.checked)} /> Turn cards to fit more per sheet</span>
                <span><input type="checkbox" checked={marks} onChange={(e) => setMarks(e.target.checked)} /> Crop marks</span>
                <span><input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} /> Cutting guide lines</span>
                {duplex !== "front-only" && <span><input type="checkbox" checked={mirrorBack} onChange={(e) => setMirrorBack(e.target.checked)} /> Mirror back sheet for duplex (backs line up behind fronts)</span>}
              </div>
              {duplex !== "front-only" && mirrorBack && (
                <div className="idg-grid2">
                  <Field label="Back offset X (printer calibration)"><Num value={backOffset.x} step={0.25} min={-10} max={10} suffix="mm" onChange={(v) => setBackOffset((o) => ({ ...o, x: v }))} /></Field>
                  <Field label="Back offset Y"><Num value={backOffset.y} step={0.25} min={-10} max={10} suffix="mm" onChange={(v) => setBackOffset((o) => ({ ...o, y: v }))} /></Field>
                </div>
              )}
              <SheetPreview sheet={sheet} imp={imp} marks={marks} />
              <p className="idg-muted">{imp.capacity} cards per sheet{imp.rotated ? " (turned 90°)" : ""} · {Math.ceil(exportRows.length / Math.max(1, imp.capacity))} sheets{duplex === "front-only" ? "" : " × 2 sides"}.</p>
            </section>
          ) : (
            <section className="card idg-panel">
              <h3>Preview</h3>
              <CardCanvas layout={layout} side="front" row={previewRow} template={templates.front?.bitmap ?? null} media={previewResolver} selectedId={null} zoom={0.8} onSelect={() => undefined} onChange={() => undefined} onDelete={() => undefined} onDropColumn={() => undefined} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SheetPreview({ sheet, imp, marks }: { sheet: { w: number; h: number }; imp: ReturnType<typeof impose>; marks: boolean }) {
  const m = cropMarks(imp, sheet);
  return (
    <svg className="idg-sheet" viewBox={`0 0 ${sheet.w} ${sheet.h}`} role="img" aria-label={`${imp.capacity} cards on the sheet`}>
      <rect x={0} y={0} width={sheet.w} height={sheet.h} fill="#fff" stroke="#c4ebd2" strokeWidth={1} />
      {imp.slots.map((s, i) => <rect key={i} x={s.x} y={s.y} width={imp.cellW} height={imp.cellH} rx={2} fill="#e9f8ef" stroke="#16a34a" strokeWidth={0.6} />)}
      {marks && m.lines.map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#17462e" strokeWidth={0.4} />)}
    </svg>
  );
}

function PhotoGrid({ rows, processed, sourceBlob, nameCol }: { rows: Row[]; processed: Map<number, Blob>; sourceBlob: (k: MediaKind, i: number) => Promise<Blob | null>; nameCol?: string }) {
  const [page, setPage] = useState(0);
  const per = 24;
  const items = rows.map((r, i) => ({ r, i })).slice(page * per, (page + 1) * per);
  return (
    <>
      <div className="idg-photos">
        {items.map(({ r, i }) => <PhotoThumb key={i} index={i} label={nameCol ? r[nameCol] : `Row ${i + 1}`} processed={processed.get(i)} sourceBlob={sourceBlob} />)}
      </div>
      {rows.length > per && (
        <div className="idg-preview-nav">
          <button type="button" className="idg-tool" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span>{page + 1} / {Math.ceil(rows.length / per)}</span>
          <button type="button" className="idg-tool" disabled={(page + 1) * per >= rows.length} onClick={() => setPage((p) => p + 1)}>›</button>
        </div>
      )}
    </>
  );
}

function PhotoThumb({ index, label, processed, sourceBlob }: { index: number; label: string; processed?: Blob; sourceBlob: (k: MediaKind, i: number) => Promise<Blob | null> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true, made: string | null = null;
    (async () => {
      const blob = processed ?? (await sourceBlob("photo", index));
      if (!live) return;
      if (!blob) { setMissing(true); setUrl(null); return; }
      made = URL.createObjectURL(blob);
      setMissing(false);
      setUrl(made);
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [index, processed, sourceBlob]);
  return (
    <figure className={`idg-photo${processed ? " is-done" : ""}${missing ? " is-missing" : ""}`}>
      {url ? <img src={url} alt={label} loading="lazy" /> : <span>{missing ? "No photo" : "…"}</span>}
      <figcaption>{label || `Row ${index + 1}`}</figcaption>
    </figure>
  );
}

function apiError(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
  return msg?.message || msg?.error || fallback;
}

async function blobError(e: unknown, fallback = "Request failed"): Promise<string> {
  const data = (e as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try { const j = JSON.parse(await data.text()); return j.message || j.error || fallback; } catch { return fallback; }
  }
  return apiError(e, e instanceof Error ? e.message : fallback);
}
