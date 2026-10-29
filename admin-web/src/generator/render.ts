import { encodeBarcode } from "./barcode";
import { applyCase, roleValue } from "./columns";
import { encodeQr } from "./qr";
import type {
  BarcodeElement, CardElement, ImageElement, Layout, MediaKind, PhotoShape, QrElement, Row, Side, TextElement,
} from "./types";

/** px per mm and per pt at a given output resolution */
export const pxPerMm = (dpi: number) => dpi / 25.4;
export const pxPerPt = (dpi: number) => dpi / 72;

export type Bitmap = ImageBitmap | HTMLCanvasElement | HTMLImageElement;
export type MediaResolver = (kind: MediaKind, el: ImageElement) => Promise<Bitmap | null>;

export type RenderInput = {
  layout: Layout;
  side: Side;
  row: Row;
  dpi: number;
  template: Bitmap | null;
  media: MediaResolver;
  /** Optional colour for the empty card when there is no template */
  blankColor?: string;
};

export type RenderIssue = { elementId: string; type: "overflow" | "missing-media" | "barcode" | "qr" | "empty"; message: string };

async function decodeWithImageElement(blob: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || 600;
    c.height = img.naturalHeight || 750;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await createImageBitmap(c);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decoded images are large (a 12 MP photo is ~48 MB), so only a few stay decoded at once:
 * a small LRU cache, and photos are decoded at most `maxSide` px on the long edge.
 */
const bitmapCache = new Map<Blob, Promise<ImageBitmap>>();
const CACHE_LIMIT = 24;
export function blobToBitmap(blob: Blob, maxSide = 1600): Promise<ImageBitmap> {
  const hit = bitmapCache.get(blob);
  if (hit) {
    bitmapCache.delete(blob);
    bitmapCache.set(blob, hit); // mark as recently used
    return hit;
  }
  const p = (async () => {
    let full: ImageBitmap;
    try {
      full = await createImageBitmap(blob, { imageOrientation: "from-image" } as ImageBitmapOptions);
    } catch {
      full = await decodeWithImageElement(blob); // SVG, some PNG/JPEG variants, older Safari
    }
    const long = Math.max(full.width, full.height);
    if (long <= maxSide) return full;
    const s = maxSide / long;
    const small = await createImageBitmap(full, { resizeWidth: Math.round(full.width * s), resizeHeight: Math.round(full.height * s), resizeQuality: "high" });
    full.close();
    return small;
  })();
  bitmapCache.set(blob, p);
  while (bitmapCache.size > CACHE_LIMIT) {
    const [oldBlob, oldP] = bitmapCache.entries().next().value as [Blob, Promise<ImageBitmap>];
    bitmapCache.delete(oldBlob);
    // Close after a moment so a render that is still drawing it can finish
    void oldP.then((b) => setTimeout(() => b.close(), 4000)).catch(() => undefined);
  }
  p.catch(() => bitmapCache.delete(blob));
  return p;
}

function bitmapSize(b: Bitmap): { w: number; h: number } {
  if (b instanceof HTMLImageElement) return { w: b.naturalWidth, h: b.naturalHeight };
  return { w: b.width, h: b.height };
}

const inkCache = new WeakMap<object, HTMLCanvasElement>();

/** Turns a signature/thumb photographed on paper into transparent ink (cached per image). */
export function cleanInk(source: Bitmap, maxSide = 1400): HTMLCanvasElement {
  const hit = inkCache.get(source);
  if (hit) return hit;
  const result = cleanInkUncached(source, maxSide);
  inkCache.set(source, result);
  return result;
}

function cleanInkUncached(source: Bitmap, maxSide: number): HTMLCanvasElement {
  const { w, h } = bitmapSize(source);
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * s));
  c.height = Math.max(1, Math.round(h * s));
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Paper brightness = 90th percentile of luminance; ink = 5th percentile
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  const total = d.length / 4;
  const pct = (p: number) => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * p) return v; } return 255; };
  const paper = pct(0.9), ink = Math.min(pct(0.05), paper - 40);
  const range = Math.max(30, paper - ink - 10);
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const a = Math.max(0, Math.min(1, (paper - 12 - lum) / range));
    // Deepen the ink so faint pen strokes print clearly
    const k = 0.55;
    d[i] = d[i] * k; d[i + 1] = d[i + 1] * k; d[i + 2] = d[i + 2] * k;
    d[i + 3] = Math.round(Math.pow(a, 0.8) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function shapePath(ctx: CanvasRenderingContext2D, shape: PhotoShape, x: number, y: number, w: number, h: number, radius: number): void {
  ctx.beginPath();
  const cx = x + w / 2, cy = y + h / 2;
  const poly = (n: number, rot: number, rx = w / 2, ry = h / 2) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i * 2 * Math.PI) / n;
      const px = cx + rx * Math.cos(a), py = cy + ry * Math.sin(a);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };
  switch (shape) {
    case "circle": { const r = Math.min(w, h) / 2; ctx.arc(cx, cy, r, 0, Math.PI * 2); break; }
    case "oval": ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); break;
    case "square": { const s = Math.min(w, h); ctx.rect(cx - s / 2, cy - s / 2, s, s); break; }
    case "rounded": { const r = Math.min(radius, w / 2, h / 2); ctx.roundRect(x, y, w, h, r); break; }
    case "arch": { const r = w / 2; ctx.moveTo(x, y + h); ctx.lineTo(x, y + r); ctx.arc(cx, y + r, r, Math.PI, 0); ctx.lineTo(x + w, y + h); ctx.closePath(); break; }
    case "hexagon": poly(6, 0); break;
    case "octagon": poly(8, Math.PI / 8); break;
    case "pentagon": poly(5, -Math.PI / 2); break;
    case "diamond": poly(4, -Math.PI / 2); break;
    case "shield": {
      ctx.moveTo(x, y + h * 0.08);
      ctx.quadraticCurveTo(cx, y - h * 0.04, x + w, y + h * 0.08);
      ctx.lineTo(x + w, y + h * 0.5);
      ctx.quadraticCurveTo(x + w, y + h * 0.85, cx, y + h);
      ctx.quadraticCurveTo(x, y + h * 0.85, x, y + h * 0.5);
      ctx.closePath();
      break;
    }
    case "star": {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.5;
        const px = cx + (w / 2) * r * Math.cos(a), py = cy + (h / 2) * r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    default: ctx.rect(x, y, w, h);
  }
}

