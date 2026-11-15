import { readZip } from "@gen/zip";
import type { Row } from "@gen/types";

export type Sheet = { columns: string[]; rows: Row[] };

const isCsv = (file: File) => /\.csv$/i.test(file.name) || file.type === "text/csv";
const checkXls = (file: File) => {
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV.");
};

/** Names of the worksheets in an .xlsx file (a CSV has one: "Sheet1"). */
export async function listSheets(file: File): Promise<string[]> {
  if (isCsv(file)) return ["Sheet1"];
  checkXls(file);
  return (await workbookSheets(file)).map((s) => s.name);
}

/** Reads one worksheet (by name; the first one when not given) of an .xlsx file, or a .csv file — fully offline. */
export async function readSheet(file: File, sheetName?: string): Promise<Sheet> {
  if (isCsv(file)) return tableToSheet(parseCsv(await file.text()));
  checkXls(file);
  return tableToSheet(await parseXlsx(file, sheetName));
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

type Book = { get: (name: string) => Promise<string | null> };
async function openBook(file: Blob): Promise<Book> {
  const entries = await readZip(file);
  return {
    get: async (name: string) => {
      const e = entries.find((x) => x.name.replace(/^\/+/, "").toLowerCase() === name.toLowerCase());
      return e ? await (await e.read()).text() : null;
    },
  };
}

/** Every worksheet with its file inside the workbook, in Excel's tab order. */
async function workbookSheets(file: Blob, book?: Book): Promise<{ name: string; path: string }[]> {
  const b = book ?? (await openBook(file));
  const workbook = await b.get("xl/workbook.xml");
  if (!workbook) throw new Error("This file is not an Excel workbook (.xlsx).");
  const rels = await b.get("xl/_rels/workbook.xml.rels");
  const relList = rels ? byLocal(xml(rels), "Relationship") : [];
  return byLocal(xml(workbook), "sheet").map((sh, i) => {
    const relId = sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sh.getAttribute("r:id");
    const target = relList.find((r) => r.getAttribute("Id") === relId)?.getAttribute("Target");
    const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`) : `xl/worksheets/sheet${i + 1}.xml`;
    return { name: sh.getAttribute("name") ?? `Sheet${i + 1}`, path };
  });
}

export async function parseXlsx(file: Blob, sheetName?: string): Promise<string[][]> {
  const book = await openBook(file);
  const get = book.get;
  const sheets = await workbookSheets(file, book);
  if (!sheets.length) throw new Error("This workbook has no worksheets.");
  const chosen = (sheetName && sheets.find((s) => s.name === sheetName)) || sheets[0];
  const sheetPath = chosen.path;
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
  if (!sheetXml) throw new Error(`The worksheet “${chosen.name}” could not be read.`);
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
