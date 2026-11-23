import { cropMarks, impose, mirrorSlot, type ImposeOptions } from "./impose";
import { PdfWriter, type PdfOp } from "./pdf";
import { canvasBlob, renderCard, textValue, type Bitmap, type MediaResolver, type RenderIssue } from "./render";
import { canvasToTiff } from "./tiff";
import type { Layout, Row, SheetSize, Side } from "./types";
import { ZipWriter } from "./zip";

export type ExportFormat = "pdf-sheets" | "pdf-cards" | "png-zip" | "tiff-zip" | "jpg-zip";
export type DuplexMode = "interleaved" | "separate" | "front-only";

export type ExportOptions = {
  layout: Layout;
  rows: { row: Row; index: number }[];
  dpi: 300 | 600;
  format: ExportFormat;
  templates: { front: Bitmap | null; back: Bitmap | null };
  media: (rowIndex: number) => MediaResolver;
  impose: Omit<ImposeOptions, "card">;
  cropMarks: boolean;
  cutLines: boolean;
  duplex: DuplexMode;
  mirrorBack: boolean;
  backOffset: { x: number; y: number };
  fileNamePattern: string; // e.g. "{Admission No}_{Name}"
  batchSize: number; // cards per output file (PDF) — keeps files printable
  jobName: string;
  onProgress: (done: number, total: number, label: string) => void;
  signal?: AbortSignal;
};

export type ExportFile = { name: string; blob: Blob };

function hasSide(layout: Layout, side: Side, templates: ExportOptions["templates"]): boolean {
  return Boolean(templates[side]) || layout.elements.some((e) => e.side === side);
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, "_").slice(0, 80) || "card";
}

export function fileNameFor(pattern: string, row: Row, index: number): string {
  const name = pattern.replace(/\{([^}]+)\}/g, (_m, col: string) => (col.trim() === "#" ? String(index + 1) : (row[col.trim()] ?? "").trim()));
  return safeName(name.replace(/^_+|_+$/g, "")) || `card_${index + 1}`;
}

function rotated(source: HTMLCanvasElement, quarterTurns: 1 | 3): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = source.height;
  c.height = source.width;
  const ctx = c.getContext("2d")!;
  if (quarterTurns === 1) { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); }
  else { ctx.translate(0, c.height); ctx.rotate(-Math.PI / 2); }
  ctx.drawImage(source, 0, 0);
  return c;
}

const tick = () => new Promise((r) => setTimeout(r, 0));


