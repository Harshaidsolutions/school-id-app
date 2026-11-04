import { CARD_SIZES } from "./impose";
import type { BarcodeElement, CardElement, ImageElement, Layout, MediaKind, QrElement, Side, TextElement } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newText(side: Side, column: string, at: Partial<TextElement> = {}): TextElement {
  return {
    // Defaults asked for by the admin: Arial 8 pt black, at X 18 mm, Y 55 mm, 30 × 3.5 mm.
    id: uid(), kind: "text", side, x: 18, y: 55, w: 30, h: 3.5, rotation: 0, required: Boolean(column),
    column, prefix: "", suffix: "", staticText: column ? "" : "Text",
    font: "Arial", weight: 400, italic: false, underline: false, size: 8, minSize: 4, autoShrink: true, multiline: false,
    textCase: "none", align: "left", vAlign: "middle", letterSpacing: 0, lineHeight: 1.15,
    color: "#000000", gradient: { on: false, color2: "#F43F5E", angle: 0 }, stroke: { width: 0, color: "#ffffff" },
    ...at,
  };
}

export function newImage(side: Side, media: MediaKind, at: Partial<ImageElement> = {}): ImageElement {
  const sign = media !== "photo" && media !== "logo";
  return {
    id: uid(), kind: "image", side, media, rotation: 0, required: media === "photo",
    // Photo default: X 15 mm, Y 22 mm, 25 × 30 mm.
    x: sign ? 30 : 15, y: sign ? 74 : 22, w: sign ? 20 : 25, h: sign ? 8 : 30,
    fit: sign || media === "logo" ? "contain" : "cover", shape: "rect", radius: 0,
    border: { width: 0, color: "#4F46E5" }, shadow: { on: false, blur: 1.5, color: "rgba(30,27,75,0.35)" },
    cleanSignature: sign,
    ...at,
  };
}

export function newQr(side: Side, column: string, at: Partial<QrElement> = {}): QrElement {
  return {
    id: uid(), kind: "qr", side, x: 37, y: 66, w: 14, h: 14, rotation: 0, required: true,
    content: column ? "column" : "vcard", column, columns: [], urlTemplate: "https://myschoolidcard.in/verify?id={" + (column || "Admission No") + "}",
    ecc: "M", logo: false, color: "#1E1B4B", background: "#ffffff",
    ...at,
  };
}

export function newBarcode(side: Side, column: string, at: Partial<BarcodeElement> = {}): BarcodeElement {
  return {
    id: uid(), kind: "barcode", side, x: 6, y: 74, w: 42, h: 9, rotation: 0, required: true,
    format: "code128", column, showText: true, color: "#1E1B4B", background: "#ffffff",
    ...at,
  };
}

/** Starting layout for a vertical CR80 card, bound to whatever columns were detected. */
export function defaultLayout(roles: Record<string, string>, matchColumn = ""): Layout {
  const card = CARD_SIZES[0];
  const elements: CardElement[] = [newImage("front", "photo", { x: 15, y: 18, w: 24, h: 30, border: { width: 0.5, color: "#4F46E5" } })];
  let y = 50;
  const line = (role: string, prefix: string, extra: Partial<TextElement> = {}) => {
    const col = roles[role];
    if (!col) return;
    elements.push(newText("front", col, { y, prefix, ...extra }));
    y += (extra.h ?? 5.5) + 0.6;
  };
  line("name", "", { align: "center", weight: 700, size: 11, h: 7, textCase: "upper", x: 3, w: 48 });
  line("classSection", "Class : ");
  if (!roles.classSection) line("class", "Class : ");
  line("father", "Father : ");
  line("admission", "Adm No : ");
  line("phone", "Ph : ");
  if (roles.address) elements.push(newText("back", roles.address, { x: 5, y: 12, w: 44, h: 16, multiline: true, size: 8, prefix: "Address: " }));
  if (roles.admission) elements.push(newQr("back", roles.admission, { x: 17, y: 34, w: 20, h: 20 }));
  return {
    kind: "id-bulk-v2",
    name: "My ID card layout",
    card,
    elements,
    matchColumn: matchColumn || roles.admission || roles.roll || roles.name || "",
    matchBy: "column",
    roles,
    photo: { removeBg: false, bg: "#ffffff", face: true, enhance: true },
  };
}

/** Completely blank white card (front + back): nothing until the admin adds it. */
export function blankLayout(roles: Record<string, string> = {}, matchColumn = "Photo ID"): Layout {
  return {
    kind: "id-bulk-v2",
    name: "My ID card layout",
    card: CARD_SIZES[0],
    elements: [],
    matchColumn,
    matchBy: "column",
    roles,
    photo: { removeBg: false, bg: "#ffffff", face: true, enhance: true },
  };
}

export function isLayout(v: unknown): v is Layout {
  const l = v as Layout | null;
  return Boolean(l && l.kind === "id-bulk-v2" && l.card && Array.isArray(l.elements));
}

/**
 * Older designs put the column name in front of each value ("Name: Ravi").
 * Fields now show only the value: drop a prefix that is just "<column>:".
 */
export function stripColumnLabels(layout: Layout): Layout {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
  return {
    ...layout,
    elements: layout.elements.map((e) => {
      if (e.kind !== "text" || !e.column || !e.prefix) return e;
      const p = e.prefix.trim();
      return p.endsWith(":") && norm(p.slice(0, -1)) === norm(e.column) ? { ...e, prefix: "" } : e;
    }),
  };
}
