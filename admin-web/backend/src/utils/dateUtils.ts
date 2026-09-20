import { isDobHeader, normalizeHeaderForMatch } from "./excelSchema";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_SLASH = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/** True when the value looks like a date, not arbitrary text such as a person's name. */
export function looksLikeDateValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (ISO_DATE.test(trimmed)) return true;

  const dmy = trimmed.match(DMY_SLASH);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      return true;
    }
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return false;

  // Reject strings that are mostly letters (e.g. names mistaken for dates).
  const letters = (trimmed.match(/[a-zA-Z]/g) ?? []).length;
  return letters <= 3;
}

/** Normalize a validated date string to YYYY-MM-DD for PostgreSQL DATE columns. */
export function normalizeDateForDb(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || !looksLikeDateValue(trimmed)) return null;

  if (ISO_DATE.test(trimmed)) return trimmed;

  const dmy = trimmed.match(DMY_SLASH);
  if (dmy) {
    const day = String(Number(dmy[1])).padStart(2, "0");
    const month = String(Number(dmy[2])).padStart(2, "0");
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Safe DATE column value: only when header is a DOB field and value parses as a date. */
export function safeDateColumnValue(
  value: string | null | undefined,
  headerLabel: string | undefined
): string | null {
  if (!value?.trim() || !headerLabel?.trim()) return null;
  if (!isDobHeader(normalizeHeaderForMatch(headerLabel))) return null;
  return normalizeDateForDb(value);
}
