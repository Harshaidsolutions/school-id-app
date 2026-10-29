import type { CardSize, SheetSize } from "./types";

export const CARD_SIZES: CardSize[] = [
  { key: "cr80-v", label: "CR80 standard – vertical (54 × 85.6 mm)", w: 54, h: 85.6 },
  { key: "cr80-h", label: "CR80 standard – horizontal (85.6 × 54 mm)", w: 85.6, h: 54 },
  { key: "cr79-v", label: "CR79 – vertical (51 × 84 mm)", w: 51, h: 84 },
  { key: "a7-v", label: "Large badge A7 – vertical (74 × 105 mm)", w: 74, h: 105 },
  { key: "badge-v", label: "Large badge 3 × 4 in – vertical (76.2 × 101.6 mm)", w: 76.2, h: 101.6 },
  { key: "badge-h", label: "Large badge 4 × 3 in – horizontal (101.6 × 76.2 mm)", w: 101.6, h: 76.2 },
];

export const SHEET_SIZES: SheetSize[] = [
  { key: "a4", label: "A4 (210 × 297 mm)", w: 210, h: 297 },
  { key: "a3", label: "A3 (297 × 420 mm)", w: 297, h: 420 },
  { key: "12x18", label: "12 × 18 in press sheet", w: 304.8, h: 457.2 },
  { key: "13x19", label: "13 × 19 in press sheet", w: 330.2, h: 482.6 },
  { key: "letter", label: "Letter (8.5 × 11 in)", w: 215.9, h: 279.4 },
];

export type ImposeOptions = {
  sheet: SheetSize;
  card: { w: number; h: number };
  margin: number; // mm, room for crop marks
  gap: number; // mm between cards
  perSheet: number; // 0 = as many as fit
  allowRotate: boolean; // turn cards 90° on the sheet when more fit
};

export type Imposition = {
  cols: number;
  rows: number;
  rotated: boolean; // card placed turned 90° clockwise
  cellW: number; // size the card occupies on the sheet (after rotation)
  cellH: number;
  slots: { x: number; y: number }[]; // top-left of each card, in order
  capacity: number;
};

function fit(len: number, cell: number, gap: number): number {
  return Math.max(0, Math.floor((len + gap + 1e-6) / (cell + gap)));
}

export function impose(o: ImposeOptions): Imposition {
  const usableW = o.sheet.w - 2 * o.margin;
  const usableH = o.sheet.h - 2 * o.margin;
  const options = [false, ...(o.allowRotate ? [true] : [])].map((rotated) => {
    const cw = rotated ? o.card.h : o.card.w;
    const ch = rotated ? o.card.w : o.card.h;
    const cols = fit(usableW, cw, o.gap);
    const rows = fit(usableH, ch, o.gap);
    return { rotated, cw, ch, cols, rows, n: cols * rows };
  });
  const best = options.reduce((a, b) => (b.n > a.n ? b : a));
  if (best.n === 0) {
    return { cols: 0, rows: 0, rotated: false, cellW: o.card.w, cellH: o.card.h, slots: [], capacity: 0 };
  }
  const want = o.perSheet > 0 ? Math.min(o.perSheet, best.n) : best.n;
  // Smallest block that holds `want` cards: keep full columns, trim rows
  const cols = Math.min(best.cols, want);
  const rows = Math.ceil(want / cols);
  const blockW = cols * best.cw + (cols - 1) * o.gap;
  const blockH = rows * best.ch + (rows - 1) * o.gap;
  const x0 = (o.sheet.w - blockW) / 2;
  const y0 = (o.sheet.h - blockH) / 2;
  const slots: { x: number; y: number }[] = [];
  for (let r = 0; r < rows && slots.length < want; r++) {
    for (let c = 0; c < cols && slots.length < want; c++) {
      slots.push({ x: x0 + c * (best.cw + o.gap), y: y0 + r * (best.ch + o.gap) });
    }
  }
  return { cols, rows, rotated: best.rotated, cellW: best.cw, cellH: best.ch, slots, capacity: want };
}

/** Back-side slot for duplex: mirrored left↔right so each back lands behind its front. */
export function mirrorSlot(slot: { x: number; y: number }, cellW: number, sheetW: number, offsetX = 0, offsetY = 0) {
  return { x: sheetW - slot.x - cellW + offsetX, y: slot.y + offsetY };
}

/** Crop-mark line segments (in the sheet margin) at every cut position of the block. */
export function cropMarks(imp: Imposition, sheet: { w: number; h: number }, length = 5, offset = 1.5) {
  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const s of imp.slots) {
    xs.add(+s.x.toFixed(3)); xs.add(+(s.x + imp.cellW).toFixed(3));
    ys.add(+s.y.toFixed(3)); ys.add(+(s.y + imp.cellH).toFixed(3));
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const x of xs) {
    lines.push({ x1: x, y1: Math.max(0, minY - offset - length), x2: x, y2: minY - offset });
    lines.push({ x1: x, y1: maxY + offset, x2: x, y2: Math.min(sheet.h, maxY + offset + length) });
  }
  for (const y of ys) {
    lines.push({ x1: Math.max(0, minX - offset - length), y1: y, x2: minX - offset, y2: y });
    lines.push({ x1: maxX + offset, y1: y, x2: Math.min(sheet.w, maxX + offset + length), y2: y });
  }
  return { lines, xs: [...xs], ys: [...ys], bounds: { minX, maxX, minY, maxY } };
}
