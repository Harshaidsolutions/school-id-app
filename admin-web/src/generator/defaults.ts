import { CARD_SIZES } from "./impose";
import type { BarcodeElement, CardElement, ImageElement, Layout, MediaKind, QrElement, Side, TextElement } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function newText(side: Side, column: string, at: Partial<TextElement> = {}): TextElement {
  return {
    id: uid(), kind: "text", side, x: 4, y: 50, w: 46, h: 6, rotation: 0, required: Boolean(column),
    column, prefix: "", suffix: "", staticText: column ? "" : "Text",
    font: "Poppins", weight: 500, italic: false, underline: false, size: 9, minSize: 5, autoShrink: true, multiline: false,
    textCase: "none", align: "left", vAlign: "middle", letterSpacing: 0, lineHeight: 1.15,
    color: "#17462e", gradient: { on: false, color2: "#f7941d", angle: 0 }, stroke: { width: 0, color: "#ffffff" },
    ...at,
  };
}

export function newImage(side: Side, media: MediaKind, at: Partial<ImageElement> = {}): ImageElement {
  const sign = media !== "photo" && media !== "logo";
  return {
    id: uid(), kind: "image", side, media, rotation: 0, required: media === "photo",
    x: sign ? 30 : 15, y: sign ? 74 : 14, w: sign ? 20 : 24, h: sign ? 8 : 30,
    fit: sign || media === "logo" ? "contain" : "cover", shape: "rounded", radius: 2,
    border: { width: media === "photo" ? 0.4 : 0, color: "#16a34a" }, shadow: { on: false, blur: 1.5, color: "rgba(23,70,46,0.35)" },
    cleanSignature: sign,
    ...at,
  };
}

export function newQr(side: Side, column: string, at: Partial<QrElement> = {}): QrElement {
  return {
    id: uid(), kind: "qr", side, x: 37, y: 66, w: 14, h: 14, rotation: 0, required: true,
    content: column ? "column" : "vcard", column, columns: [], urlTemplate: "https://myschoolidcard.in/verify?id={" + (column || "Admission No") + "}",
    ecc: "M", logo: false, color: "#0f3d26", background: "#ffffff",
    ...at,
  };
}

export function newBarcode(side: Side, column: string, at: Partial<BarcodeElement> = {}): BarcodeElement {
  return {
    id: uid(), kind: "barcode", side, x: 6, y: 74, w: 42, h: 9, rotation: 0, required: true,
    format: "code128", column, showText: true, color: "#0f3d26", background: "#ffffff",
    ...at,
  };
}

/** Starting layout for a vertical CR80 card, bound to whatever columns were detected. */
export function defaultLayout(roles: Record<string, string>, matchColumn = ""): Layout {
  const card = CARD_SIZES[0];
  const elements: CardElement[] = [newImage("front", "photo", { x: 15, y: 18, w: 24, h: 30, border: { width: 0.5, color: "#16a34a" } })];
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

export function isLayout(v: unknown): v is Layout {
  const l = v as Layout | null;
  return Boolean(l && l.kind === "id-bulk-v2" && l.card && Array.isArray(l.elements));
}
