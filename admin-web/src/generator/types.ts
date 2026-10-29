import type { BarcodeFormat } from "./barcode";
import type { QrEcc } from "./qr";

export type Row = Record<string, string>;
export type Side = "front" | "back";

export type TextCase = "none" | "upper" | "lower" | "title" | "sentence";
export type PhotoShape =
  | "rect" | "rounded" | "square" | "circle" | "oval" | "arch"
  | "hexagon" | "octagon" | "pentagon" | "diamond" | "shield" | "star";

/** Which uploaded media an image element shows. */
export type MediaKind = "photo" | "parentSign" | "principalSign" | "thumb" | "logo";

type Base = {
  id: string;
  side: Side;
  x: number; // mm from the card's left edge
  y: number; // mm from the card's top edge
  w: number;
  h: number;
  rotation: number; // degrees, clockwise
  required: boolean; // pre-flight flags rows where this is empty
};

export type TextElement = Base & {
  kind: "text";
  column: string; // "" = static text only
  prefix: string;
  suffix: string;
  staticText: string;
  font: string;
  weight: 400 | 500 | 600 | 700 | 800;
  italic: boolean;
  underline: boolean;
  size: number; // pt
  minSize: number; // pt, used by auto-shrink
  autoShrink: boolean;
  multiline: boolean;
  textCase: TextCase;
  align: "left" | "center" | "right";
  vAlign: "top" | "middle" | "bottom";
  letterSpacing: number; // in 1/1000 em (kerning/tracking)
  lineHeight: number; // multiple of the font size
  color: string;
  gradient: { on: boolean; color2: string; angle: number };
  stroke: { width: number; color: string }; // width in pt, 0 = none
};

export type ImageElement = Base & {
  kind: "image";
  media: MediaKind;
  fit: "cover" | "contain";
  shape: PhotoShape;
  radius: number; // mm, for "rounded"
  border: { width: number; color: string }; // mm
  shadow: { on: boolean; blur: number; color: string };
  cleanSignature: boolean; // remove paper background from signatures/thumbs
};

export type QrContent = "column" | "biodata" | "vcard" | "url" | "tel";
export type QrElement = Base & {
  kind: "qr";
  content: QrContent;
  column: string;
  columns: string[]; // biodata fields
  urlTemplate: string; // e.g. https://school.in/verify?id={Admission No}
  ecc: QrEcc;
  logo: boolean; // school logo in the centre
  color: string;
  background: string;
};

export type BarcodeElement = Base & {
  kind: "barcode";
  format: BarcodeFormat;
  column: string;
  showText: boolean;
  color: string;
  background: string;
};

export type CardElement = TextElement | ImageElement | QrElement | BarcodeElement;

export type CardSize = { key: string; label: string; w: number; h: number };

export type Layout = {
  kind: "id-bulk-v2";
  name: string;
  card: CardSize;
  elements: CardElement[];
  frontTemplateId?: string;
  backTemplateId?: string;
  matchColumn: string; // column used to match photo / signature file names
  matchBy: "column" | "rownumber";
  roles: Record<string, string>; // smart mapping: role -> column
  photo: { removeBg: boolean; bg: string; face: boolean; enhance: boolean };
};

export type MediaStore = {
  photo: Map<string, Blob>;
  parentSign: Map<string, Blob>;
  thumb: Map<string, Blob>;
  principalSign: Blob | null;
  logo: Blob | null;
};

export type SheetSize = { key: string; label: string; w: number; h: number };
