const IST_OFFSET_MIN = 330;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ist(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MIN * 60000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 30-10-2026 (India time) */
export function fmtDate(value: string | Date | null | undefined): string {
  const d = ist(value);
  if (!d) return "—";
  return `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

/** 30 Oct 2026, 04:15 PM (India time) */
export function fmtDateTime(value: string | Date | null | undefined): string {
  const d = ist(value);
  if (!d) return "—";
  let h = d.getUTCHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(h)}:${pad(d.getUTCMinutes())} ${ap}`;
}

/** 2026-10-30 key in India time (matches the server's capture-day grouping). */
export function dayKey(value: string | Date | null | undefined): string | null {
  const d = ist(value);
  if (!d) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "2026-10-30" -> "30-10-2026" */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

export function initials(name?: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}

export function pct(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

export function num(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("en-IN");
}

/** Current academic year (starts in April). */
export function academicYear(date = new Date()) {
  const start = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return { value: String(start), label: `${start} - ${start + 1}` };
}

export function waLink(phone: string | null | undefined, text?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
