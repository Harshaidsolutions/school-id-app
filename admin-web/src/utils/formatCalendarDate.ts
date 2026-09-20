/** Calendar date from stored ISO/timestamp without local timezone shifting the day. */
export function formatCalendarDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const raw = iso.trim();
  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10);
  const [y, m, d] = datePart.split("-").map((n) => Number(n));
  if (!y || !m || !d) return "—";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
