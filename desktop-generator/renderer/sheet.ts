import { readZip } from "@gen/zip";
import type { Row } from "@gen/types";

export type Sheet = { columns: string[]; rows: Row[] };

/** Reads the first sheet of an .xlsx file, or a .csv file — fully offline. */
export async function readSheet(file: File): Promise<Sheet> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return tableToSheet(parseCsv(await file.text()));
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV.");
  return tableToSheet(await parseXlsx(file));
}

/* ---------- CSV ---------- */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split(/\r?\n/)[0].match(/;/g)?.length ?? 0) > (src.split(/\r?\n/)[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out;
}

/* ---------- XLSX (Office Open XML) ---------- */
const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
const byLocal = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS("*", name));

function colIndex(ref: string): number {
  const letters = ref.replace(/[0-9]/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);
function excelDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  const dd = String(d.getUTCDate()).padStart(2, "0"), mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

export async function parseXlsx(file: Blob): Promise<string[][]> {
  const entries = await readZip(file);
  const get = async (name: string) => {
    const e = entries.find((x) => x.name.replace(/^\/+/, "").toLowerCase() === name.toLowerCase());
    return e ? await (await e.read()).text() : null;
  };
  const workbook = await get("xl/workbook.xml");
  if (!workbook) throw new Error("This file is not an Excel workbook (.xlsx).");
  const firstSheet = byLocal(xml(workbook), "sheet")[0];
  const relId = firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? firstSheet?.getAttribute("r:id");
  let sheetPath = "xl/worksheets/sheet1.xml";
  const rels = await get("xl/_rels/workbook.xml.rels");
  if (rels && relId) {
    const rel = byLocal(xml(rels), "Relationship").find((r) => r.getAttribute("Id") === relId);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const shared: string[] = [];
  const ss = await get("xl/sharedStrings.xml");
  if (ss) for (const si of byLocal(xml(ss), "si")) shared.push(byLocal(si, "t").map((t) => t.textContent ?? "").join(""));

  // Which cell styles are dates?
  const dateStyles = new Set<number>();
  const styles = await get("xl/styles.xml");
  if (styles) {
    const doc = xml(styles);
    const customDate = new Set(byLocal(doc, "numFmt").filter((f) => /[dmy]/i.test((f.getAttribute("formatCode") ?? "").replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, ""))).map((f) => Number(f.getAttribute("numFmtId"))));
    const cellXfs = byLocal(doc, "cellXfs")[0];
    if (cellXfs) Array.from(cellXfs.children).forEach((xf, i) => {
      const id = Number(xf.getAttribute("numFmtId"));
      if (DATE_FORMAT_IDS.has(id) || customDate.has(id)) dateStyles.add(i);
    });
  }

  const sheetXml = await get(sheetPath);
  if (!sheetXml) throw new Error("The first sheet of the workbook could not be read.");
  const table: string[][] = [];
  for (const r of byLocal(xml(sheetXml), "row")) {
    const ri = Number(r.getAttribute("r") ?? table.length + 1) - 1;
    const line: string[] = (table[ri] = table[ri] ?? []);
    let auto = 0;
    for (const c of byLocal(r, "c")) {
      const ref = c.getAttribute("r");
      const ci = ref ? colIndex(ref) : auto;
      auto = ci + 1;
      const t = c.getAttribute("t");
      const v = byLocal(c, "v")[0]?.textContent ?? "";
      let value = "";
      if (t === "s") value = shared[Number(v)] ?? "";
      else if (t === "inlineStr") value = byLocal(c, "t").map((x) => x.textContent ?? "").join("");
      else if (t === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (t === "str" || t === "e") value = v;
      else if (v !== "") {
        const num = Number(v);
        const s = Number(c.getAttribute("s") ?? -1);
        value = dateStyles.has(s) && num > 0 && num < 100000 ? excelDate(num) : Number.isInteger(num) ? String(num) : String(Number(num.toPrecision(12)));
      }
      line[ci] = value;
    }
  }
  return Array.from(table, (r) => Array.from(r ?? [], (x) => x ?? ""));
}

/* ---------- table → rows ---------- */
export function tableToSheet(table: string[][]): Sheet {
  const nonEmpty = table.filter((r) => r.some((c) => String(c ?? "").trim()));
  if (!nonEmpty.length) throw new Error("The sheet is empty.");
  const header = nonEmpty[0].map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const seen = new Map<string, number>();
  const columns = header.map((h) => { const n = (seen.get(h) ?? 0) + 1; seen.set(h, n); return n > 1 ? `${h} (${n})` : h; });
  const rows = nonEmpty.slice(1).map((r) => {
    const row: Row = {};
    columns.forEach((c, i) => (row[c] = String(r[i] ?? "").trim()));
    return row;
  });
  return { columns, rows };
}
