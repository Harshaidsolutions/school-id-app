/**
 * Fixed class hierarchy (not alphabetical):
 * Nursery → LKG → UKG → I → II → … → X (+ XI/XII and numeric fallbacks).
 */
const ROMAN_VALUES: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

function parseRomanToken(token: string): number | null {
  const t = token.trim().toLowerCase().replace(/\./g, "");
  if (!t) return null;
  if (ROMAN_VALUES[t] != null) return ROMAN_VALUES[t];
  if (/^\d+$/.test(t)) {
    const n = parseInt(t, 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  const m = t.match(/^(\d+)(?:st|nd|rd|th)$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  return null;
}

export function classSortKey(label: string): [number, string] {
  const raw = (label ?? "").trim();
  const s = raw.toLowerCase();

  if (s.includes("nursery") || s.includes("pre-k") || s.includes("prek")) {
    return [-30, raw.toLowerCase()];
  }
  if (/\blkg\b/.test(s) || s.includes("l.k.g") || s.includes("lower kg")) {
    return [-20, raw.toLowerCase()];
  }
  if (/\bukg\b/.test(s) || s.includes("u.k.g") || s.includes("upper kg")) {
    return [-10, raw.toLowerCase()];
  }

  const tokens = s.split(/[\s\-_/]+/).filter(Boolean);
  for (const token of tokens) {
    const roman = parseRomanToken(token);
    if (roman != null) return [roman, raw.toLowerCase()];
  }

  const embedded = s.match(/\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/);
  if (embedded) {
    const roman = parseRomanToken(embedded[1]);
    if (roman != null) return [roman, raw.toLowerCase()];
  }

  const digit = s.match(/(?:^|\b)(1[0-2]|[1-9])(?:\s*[a-z])?(?:\b|$)/);
  if (digit) {
    const n = parseInt(digit[1], 10);
    if (n >= 1 && n <= 12) return [n, raw.toLowerCase()];
  }

  return [1000, raw.toLowerCase()];
}

export function sortClassSections<T>(
  items: T[],
  getLabel: (item: T) => string,
  direction: "asc" | "desc" = "asc"
): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    const [na, sa] = classSortKey(getLabel(a));
    const [nb, sb] = classSortKey(getLabel(b));
    if (na !== nb) return direction === "asc" ? na - nb : nb - na;
    return sa.localeCompare(sb);
  });
  return copy;
}