export function textValue(el: TextElement, row: Row): string {
  const value = el.column ? (row[el.column] ?? "").trim() : "";
  if (el.column && !value) return el.staticText ? applyCase(el.staticText, el.textCase) : "";
  const body = el.column ? value : el.staticText;
  return applyCase(`${el.prefix}${body}${el.column ? el.suffix : ""}`, el.textCase);
}

function fontString(el: TextElement, sizePx: number): string {
  return `${el.italic ? "italic " : ""}${el.weight} ${sizePx.toFixed(2)}px "${el.font}", "Noto Sans Telugu", Arial, sans-serif`;
}

function setSpacing(ctx: CanvasRenderingContext2D, el: TextElement, sizePx: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${((el.letterSpacing / 1000) * sizePx).toFixed(2)}px`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

type Fitted = { sizePx: number; lines: string[]; overflow: boolean };
export function fitText(ctx: CanvasRenderingContext2D, el: TextElement, text: string, boxW: number, boxH: number, dpi: number): Fitted {
  const ptPx = pxPerPt(dpi);
  const max = el.size * ptPx;
  const min = Math.min(el.size, Math.max(3, el.minSize)) * ptPx;
  const step = 0.25 * ptPx;
  let size = max;
  for (;;) {
    ctx.font = fontString(el, size);
    setSpacing(ctx, el, size);
    const lines = el.multiline ? wrap(ctx, text, boxW) : [text];
    const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    const height = lines.length * size * el.lineHeight;
    const fits = widest <= boxW + 0.5 && height <= boxH * 1.05 + 0.5;
    if (fits || !el.autoShrink || size - step < min) return { sizePx: size, lines, overflow: !fits };
    size -= step;
  }
}

function drawText(ctx: CanvasRenderingContext2D, el: TextElement, row: Row, w: number, h: number, dpi: number, issues: RenderIssue[]): void {
  const text = textValue(el, row);
  if (!text) {
    if (el.required && el.column) issues.push({ elementId: el.id, type: "empty", message: `${el.column} is empty` });
    return;
  }
  const fitted = fitText(ctx, el, text, w, h, dpi);
  if (fitted.overflow) issues.push({ elementId: el.id, type: "overflow", message: `"${text.slice(0, 30)}" is too long for its box` });
  const { sizePx, lines } = fitted;
  ctx.font = fontString(el, sizePx);
  setSpacing(ctx, el, sizePx);
  ctx.textBaseline = "middle";
  ctx.textAlign = el.align;
  const lh = sizePx * el.lineHeight;
  const blockH = lines.length * lh;
  const top = el.vAlign === "top" ? 0 : el.vAlign === "bottom" ? h - blockH : (h - blockH) / 2;
  const ax = el.align === "left" ? 0 : el.align === "right" ? w : w / 2;
  let fill: string | CanvasGradient = el.color;
  if (el.gradient.on) {
    const a = (el.gradient.angle * Math.PI) / 180;
    const dx = Math.cos(a) * w / 2, dy = Math.sin(a) * h / 2;
    const g = ctx.createLinearGradient(w / 2 - dx, h / 2 - dy, w / 2 + dx, h / 2 + dy);
    g.addColorStop(0, el.color);
    g.addColorStop(1, el.gradient.color2);
    fill = g;
  }
  ctx.save();
  // Clip to the box (+ a little room for strokes) so nothing crosses the card design
  ctx.beginPath();
  ctx.rect(-sizePx * 0.1, -sizePx * 0.1, w + sizePx * 0.2, h + sizePx * 0.2);
  ctx.clip();
  lines.forEach((line, i) => {
    const y = top + lh * (i + 0.5);
    if (el.stroke.width > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeStyle = el.stroke.color;
      ctx.lineWidth = el.stroke.width * pxPerPt(dpi) * 2;
      ctx.strokeText(line, ax, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(line, ax, y);
    if (el.underline) {
      const lw = ctx.measureText(line).width;
      const x0 = el.align === "left" ? 0 : el.align === "right" ? w - lw : (w - lw) / 2;
      ctx.fillRect(x0, y + sizePx * 0.42, lw, Math.max(1, sizePx * 0.06));
    }
  });
  ctx.restore();
}

async function drawImage(ctx: CanvasRenderingContext2D, el: ImageElement, w: number, h: number, dpi: number, media: MediaResolver, issues: RenderIssue[]): Promise<void> {
  let bmp = await media(el.media, el);
  if (!bmp) {
    issues.push({ elementId: el.id, type: "missing-media", message: `${mediaLabel(el.media)} not found` });
    return;
  }
  if (el.cleanSignature) bmp = cleanInk(bmp);
  const mm = pxPerMm(dpi);
  const { w: iw, h: ih } = bitmapSize(bmp);
  const shape = el.shape;
  const box = shape === "circle" || shape === "square" ? Math.min(w, h) : 0;
  const bx = box ? (w - box) / 2 : 0, by = box ? (h - box) / 2 : 0;
  const bw = box || w, bh = box || h;
  const scale = el.fit === "cover" ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
  const dw = iw * scale, dh = ih * scale;
  // cover: keep the top of portraits (heads) rather than the exact centre
  const dx = bx + (bw - dw) / 2;
  const dy = by + (el.fit === "cover" && el.media === "photo" ? Math.min(0, (bh - dh) * 0.2) : (bh - dh) / 2);
  ctx.save();
  if (el.shadow.on) {
    ctx.save();
    ctx.shadowColor = el.shadow.color;
    ctx.shadowBlur = el.shadow.blur * mm;
    ctx.shadowOffsetY = el.shadow.blur * mm * 0.35;
    shapePath(ctx, shape, 0, 0, w, h, el.radius * mm);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  shapePath(ctx, shape, 0, 0, w, h, el.radius * mm);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, dx, dy, dw, dh);
  ctx.restore();
  if (el.border.width > 0) {
    shapePath(ctx, shape, 0, 0, w, h, el.radius * mm);
    ctx.lineWidth = el.border.width * mm;
    ctx.strokeStyle = el.border.color;
    ctx.stroke();
  }
  ctx.restore();
}

export function mediaLabel(kind: MediaKind): string {
  return { photo: "Photo", parentSign: "Parent signature", principalSign: "Principal signature", thumb: "Thumb impression", logo: "School logo" }[kind];
}

export function qrText(el: QrElement, row: Row, roles: Record<string, string>): string {
  const v = (role: string) => roleValue(row, roles, role);
  switch (el.content) {
    case "biodata":
      return el.columns.filter((c) => (row[c] ?? "").trim()).map((c) => `${c}: ${row[c].trim()}`).join("\n");
    case "vcard": {
      const name = v("name");
      const phone = (v("emergency") || v("phone")).replace(/[^\d+]/g, "");
      const note = [v("class") || v("classSection"), v("section"), v("blood") && `Blood: ${v("blood")}`, v("admission") && `ID: ${v("admission")}`].filter(Boolean).join(" | ");
      return ["BEGIN:VCARD", "VERSION:3.0", `N:${name}`, `FN:${name}`, phone && `TEL;TYPE=CELL:${phone}`, v("address") && `ADR:;;${v("address")}`, note && `NOTE:${note}`, "END:VCARD"].filter(Boolean).join("\n");
    }
    case "url":
      return el.urlTemplate.replace(/\{([^}]+)\}/g, (_m, col: string) => encodeURIComponent((row[col.trim()] ?? "").trim()));
    case "tel": {
      const digits = (row[el.column] ?? "").replace(/[^\d+]/g, "");
      return digits ? `tel:${digits}` : "";
    }
    default:
      return (row[el.column] ?? "").trim();
  }
}

async function drawQr(ctx: CanvasRenderingContext2D, el: QrElement, row: Row, layout: Layout, w: number, h: number, media: MediaResolver, issues: RenderIssue[]): Promise<void> {
  const text = qrText(el, row, layout.roles);
  if (!text) {
    if (el.required) issues.push({ elementId: el.id, type: "empty", message: "QR code has no data" });
    return;
  }
  let matrix: boolean[][];
  try {
    matrix = encodeQr(text, el.logo ? "H" : el.ecc);
  } catch (e) {
    issues.push({ elementId: el.id, type: "qr", message: e instanceof Error ? e.message : "QR error" });
    return;
  }
  const size = Math.min(w, h);
  const n = matrix.length;
  const quiet = 1; // modules of quiet zone inside the box
  const cell = size / (n + quiet * 2);
  const ox = (w - size) / 2 + cell * quiet, oy = (h - size) / 2 + cell * quiet;
  ctx.fillStyle = el.background;
  ctx.fillRect((w - size) / 2, (h - size) / 2, size, size);
  ctx.fillStyle = el.color;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (matrix[y][x]) ctx.fillRect(ox + x * cell, oy + y * cell, cell + 0.35, cell + 0.35);
  }
  if (el.logo) {
    const logo = await media("logo", { ...el, kind: "image" } as unknown as ImageElement);
    if (logo) {
      const ls = size * 0.22;
      const lx = (w - ls) / 2, ly = (h - ls) / 2;
      ctx.fillStyle = el.background;
      ctx.beginPath();
      ctx.roundRect(lx - cell, ly - cell, ls + cell * 2, ls + cell * 2, cell * 1.5);
      ctx.fill();
      const { w: iw, h: ih } = bitmapSize(logo);
      const s = Math.min(ls / iw, ls / ih);
      ctx.drawImage(logo, lx + (ls - iw * s) / 2, ly + (ls - ih * s) / 2, iw * s, ih * s);
    }
  }
}

function drawBarcode(ctx: CanvasRenderingContext2D, el: BarcodeElement, row: Row, w: number, h: number, issues: RenderIssue[]): void {
  const raw = (row[el.column] ?? "").trim();
  if (!raw) {
    if (el.required) issues.push({ elementId: el.id, type: "empty", message: `${el.column || "Barcode"} is empty` });
    return;
  }
  let code;
  try {
    code = encodeBarcode(el.format, raw);
  } catch (e) {
    issues.push({ elementId: el.id, type: "barcode", message: e instanceof Error ? e.message : "Barcode error" });
    return;
  }
  ctx.fillStyle = el.background;
  ctx.fillRect(0, 0, w, h);
  const textH = el.showText ? h * 0.24 : 0;
  const quiet = 6; // modules each side
  const module = w / (code.modules.length + quiet * 2);
  ctx.fillStyle = el.color;
  let x = 0;
  while (x < code.modules.length) {
    if (code.modules[x] === "1") {
      let run = 1;
      while (code.modules[x + run] === "1") run++;
      ctx.fillRect((quiet + x) * module, 0, run * module, h - textH);
      x += run;
    } else x++;
  }
  if (el.showText) {
    ctx.font = `600 ${(textH * 0.8).toFixed(2)}px "Roboto Mono", "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(code.text, w / 2, h - textH / 2);
  }
}

