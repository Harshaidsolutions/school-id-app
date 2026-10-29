import { readZip } from "./zip";
import type { MediaKind, MediaStore, Row } from "./types";

/**
 * Bulk media intake: one ZIP or one folder holding photos, parent signatures, the principal's
 * signature and thumb impressions. Files are classified by folder or file name and matched to
 * rows by admission number / name — case, extension (.jpg/.JPG/.jpeg/.png) and spacing ignored.
 */
const IMAGE_EXT = /\.(jpe?g|png|webp|bmp|gif|heic|heif|tiff?)$/i;

export type IncomingFile = { path: string; blob: Blob };

export function emptyMedia(): MediaStore {
  return { photo: new Map(), parentSign: new Map(), thumb: new Map(), principalSign: null, logo: null };
}

/** Matching key: lower case, no extension, no spaces/punctuation, leading zeros kept (exact) */
export function mediaKey(value: string): string {
  return value
    .replace(IMAGE_EXT, "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\s_\-.()[\]{}#/\\]+/g, "");
}

/** Second-chance key: digits without leading zeros (e.g. "00123" ↔ "123") */
function looseKey(value: string): string {
  const k = mediaKey(value);
  return /^\d+$/.test(k) ? String(Number(k)) : k;
}

const KIND_WORDS: { kind: Exclude<MediaKind, "photo">; words: RegExp }[] = [
  { kind: "principalSign", words: /(principal|headmaster|head[\s_-]*master|\bhm\b|correspondent|director|authori[sz]ed|auth[\s_-]*sign)/i },
  { kind: "parentSign", words: /(parent|father|mother|guardian|signature|sign\b|signs\b|sig\b|_sign|-sign|\bsign)/i },
  { kind: "thumb", words: /(thumb|finger|impression|\bltm\b|\brtm\b)/i },
  { kind: "logo", words: /(logo|emblem|crest)/i },
];

export function classify(path: string): MediaKind {
  const parts = path.split(/[\\/]/);
  const folders = parts.slice(0, -1).join("/");
  const file = parts[parts.length - 1];
  for (const { kind, words } of KIND_WORDS) if (words.test(folders)) return kind;
  for (const { kind, words } of KIND_WORDS) if (words.test(file)) return kind;
  return "photo";
}

/** File name without type words, so "123_sign.jpg" matches row 123 */
function stripKindWords(file: string): string {
  return file
    .replace(IMAGE_EXT, "")
    .replace(/[\s_-]*(photo|pic|image|img|parent|father|mother|guardian|signature|sign|sig|thumb|impression|finger)[\s_-]*/gi, " ")
    .trim();
}

export async function filesFromZip(file: Blob): Promise<IncomingFile[]> {
  const entries = await readZip(file);
  const out: IncomingFile[] = [];
  for (const e of entries) {
    const base = e.name.split("/").pop() ?? e.name;
    if (!IMAGE_EXT.test(base) || base.startsWith(".") || e.name.includes("__MACOSX")) continue;
    out.push({ path: e.name, blob: await e.read() });
  }
  return out;
}

export function filesFromInput(list: FileList | File[]): IncomingFile[] {
  return Array.from(list)
    .filter((f) => IMAGE_EXT.test(f.name) && !f.name.startsWith("."))
    .map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, blob: f }));
}

export type IntakeSummary = { photos: number; parentSigns: number; thumbs: number; principal: boolean; logo: boolean; skipped: string[] };

/** Adds files into the store. A single principal signature / logo applies to every card. */
export function addToStore(store: MediaStore, files: IncomingFile[], forceKind?: MediaKind): IntakeSummary {
  const summary: IntakeSummary = { photos: 0, parentSigns: 0, thumbs: 0, principal: false, logo: false, skipped: [] };
  for (const f of files) {
    const kind = forceKind ?? classify(f.path);
    const name = f.path.split(/[\\/]/).pop() ?? f.path;
    const key = mediaKey(kind === "photo" ? name : stripKindWords(name));
    if (kind === "principalSign") { store.principalSign = f.blob; summary.principal = true; continue; }
    if (kind === "logo") { store.logo = f.blob; summary.logo = true; continue; }
    if (!key) { summary.skipped.push(f.path); continue; }
    const map = kind === "parentSign" ? store.parentSign : kind === "thumb" ? store.thumb : store.photo;
    map.set(key, f.blob);
    if (kind === "parentSign") summary.parentSigns++;
    else if (kind === "thumb") summary.thumbs++;
    else summary.photos++;
  }
  return summary;
}

const looseIndex = new WeakMap<Map<string, Blob>, { size: number; index: Map<string, Blob> }>();
function looseLookup(map: Map<string, Blob>, key: string): Blob | undefined {
  let cached = looseIndex.get(map);
  if (!cached || cached.size !== map.size) {
    const index = new Map<string, Blob>();
    for (const [k, blob] of map) if (!index.has(looseKey(k))) index.set(looseKey(k), blob);
    cached = { size: map.size, index };
    looseIndex.set(map, cached);
  }
  return cached.index.get(key);
}

/** Finds the blob for a row: exact key, then leading-zero-insensitive key. */
export function findMedia(map: Map<string, Blob>, row: Row, matchColumn: string, rowIndex: number, matchBy: "column" | "rownumber"): Blob | undefined {
  const raw = matchBy === "rownumber" ? String(rowIndex + 1) : (row[matchColumn] ?? "");
  if (!raw.trim()) return undefined;
  return map.get(mediaKey(raw)) ?? looseLookup(map, looseKey(raw));
}