export async function exportCards(o: ExportOptions): Promise<ExportFile[]> {
  const sides: Side[] = ["front"];
  if (o.duplex !== "front-only" && hasSide(o.layout, "back", o.templates)) sides.push("back");
  const total = o.rows.length * sides.length;
  let done = 0;
  const canvas = document.createElement("canvas");
  const files: ExportFile[] = [];
  const check = () => { if (o.signal?.aborted) throw new DOMException("Export cancelled", "AbortError"); };

  const renderTo = async (item: { row: Row; index: number }, side: Side) => {
    await renderCard(canvas, { layout: o.layout, side, row: item.row, dpi: o.dpi, template: o.templates[side], media: o.media(item.index) });
    done++;
    o.onProgress(done, total, `Rendering ${side} ${done}/${total}`);
    if (done % 4 === 0) await tick();
    return canvas;
  };

  // ---------- Individual image files in a ZIP ----------
  if (o.format === "png-zip" || o.format === "tiff-zip" || o.format === "jpg-zip") {
    const zip = new ZipWriter();
    const used = new Map<string, number>();
    for (const item of o.rows) {
      check();
      let base = fileNameFor(o.fileNamePattern, item.row, item.index);
      const n = (used.get(base) ?? 0) + 1;
      used.set(base, n);
      if (n > 1) base = `${base}_${n}`;
      for (const side of sides) {
        const c = await renderTo(item, side);
        const suffix = sides.length > 1 ? `_${side}` : "";
        if (o.format === "tiff-zip") await zip.add(`${base}${suffix}.tif`, canvasToTiff(c, o.dpi));
        else if (o.format === "jpg-zip") await zip.add(`${base}${suffix}.jpg`, await canvasBlob(c, "image/jpeg", 0.95));
        else await zip.add(`${base}${suffix}.png`, await canvasBlob(c, "image/png"));
      }
    }
    files.push({ name: `${safeName(o.jobName)}_${o.format.split("-")[0].toUpperCase()}_${o.dpi}dpi.zip`, blob: zip.finish() });
    return files;
  }

  // ---------- One card per page (card-size PDF, for card printers) ----------
  if (o.format === "pdf-cards") {
    const batches = Math.ceil(o.rows.length / o.batchSize);
    for (let b = 0; b < batches; b++) {
      const pdf = new PdfWriter(o.jobName);
      for (const item of o.rows.slice(b * o.batchSize, (b + 1) * o.batchSize)) {
        for (const side of sides) {
          check();
          const c = await renderTo(item, side);
          const ref = pdf.addJpeg(await canvasBlob(c, "image/jpeg", 0.95), c.width, c.height);
          pdf.addPage(o.layout.card.w, o.layout.card.h, [{ type: "image", ref, x: 0, y: 0, w: o.layout.card.w, h: o.layout.card.h }]);
        }
      }
      files.push({ name: `${safeName(o.jobName)}_cards${batches > 1 ? `_part${b + 1}` : ""}.pdf`, blob: pdf.finish() });
    }
    return files;
  }

  // ---------- Imposed print sheets with crop marks ----------
  const imp = impose({ ...o.impose, card: { w: o.layout.card.w, h: o.layout.card.h } });
  if (!imp.capacity) throw new Error("The card does not fit on this sheet with these margins.");
  const sheet = o.impose.sheet;
  const marks = cropMarks(imp, sheet);
  const perFile = Math.max(imp.capacity, Math.floor(o.batchSize / imp.capacity) * imp.capacity);
  const fileCount = Math.ceil(o.rows.length / perFile);
  const sheetsTotal = Math.ceil(o.rows.length / imp.capacity);

  for (let f = 0; f < fileCount; f++) {
    const fileRows = o.rows.slice(f * perFile, (f + 1) * perFile);
    const writers: Record<"front" | "back" | "both", PdfWriter | null> = {
      both: o.duplex === "interleaved" ? new PdfWriter(o.jobName) : null,
      front: o.duplex !== "interleaved" ? new PdfWriter(o.jobName + " front") : null,
      back: o.duplex === "separate" && sides.includes("back") ? new PdfWriter(o.jobName + " back") : null,
    };
    for (let s = 0; s * imp.capacity < fileRows.length; s++) {
      const group = fileRows.slice(s * imp.capacity, (s + 1) * imp.capacity);
      const sheetNo = f * (perFile / imp.capacity) + s + 1;
      for (const side of sides) {
        check();
        const writer = writers.both ?? writers[side];
        if (!writer) continue;
        const ops: PdfOp[] = [];
        for (let k = 0; k < group.length; k++) {
          let c = await renderTo(group[k], side);
          if (imp.rotated) c = rotated(c, side === "front" ? 1 : 3);
          const ref = writer.addJpeg(await canvasBlob(c, "image/jpeg", 0.93), c.width, c.height);
          const slot = side === "back" && o.mirrorBack ? mirrorSlot(imp.slots[k], imp.cellW, sheet.w, o.backOffset.x, o.backOffset.y) : imp.slots[k];
          ops.push({ type: "image", ref, x: slot.x, y: slot.y, w: imp.cellW, h: imp.cellH });
        }
        const mirrorX = (x: number) => (side === "back" && o.mirrorBack ? sheet.w - x + o.backOffset.x : x);
        const dy = side === "back" && o.mirrorBack ? o.backOffset.y : 0;
        if (o.cutLines) {
          for (const x of marks.xs) ops.push({ type: "line", x1: mirrorX(x), y1: 0, x2: mirrorX(x), y2: sheet.h, width: 0.1, dash: 1.5, gray: 0.6 });
          for (const y of marks.ys) ops.push({ type: "line", x1: 0, y1: y + dy, x2: sheet.w, y2: y + dy, width: 0.1, dash: 1.5, gray: 0.6 });
        }
        if (o.cropMarks) {
          for (const l of marks.lines) ops.push({ type: "line", x1: mirrorX(l.x1), y1: l.y1 + dy, x2: mirrorX(l.x2), y2: l.y2 + dy, width: 0.2 });
        }
        if (o.impose.margin >= 6) {
          ops.push({ type: "text", x: 6, y: sheet.h - 2.5, size: 6, text: `${o.jobName} | Sheet ${sheetNo}/${sheetsTotal} | ${side.toUpperCase()} | ${group.length} cards | ${o.dpi} DPI` });
        }
        writer.addPage(sheet.w, sheet.h, ops);
      }
    }
    const part = fileCount > 1 ? `_part${f + 1}` : "";
    if (writers.both) files.push({ name: `${safeName(o.jobName)}_print_duplex${part}.pdf`, blob: writers.both.finish() });
    if (writers.front) files.push({ name: `${safeName(o.jobName)}_print_front${part}.pdf`, blob: writers.front.finish() });
    if (writers.back) files.push({ name: `${safeName(o.jobName)}_print_back${part}.pdf`, blob: writers.back.finish() });
  }
  return files;
}