/** Draws one side of one card onto `canvas` at `dpi`. Returns problems found while drawing. */
export async function renderCard(canvas: HTMLCanvasElement, input: RenderInput, elementsFilter?: (el: CardElement) => boolean): Promise<RenderIssue[]> {
  const { layout, side, row, dpi } = input;
  const mm = pxPerMm(dpi);
  const W = Math.round(layout.card.w * mm), H = Math.round(layout.card.h * mm);
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = input.blankColor ?? "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (input.template) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(input.template, 0, 0, W, H);
  }
  const issues: RenderIssue[] = [];
  for (const el of layout.elements) {
    if (el.side !== side || (elementsFilter && !elementsFilter(el))) continue;
    const w = el.w * mm, h = el.h * mm;
    ctx.save();
    ctx.translate((el.x + el.w / 2) * mm, (el.y + el.h / 2) * mm);
    if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    try {
      if (el.kind === "text") drawText(ctx, el, row, w, h, dpi, issues);
      else if (el.kind === "image") await drawImage(ctx, el, w, h, dpi, input.media, issues);
      else if (el.kind === "qr") await drawQr(ctx, el, row, layout, w, h, input.media, issues);
      else drawBarcode(ctx, el, row, w, h, issues);
    } finally {
      ctx.restore();
    }
  }
  return issues;
}

/** Canvas → Blob (JPEG for PDFs, PNG for files). */
export function canvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality));
}
