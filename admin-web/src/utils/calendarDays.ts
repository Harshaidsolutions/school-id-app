/** Parse YYYY-MM-DD from ISO/timestamp without timezone day shift. */
export function parseCalendarYmd(iso: string | null | undefined): {
  y: number;
  m: number;
  d: number;
} | null {
  if (!iso?.trim()) return null;
  const raw = iso.trim();
  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  const [y, m, d] = datePart.split("-").map((n) => Number(n));
  if (!y || !m || !d) return null;
  return { y, m, d };
}

function ymdToUtcMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function utcMsToYmd(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive calendar days from org creation through today (UTC calendar dates). */
export function calendarDaysFromCreated(
  createdIso: string | null | undefined,
  through: Date = new Date()
): string[] {
  const start = parseCalendarYmd(createdIso);
  if (!start) return [];
  const endY = through.getFullYear();
  const endM = through.getMonth() + 1;
  const endD = through.getDate();
  let cursor = ymdToUtcMs(start.y, start.m, start.d);
  const endMs = ymdToUtcMs(endY, endM, endD);
  const days: string[] = [];
  while (cursor <= endMs) {
    days.push(utcMsToYmd(cursor));
    cursor += 24 * 60 * 60 * 1000;
  }
  return days.reverse();
}