export type PrintSettings = {
  sheet: SheetSize; // paper, e.g. A4 or 12 × 18 in
  landscape: boolean; // horizontal sheet
  gap: number; // mm between cards (fallback)
  gapX?: number; // mm between columns
  gapY?: number; // mm between rows
  margin: number; // mm, room for crop marks
};

export type BundleOptions = {
  layout: Layout;
  rows: { row: Row; index: number }[];
  columns: string[];
  templates: { front: Bitmap | null; back: Bitmap | null };
  media: (rowIndex: number) => MediaResolver;
  fileNamePattern: string;
  jobName: string;
  print: PrintSettings;
  idColumn: string; // e.g. "Photo ID"
  nameColumn: string; // e.g. "Name"
  /** Output resolution. Use the template's own resolution so the cards come out exactly as uploaded. */
  dpi?: number;
  /** Called with every finished front side (e.g. to save a copy for the teacher app). */
  onFront?: (rowIndex: number, canvas: HTMLCanvasElement) => Promise<void> | void;
  /** Write the Front / Back folders and files into this folder instead of downloading a ZIP. */
  outputFolder?: OutputFolder | null;
  onProgress: (done: number, total: number, label: string) => void;
  signal?: AbortSignal;
};

/** A card whose text is cut off / runs outside the card: listed in the error report. */
export type CardProblem = { index: number; id: string; name: string; side: Side; field: string; value: string; message: string; fix: string };
/** A folder the admin picked on the computer (browser "choose folder"). Minimal shape we use. */
export type OutputFolder = {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<OutputFolder>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
};

/** `file` is the ZIP to download, or null when the cards were written straight into a chosen folder. */
export type BundleResult = { file: ExportFile | null; problems: CardProblem[]; savedTo?: string };

/** The finished card at exactly the template's width × height in pixels (unchanged when it already matches). */
function atTemplateSize(card: HTMLCanvasElement, template: Bitmap | null, spare: HTMLCanvasElement): HTMLCanvasElement {
  if (!template || (card.width === template.width && card.height === template.height)) return card;
  spare.width = template.width;
  spare.height = template.height;
  const ctx = spare.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(card, 0, 0, template.width, template.height);
  return spare;
}

