import * as XLSX from "xlsx";
import type { FormFieldConfig } from "../constants/formFields";
import { RowValidationError, StudentRowInput } from "../types/student";
import { AppError } from "../middleware/errorHandler";
import {
  buildExcelColumnSchema,
  deriveCanonicalValuesFromExtraFields,
  inferFormFieldsFromExcelHeaders,
  isFieldKeyColumnIndex,
  type ExcelColumnDef,
} from "./excelSchema";
import { getStudentFieldValue, setCanonicalFieldOnRow } from "./studentFieldAccess";

/** Convert any Excel cell value to a display/import string without losing numeric IDs. */
export function cellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return String(value);
    const asText = value.toLocaleString("en-US", {
      useGrouping: false,
      maximumFractionDigits: 20,
    });
    return asText.replace(/,/g, "");
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/** Prefer Excel formatted text (cell.w) to preserve IDs, leading zeros, and dates. */
function readSheetCell(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  colIndex: number,
  fallback: unknown
): string {
  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
  const cell = sheet[addr];
  if (!cell) return cellToString(fallback);

  if (cell.w != null && String(cell.w).trim() !== "") {
    return String(cell.w).trim();
  }

  if (cell.t === "d" && cell.v instanceof Date) {
    return cell.v.toISOString().slice(0, 10);
  }

  if (cell.t === "n" && typeof cell.v === "number") {
    return cellToString(cell.v);
  }

  return cellToString(cell.v ?? fallback);
}

function getSheetRange(sheet: XLSX.WorkSheet): XLSX.Range {
  const ref = sheet["!ref"];
  if (!ref) return { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  return XLSX.utils.decode_range(ref);
}

function openFirstSheet(buffer: Buffer): { sheet: XLSX.WorkSheet; range: XLSX.Range } | null {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, raw: true });
  } catch {
    return null;
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return null;
  return { sheet, range: getSheetRange(sheet) };
}

function countNonEmptyCellsInRow(
  sheet: XLSX.WorkSheet,
  rowIndex: number,
  maxCol: number
): number {
  let count = 0;
  for (let c = 0; c <= maxCol; c++) {
    if (readSheetCell(sheet, rowIndex, c, "").trim()) count += 1;
  }
  return count;
}

/** First row with at least two non-empty cells — handles title rows above headers. */
function detectHeaderRowIndex(sheet: XLSX.WorkSheet, maxRow: number, maxCol: number): number {
  const scanLimit = Math.min(maxRow, 20);
  for (let r = 0; r <= scanLimit; r++) {
    if (countNonEmptyCellsInRow(sheet, r, maxCol) >= 2) return r;
  }
  return 0;
}

function readHeaderCells(
  sheet: XLSX.WorkSheet,
  headerRowIndex: number,
  maxCol: number
): string[] {
  const headers: string[] = [];
  for (let c = 0; c <= maxCol; c++) {
    headers[c] = readSheetCell(sheet, headerRowIndex, c, "");
  }
  return headers;
}

export function uniquenessKey(classSection: string, photoId: string): string {
  return `${classSection.trim().toLowerCase()}|${photoId.trim().toLowerCase()}`;
}

function isNumericPhone(value: string): boolean {
  return /^\d+$/.test(value);
}

function emptyRowInput(excelRow: number): StudentRowInput {
  return {
    excelRow,
    photoId: "",
    classSection: "",
    studentName: "",
    parentName: "",
    parentPhone: "",
    address: null,
    rollNo: null,
    dob: null,
    gender: null,
    bloodGroup: null,
    custom1: null,
    custom2: null,
    custom3: null,
    extraFields: {},
  };
}

/**
 * Map cells by actual sheet column index (fld_N keys).
 * Saved form config may only override labels / disabled columns — never remap keys or positions.
 */
