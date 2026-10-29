import { cropMarks, impose, mirrorSlot, type ImposeOptions } from "./impose";
import { PdfWriter, type PdfOp } from "./pdf";
import { canvasBlob, renderCard, type Bitmap, type MediaResolver } from "./render";
import { canvasToTiff } from "./tiff";
import type { Layout, Row, Side } from "./types";
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

export type BundleOptions = {
  layout: Layout;
  rows: { row: Row; index: number }[];
  columns: string[];
  templates: { front: Bitmap | null; back: Bitmap | null };
  media: (rowIndex: number) => MediaResolver;
  fileNamePattern: string;
  jobName: string;
  onProgress: (done: number, total: number, label: string) => void;
  signal?: AbortSignal;
};

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * One ZIP "folder" with everything for the batch:
 *   <Job>/Cards/<PhotoID>_<Name>_front.png (+ _back.png)  — 300 DPI, one file per card
 *   <Job>/Print sheets (A4).pdf                            — cards on A4 with crop marks, backs mirrored for duplex
 *   <Job>/Card details.csv                                 — every column for every card
 */
export async function exportBundle(o: BundleOptions): Promise<ExportFile> {
  const dpi = 300;
  const hasBack = hasSide(o.layout, "back", o.templates);
  const sides: Side[] = hasBack ? ["front", "back"] : ["front"];
  const folder = safeName(o.jobName);
  const zip = new ZipWriter();
  const pdf = new PdfWriter(o.jobName);
  const sheet = { key: "a4", label: "A4", w: 210, h: 297 };
  const imp = impose({ sheet, card: { w: o.layout.card.w, h: o.layout.card.h }, margin: 8, gap: 3, perSheet: 0, allowRotate: true });
  if (!imp.capacity) throw new Error("This card size does not fit on A4.");
  const marks = cropMarks(imp, sheet);
  const total = o.rows.length * sides.length;
  let done = 0;
  const canvas = document.createElement("canvas");
  const used = new Map<string, number>();
  const names = new Map<number, string>();
  const check = () => { if (o.signal?.aborted) throw new DOMException("Cancelled", "AbortError"); };

  for (let s = 0; s * imp.capacity < o.rows.length; s++) {
    const group = o.rows.slice(s * imp.capacity, (s + 1) * imp.capacity);
    for (const side of sides) {
      const ops: PdfOp[] = [];
      for (let k = 0; k < group.length; k++) {
        check();
        const item = group[k];
        let base = names.get(item.index);
        if (!base) {
          base = fileNameFor(o.fileNamePattern, item.row, item.index);
          const n = (used.get(base) ?? 0) + 1;
          used.set(base, n);
          if (n > 1) base = `${base}_${n}`;
          names.set(item.index, base);
        }
        await renderCard(canvas, { layout: o.layout, side, row: item.row, dpi, template: o.templates[side], media: o.media(item.index) });
        await zip.add(`${folder}/Cards/${base}${hasBack ? `_${side}` : ""}.png`, await canvasBlob(canvas, "image/png"));
        const placed = imp.rotated ? rotated(canvas, side === "front" ? 1 : 3) : canvas;
        const ref = pdf.addJpeg(await canvasBlob(placed, "image/jpeg", 0.93), placed.width, placed.height);
        const slot = side === "back" ? mirrorSlot(imp.slots[k], imp.cellW, sheet.w) : imp.slots[k];
        ops.push({ type: "image", ref, x: slot.x, y: slot.y, w: imp.cellW, h: imp.cellH });
        done++;
        o.onProgress(done, total, `Creating cards ${done}/${total}`);
        if (done % 3 === 0) await tick();
      }
      const mx = (x: number) => (side === "back" ? sheet.w - x : x);
      for (const l of marks.lines) ops.push({ type: "line", x1: mx(l.x1), y1: l.y1, x2: mx(l.x2), y2: l.y2, width: 0.2 });
      ops.push({ type: "text", x: 6, y: sheet.h - 2.5, size: 6, text: `${o.jobName} | Sheet ${s + 1} | ${side.toUpperCase()} | ${group.length} cards | 300 DPI` });
      pdf.addPage(sheet.w, sheet.h, ops);
    }
  }
  o.onProgress(total, total, "Packing the folder…");
  await zip.add(`${folder}/Print sheets (A4).pdf`, pdf.finish());
  const header = ["S.No", "File name", ...o.columns];
  const lines = [header.map(csvCell).join(",")];
  o.rows.forEach((item, i) => lines.push([String(i + 1), names.get(item.index) ?? "", ...o.columns.map((c) => item.row[c] ?? "")].map(csvCell).join(",")));
  await zip.add(`${folder}/Card details.csv`, new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
  return { name: `${folder}.zip`, blob: zip.finish() };
}