/** High-quality JPG with the print resolution (DPI) written into its JFIF header. */
async function jpegWithDpi(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const blob = await canvasBlob(canvas, "image/jpeg", 0.95);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const jfif = bytes[2] === 0xff && bytes[3] === 0xe0 && bytes[6] === 0x4a && bytes[7] === 0x46 && bytes[8] === 0x49 && bytes[9] === 0x46;
  if (jfif) {
    const d = Math.max(1, Math.min(65535, Math.round(dpi)));
    bytes[13] = 1; // dots per inch
    bytes[14] = d >> 8; bytes[15] = d & 255;
    bytes[16] = d >> 8; bytes[17] = d & 255;
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

async function writeIntoFolder(root: OutputFolder, path: string, blob: Blob): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  const name = parts.pop() ?? "file";
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Text that does not fit its box, or a text box that sticks out of the card. */
type TextProblem = { field: string; value: string; message: string; fix: string };
function textProblems(layout: Layout, side: Side, row: Row, issues: RenderIssue[]): TextProblem[] {
  const out: TextProblem[] = [];
  for (const issue of issues) {
    if (issue.type !== "overflow") continue;
    const el = layout.elements.find((e) => e.id === issue.elementId);
    const field = el && el.kind === "text" ? el.column || "Text" : "Text";
    const value = el && el.kind === "text" ? textValue(el, row) : "";
    out.push({ field, value, message: "Text is too long — it does not fit and is cut off", fix: "Shorten this value in Excel, or make the text box wider/taller, then Regenerate errors." });
  }
  for (const el of layout.elements) {
    if (el.side !== side || el.kind !== "text") continue;
    const value = textValue(el, row);
    if (!value) continue;
    const outside = el.x < -0.2 || el.y < -0.2 || el.x + el.w > layout.card.w + 0.2 || el.y + el.h > layout.card.h + 0.2;
    if (outside) out.push({ field: el.column || "Text", value, message: "Text box sits outside the card edge", fix: "Move the box fully inside the card, then Regenerate errors." });
  }
  return out;
}

/**
 * One "folder" (saved to disk, or a ZIP of the same tree to download) for the batch:
 *   <School>/Single/Front/<PhotoID>.jpg          — every front side, exactly the template's pixel size
 *   <School>/Single/Back/<PhotoID>.jpg           — every back side (only when a back template exists)
 *   <School>/Print Sheets/Front/Sheet NN.jpg     — imposed print sheets (front) as images
 *   <School>/Print Sheets/Back/Sheet NN.jpg      — imposed print sheets (back) as images
 *   <School>/PDF/Print sheets (<paper>).pdf      — the print sheets as one PDF with crop marks
 *   <School>/Excel Correction/Card details.csv   — every column for every card
 *   <School>/Excel Correction/ERRORS - cards to correct.csv — only when some text was cut off
 */
export async function exportBundle(o: BundleOptions): Promise<BundleResult> {
  // The template's own resolution, exactly (300 stays 300 — never rounded to 313 or reset to 72).
  const dpi = Math.max(72, Math.min(2400, o.dpi ?? 300));
  const hasBack = hasSide(o.layout, "back", o.templates);
  const sides: Side[] = hasBack ? ["front", "back"] : ["front"];
  const folder = safeName(o.jobName);
  const zip = new ZipWriter();
  const put = (path: string, blob: Blob) => (o.outputFolder ? writeIntoFolder(o.outputFolder, path, blob) : zip.add(path, blob));
  const pdf = new PdfWriter(o.jobName);
  let base = o.print.sheet;
  let sheet = o.print.landscape
    ? { ...base, w: Math.max(base.w, base.h), h: Math.min(base.w, base.h) }
    : { ...base, w: Math.min(base.w, base.h), h: Math.max(base.w, base.h) };
  const card = { w: o.layout.card.w, h: o.layout.card.h };
  let imp = impose({ sheet, card, margin: o.print.margin, gap: o.print.gap, gapX: o.print.gapX, gapY: o.print.gapY, perSheet: 0, allowRotate: false });
  if (!imp.capacity) {
    // Large designs (e.g. an A4 template): the card does not fit on the chosen paper with these margins,
    // so each print page is the card itself — the cards are still all generated.
    base = { key: "card", label: "card size", w: card.w, h: card.h };
    sheet = { ...base };
    imp = impose({ sheet, card, margin: 0, gap: 0, perSheet: 0, allowRotate: false });
  }
  const marks = cropMarks(imp, sheet);
  // Print sheets are also saved as images (one JPG per sheet side) in a ZIP, next to the PDF.
  const sheetDpi = Math.min(dpi, 300, 14000 / (Math.max(sheet.w, sheet.h) / 25.4));
  const smm = sheetDpi / 25.4;
  const sheetCanvas = document.createElement("canvas");
  sheetCanvas.width = Math.round(sheet.w * smm);
  sheetCanvas.height = Math.round(sheet.h * smm);
  const sctx = sheetCanvas.getContext("2d")!;
  const total = o.rows.length * sides.length;
  let done = 0;
  const canvas = document.createElement("canvas");
  const scaled = document.createElement("canvas");
  const used = new Map<string, number>();
  const names = new Map<number, string>();
  const problems: CardProblem[] = [];
  const check = () => { if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };

  for (let s = 0; s * imp.capacity < o.rows.length; s++) {
    const group = o.rows.slice(s * imp.capacity, (s + 1) * imp.capacity);
    for (const side of sides) {
      const ops: PdfOp[] = [];
      sctx.setTransform(1, 0, 0, 1, 0, 0);
      sctx.fillStyle = "#ffffff";
      sctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
      for (let k = 0; k < group.length; k++) {
        check();
        const item = group[k];
        let fileBase = names.get(item.index);
        if (!fileBase) {
          fileBase = fileNameFor(o.fileNamePattern, item.row, item.index);
          const n = (used.get(fileBase) ?? 0) + 1;
          used.set(fileBase, n);
          if (n > 1) fileBase = `${fileBase}_${n}`;
          names.set(item.index, fileBase);
        }
        const issues = await renderCard(canvas, { layout: o.layout, side, row: item.row, dpi, template: o.templates[side], media: o.media(item.index) });
        for (const tp of textProblems(o.layout, side, item.row, issues)) {
          problems.push({ index: item.index, id: item.row[o.idColumn] ?? "", name: item.row[o.nameColumn] ?? "", side, field: tp.field, value: tp.value, message: tp.message, fix: tp.fix });
        }
        // Same pixel size as the uploaded template, saved as JPG (with the print DPI in the file).
        const out = atTemplateSize(canvas, o.templates[side], scaled);
        await put(`${folder}/Single/${side === "front" ? "Front" : "Back"}/${fileBase}.jpg`, await jpegWithDpi(out, dpi));
        if (side === "front" && o.onFront) await o.onFront(item.index, canvas);
        const ref = pdf.addJpeg(await canvasBlob(canvas, "image/jpeg", 0.93), canvas.width, canvas.height);
        const slot = side === "back" ? mirrorSlot(imp.slots[k], imp.cellW, sheet.w) : imp.slots[k];
        ops.push({ type: "image", ref, x: slot.x, y: slot.y, w: imp.cellW, h: imp.cellH });
        sctx.imageSmoothingQuality = "high";
        sctx.drawImage(canvas, slot.x * smm, slot.y * smm, imp.cellW * smm, imp.cellH * smm);
        done++;
        o.onProgress(done, total, `Creating cards ${done}/${total}`);
        if (done % 3 === 0) await tick();
      }
      const mx = (x: number) => (side === "back" ? sheet.w - x : x);
      const cutMarks = base.key === "card" ? [] : marks.lines; // a card-size page has no room for crop marks
      for (const l of cutMarks) ops.push({ type: "line", x1: mx(l.x1), y1: l.y1, x2: mx(l.x2), y2: l.y2, width: 0.2 });
      sctx.strokeStyle = "#000000";
      sctx.lineWidth = Math.max(1, 0.2 * smm);
      sctx.beginPath();
      for (const l of cutMarks) { sctx.moveTo(mx(l.x1) * smm, l.y1 * smm); sctx.lineTo(mx(l.x2) * smm, l.y2 * smm); }
      sctx.stroke();
      await put(`${folder}/Print Sheets/${side === "front" ? "Front" : "Back"}/Sheet ${String(s + 1).padStart(2, "0")}.jpg`, await jpegWithDpi(sheetCanvas, sheetDpi));
      if (o.print.margin >= 5 && base.key !== "card") ops.push({ type: "text", x: 6, y: sheet.h - 2.5, size: 6, text: `${o.jobName} | Sheet ${s + 1} | ${side.toUpperCase()} | ${group.length} cards | ${dpi} DPI` });
      pdf.addPage(sheet.w, sheet.h, ops);
    }
  }
  o.onProgress(total, total, "Packing the folder…");
  const sheetName = /^\d+x\d+$/.test(base.key) ? `${base.key} in` : base.label.split(" (")[0];
  const sheetTitle = `Print sheets (${sheetName}${o.print.landscape ? ", landscape" : ""})`;
  await put(`${folder}/PDF/${sheetTitle}.pdf`, pdf.finish());
  const header = ["S.No", "File name", ...o.columns];
  const lines = [header.map(csvCell).join(",")];
  o.rows.forEach((item, i) => lines.push([String(i + 1), names.get(item.index) ?? "", ...o.columns.map((c) => item.row[c] ?? "")].map(csvCell).join(",")));
  await put(`${folder}/Excel Correction/Card details.csv`, new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv" }));
  if (problems.length) {
    const report = [["S.No", "Photo ID", "Name", "Side", "Field", "Current value (wrong)", "What is wrong", "How to correct it"].join(",")];
    problems.forEach((p, i) =>
      report.push([String(i + 1), p.id, p.name, p.side === "front" ? "Front" : "Back", p.field, p.value, p.message, p.fix].map(csvCell).join(","))
    );
    await put(`${folder}/Excel Correction/ERRORS - cards to correct.csv`, new Blob(["\ufeff" + report.join("\r\n")], { type: "text/csv" }));
  }
  if (o.outputFolder) return { file: null, problems, savedTo: `${o.outputFolder.name}/${folder}` };
  return { file: { name: `${folder}.zip`, blob: zip.finish() }, problems };
}