function resolveHeaderSchema(
  rawHeaders: string[],
  formFields?: FormFieldConfig[]
): ExcelColumnDef[] {
  const fromSheet = buildExcelColumnSchema(rawHeaders);
  if (!formFields?.length) return fromSheet;

  const labelByColIndex = new Map<number, string>();
  const labelByNormalizedHeader = new Map<string, string>();
  const disabledColIndexes = new Set<number>();

  for (const field of formFields) {
    const label = field.label.replace(/\s+/g, " ").trim();
    if (label) {
      labelByNormalizedHeader.set(label.toUpperCase(), label);
    }

    if (isFieldKeyColumnIndex(field.key)) {
      const colIndex = Number(field.key.slice(4));
      if (!Number.isFinite(colIndex) || colIndex < 0) continue;
      if (!field.enabled) {
        disabledColIndexes.add(colIndex);
        continue;
      }
      if (label) labelByColIndex.set(colIndex, label);
    }
  }

  return fromSheet
    .filter((col) => !disabledColIndexes.has(col.colIndex))
    .map((col) => {
      const normalizedHeader = col.label.replace(/\s+/g, " ").trim().toUpperCase();
      const label =
        labelByColIndex.get(col.colIndex) ??
        labelByNormalizedHeader.get(normalizedHeader) ??
        col.label;
      return { ...col, label };
    });
}

/** Typed DB columns populated on bulk import (text-safe only). Dates stay in extra_fields. */
const BULK_IMPORT_CANONICAL_KEYS = new Set([
  "photo_id",
  "class_section",
  "student_name",
  "parent_name",
  "parent_phone",
]);

function applyCanonicalFromExtra(
  parsed: StudentRowInput,
  columns: ExcelColumnDef[]
): void {
  const canonical = deriveCanonicalValuesFromExtraFields(columns, parsed.extraFields);
  for (const [key, value] of Object.entries(canonical)) {
    if (value == null || !BULK_IMPORT_CANONICAL_KEYS.has(key)) continue;
    setCanonicalFieldOnRow(parsed, key, value);
  }
}

export function parseStudentExcel(
  buffer: Buffer,
  formFields?: FormFieldConfig[]
): StudentRowInput[] {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      raw: true,
    });
  } catch {
    throw new AppError("Malformed Excel file: unable to parse workbook", 400);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError("Excel file has no sheets", 400);
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new AppError("Excel file has no readable sheet", 400);
  }

  const range = getSheetRange(sheet);
  if (range.e.r < 0 || range.e.c < 0) {
    throw new AppError("Excel file is empty", 400);
  }

  const headerRowIndex = detectHeaderRowIndex(sheet, range.e.r, range.e.c);
  const rawHeaders = readHeaderCells(sheet, headerRowIndex, range.e.c);
  const headerSchema = resolveHeaderSchema(rawHeaders, formFields);

  if (headerSchema.length === 0) {
    throw new AppError("Excel file has no column headers", 400);
  }

  const dataRows: StudentRowInput[] = [];

  for (let sheetRow = headerRowIndex + 1; sheetRow <= range.e.r; sheetRow++) {
    const excelRow = sheetRow + 1;
    const parsed = emptyRowInput(excelRow);
    let hasAnyValue = false;

    for (const col of headerSchema) {
      let raw = readSheetCell(sheet, sheetRow, col.colIndex, "");
      if (inferSemanticPhoneColumn(col)) {
        raw = raw.replace(/[\s\-()]/g, "");
      }

      if (raw) hasAnyValue = true;
      parsed.extraFields[col.key] = raw || null;
    }

    if (!hasAnyValue) continue;

    applyCanonicalFromExtra(parsed, headerSchema);
    dataRows.push(parsed);
  }

  if (dataRows.length === 0) {
    console.info(
      "[bulk-upload] headers-only sheet accepted:",
      `headerRow=${headerRowIndex + 1}`,
      `sheetRows=${range.e.r + 1}`,
      `cols=${headerSchema.length}`,
      `fields=${headerSchema.map((c) => c.label).join(", ")}`
    );
  }

  return dataRows;
}

function inferSemanticPhoneColumn(col: ExcelColumnDef): boolean {
  const n = col.label.trim().toLowerCase();
  return n.includes("phone") || n.includes("mobile") || n.includes("tel");
}

