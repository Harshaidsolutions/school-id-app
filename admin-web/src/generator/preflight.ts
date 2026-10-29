import { encodeBarcode } from "./barcode";
import { roleValue } from "./columns";
import { mediaKey } from "./media";
import { fitText, mediaLabel, qrText, textValue } from "./render";
import type { Layout, MediaKind, Row } from "./types";

/**
 * Pre-flight checker: finds every problem before anything is printed —
 * missing photos/signatures, empty required fields, bad phone numbers / blood groups,
 * special characters, text that will not fit, invalid barcodes, and duplicate records.
 */
export type Severity = "error" | "warning";
export type Finding = { row: number; severity: Severity; field: string; message: string };
export type PreflightReport = {
  findings: Finding[];
  rowsWithErrors: Set<number>;
  rowsWithWarnings: Set<number>;
  duplicates: { key: string; rows: number[]; by: string }[];
  counts: Record<string, number>;
};

const NAME_OK = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’-]*$/u;
const BLOOD_OK = /^(a|b|ab|o)\s*(\+|-|\+ve|-ve|positive|negative|pos|neg)$/i;

export function runPreflight(
  rows: Row[],
  layout: Layout,
  hasMedia: (kind: MediaKind, row: Row, index: number) => boolean,
): PreflightReport {
  const findings: Finding[] = [];
  const add = (row: number, severity: Severity, field: string, message: string) => findings.push({ row, severity, field, message });
  const measure = document.createElement("canvas").getContext("2d")!;
  const mediaKinds = new Set(layout.elements.filter((e) => e.kind === "image").map((e) => (e as { media: MediaKind }).media));
  const nameCol = layout.roles.name;
  const phoneCols = [layout.roles.phone, layout.roles.emergency].filter(Boolean) as string[];
  const bloodCol = layout.roles.blood;

  rows.forEach((row, i) => {
    for (const kind of mediaKinds) {
      if (!hasMedia(kind, row, i)) add(i, "error", mediaLabel(kind), `${mediaLabel(kind)} missing`);
    }
    for (const el of layout.elements) {
      if (el.kind === "text") {
        const text = textValue(el, row);
        if (el.column && !text && el.required) add(i, "error", el.column, `${el.column} is empty`);
        if (text) {
          const f = fitText(measure, el, text, el.w * (300 / 25.4), el.h * (300 / 25.4), 300);
          if (f.overflow) add(i, "warning", el.column || "Text", `Too long to fit even at ${el.minSize} pt: "${text.slice(0, 40)}"`);
        }
        if (text && /[�]|Ã|â€/.test(text)) add(i, "error", el.column || "Text", "Broken characters (wrong file encoding)");
      } else if (el.kind === "barcode") {
        const v = (row[el.column] ?? "").trim();
        if (!v) { if (el.required) add(i, "error", el.column || "Barcode", "Barcode value is empty"); }
        else {
          try { encodeBarcode(el.format, v); } catch (e) { add(i, "error", el.column, e instanceof Error ? e.message : "Invalid barcode"); }
        }
      } else if (el.kind === "qr") {
        if (!qrText(el, row, layout.roles) && el.required) add(i, "error", "QR code", "QR code has no data");
      }
    }
    if (nameCol) {
      const name = row[nameCol] ?? "";
      if (name && !NAME_OK.test(name.trim())) add(i, "warning", nameCol, `Special characters in name: "${name}"`);
      if (name !== name.trim() || /\s{2,}/.test(name)) add(i, "warning", nameCol, "Extra spaces in name");
    }
    for (const col of phoneCols) {
      const raw = (row[col] ?? "").trim();
      if (!raw) continue;
      const digits = raw.replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
      if (digits.length !== 10) add(i, "warning", col, `Phone number looks wrong: "${raw}"`);
    }
    if (bloodCol) {
      const b = (row[bloodCol] ?? "").trim();
      if (b && !BLOOD_OK.test(b)) add(i, "warning", bloodCol, `Unknown blood group: "${b}"`);
      if (!b && layout.elements.some((e) => e.kind === "text" && e.column === bloodCol)) add(i, "warning", bloodCol, "Blood group is empty");
    }
  });

  // Duplicates: same ID, or same name in the same class
  const duplicates: PreflightReport["duplicates"] = [];
  const group = (by: string, keyOf: (row: Row) => string) => {
    const map = new Map<string, number[]>();
    rows.forEach((row, i) => { const k = keyOf(row); if (k) map.set(k, [...(map.get(k) ?? []), i]); });
    for (const [key, idx] of map) if (idx.length > 1) {
      duplicates.push({ key, rows: idx, by });
      idx.forEach((r) => add(r, "error", by, `Duplicate ${by}: ${key} (rows ${idx.map((x) => x + 1).join(", ")})`));
    }
  };
  const idCol = layout.roles.admission || (layout.matchBy === "column" ? layout.matchColumn : "");
  if (idCol) group(idCol, (r) => mediaKey(r[idCol] ?? ""));
  if (nameCol) {
    const cls = layout.roles.classSection || layout.roles.class || "";
    group(`${nameCol}${cls ? " + " + cls : ""}`, (r) => {
      const n = (r[nameCol] ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      return n ? `${n}${cls ? " · " + (roleValue(r, layout.roles, cls === layout.roles.classSection ? "classSection" : "class")).toLowerCase() : ""}` : "";
    });
  }

  const rowsWithErrors = new Set(findings.filter((f) => f.severity === "error").map((f) => f.row));
  const rowsWithWarnings = new Set(findings.filter((f) => f.severity === "warning").map((f) => f.row));
  const counts: Record<string, number> = {};
  for (const f of findings) counts[f.field] = (counts[f.field] ?? 0) + 1;
  return { findings, rowsWithErrors, rowsWithWarnings, duplicates, counts };
}