/** Read header labels preserving sheet column order (includes empty cells as skipped columns). */
export function extractExcelHeaders(buffer: Buffer): string[] {
  const opened = openFirstSheet(buffer);
  if (!opened) return [];
  const { sheet, range } = opened;
  const headerRowIndex = detectHeaderRowIndex(sheet, range.e.r, range.e.c);
  return readHeaderCells(sheet, headerRowIndex, range.e.c)
    .map((cell) => cell.trim())
    .filter(Boolean);
}

export function validateStudentRows(
  rows: StudentRowInput[],
  formFields?: FormFieldConfig[]
): RowValidationError[] {
  const errors: RowValidationError[] = [];
  const seenInFile = new Map<string, number>();

  const enabledFields = formFields?.filter((f) => f.enabled) ?? [];
  const labelForKey = (key: string): string => {
    const hit = enabledFields.find((f) => f.key === key);
    return hit?.label?.trim() || key;
  };

  const hasPhotoCol = rows.some((r) => r.photoId);
  const hasClassCol = rows.some((r) => r.classSection);

  for (const row of rows) {
    if (row.parentPhone && !isNumericPhone(row.parentPhone)) {
      errors.push({
        row: row.excelRow,
        reason: `${labelForKey("parent_phone") || "Phone"} must be numeric`,
      });
    }

    const photoId = row.photoId || (hasPhotoCol ? "" : `ROW-${row.excelRow}`);
    const classSection = row.classSection || (hasClassCol ? "" : "UNKNOWN");

    if (hasPhotoCol && hasClassCol && photoId && classSection) {
      const key = uniquenessKey(classSection, photoId);
      const firstRow = seenInFile.get(key);

      if (firstRow != null) {
        errors.push({
          row: row.excelRow,
          reason: `Duplicate class + photo/id within file (also on row ${firstRow})`,
        });
      } else {
        seenInFile.set(key, row.excelRow);
      }
    }
  }

  return errors;
}

export function buildExportHeaders(
  formFields: FormFieldConfig[]
): { label: string; key: string }[] {
  const enabled = formFields.filter((f) => f.enabled && f.key !== "signature_upload");
  const orderOf = (f: FormFieldConfig, index: number): number => {
    if (typeof f.displayOrder === "number") return f.displayOrder;
    const idx = (f as { colIndex?: number }).colIndex;
    if (typeof idx === "number") return idx;
    return index;
  };
  const ordered = [...enabled].sort(
    (a, b) => orderOf(a, enabled.indexOf(a)) - orderOf(b, enabled.indexOf(b))
  );
  const headers = ordered.map((f) => ({ label: f.label.trim(), key: f.key }));
  headers.push({ label: "STATUS", key: "status" });
  return headers;
}

export function studentFieldValue(
  row: Record<string, string | null | undefined>,
  key: string,
  fieldLabel?: string
): string {
  if (key === "status") {
    const status = (row.status ?? "pending").toLowerCase();
    if (status === "printed") return "Printed";
    if (status === "captured") return "Captured";
    return "Pending";
  }

  return getStudentFieldValue(row, key, { fieldLabel });
}

export function inferSchemaFromExcelBuffer(buffer: Buffer): FormFieldConfig[] {
  const rawRows = readRawHeaderRow(buffer);
  return inferFormFieldsFromExcelHeaders(rawRows);
}

/** Full column schema with stable fld_N keys and sheet column indices. */
export function inferColumnSchemaFromExcelBuffer(buffer: Buffer): ExcelColumnDef[] {
  return buildExcelColumnSchema(readRawHeaderRow(buffer));
}

export function formFieldsFromColumnSchema(columns: ExcelColumnDef[]): FormFieldConfig[] {
  return columns.map((col) => ({
    key: col.key,
    label: col.label,
    enabled: true,
    colIndex: col.colIndex,
    source: "excel" as const,
  }));
}

function readRawHeaderRow(buffer: Buffer): string[] {
  const opened = openFirstSheet(buffer);
  if (!opened) return [];
  const { sheet, range } = opened;
  const headerRowIndex = detectHeaderRowIndex(sheet, range.e.r, range.e.c);
  return readHeaderCells(sheet, headerRowIndex, range.e.c);
}
