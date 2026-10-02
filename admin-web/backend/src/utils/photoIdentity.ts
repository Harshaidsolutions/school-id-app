import { pool } from "../config/database";
import { parseExtraFields } from "./studentFieldAccess";

const GENERATED_PHOTO_ID = /^(?:ADD_\d+|IMP-\d+|ROW-\d+)$/i;

export function isPhotoIdentityLabel(label: string): boolean {
  const n = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!n) return false;
  if (n === "id" || n === "photoid" || n === "photonumber" || n === "photono" || n === "photoidnumber") {
    return true;
  }
  if (n.includes("url") || n.includes("capture")) return false;
  if (!n.includes("photo")) return false;
  return n.includes("id") || n.includes("number") || n.endsWith("no");
}

function labelMap(fieldLabels: unknown): Record<string, string> {
  if (!fieldLabels || typeof fieldLabels !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fieldLabels as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[key] = value;
  }
  return out;
}

/** One visible Photo ID / Photo Number. Excel values win over ADD_/IMP_/ROW_ numbers. */
export function chooseCanonicalPhotoId(
  photoId: string | null | undefined,
  extra: Record<string, string | null>,
  labels: Record<string, string>
): string | null {
  const numbered: string[] = [];
  const others: string[] = [];
  for (const [key, raw] of Object.entries(extra)) {
    const label = labels[key] || "";
    if (key !== "photo_id" && !isPhotoIdentityLabel(label)) continue;
    const value = String(raw ?? "").trim();
    if (!value || GENERATED_PHOTO_ID.test(value)) continue;
    if (label.toLowerCase().replace(/[^a-z0-9]+/g, "").includes("number")) numbered.push(value);
    else others.push(value);
  }
  const stored = String(photoId ?? "").trim();
  if (stored && !GENERATED_PHOTO_ID.test(stored)) return stored;
  if (numbered[0]) return numbered[0];
  if (others[0]) return others[0];
  return stored || null;
}

export function withCanonicalPhotoId<
  T extends {
    id?: string;
    photo_id?: string | null;
    extra_fields?: unknown;
    field_labels?: unknown;
  },
>(row: T): { row: T; persist: { id: string; photoId: string } | null } {
  const extra = parseExtraFields(row.extra_fields);
  const labels = labelMap(row.field_labels);
  const chosen = chooseCanonicalPhotoId(row.photo_id, extra, labels);
  if (!chosen) return { row, persist: null };

  const nextExtra = { ...extra };
  let extraChanged = false;
  for (const key of Object.keys(nextExtra)) {
    const label = labels[key] || "";
    if (key !== "photo_id" && !isPhotoIdentityLabel(label)) continue;
    if (nextExtra[key] !== chosen) {
      nextExtra[key] = chosen;
      extraChanged = true;
    }
  }

  const stored = String(row.photo_id ?? "").trim();
  const next = (
    stored === chosen && !extraChanged
      ? row
      : { ...row, photo_id: chosen, extra_fields: nextExtra }
  ) as T;

  const persist =
    row.id && stored !== chosen && (!stored || GENERATED_PHOTO_ID.test(stored))
      ? { id: row.id, photoId: chosen }
      : null;
  return { row: next, persist };
}

export async function persistCanonicalPhotoIds(
  updates: { id: string; photoId: string }[]
): Promise<void> {
  if (updates.length === 0) return;
  await pool.query(
    `UPDATE students AS s
     SET photo_id = v.photo_id
     FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::text[]) AS photo_id) AS v
     WHERE s.id = v.id
       AND s.photo_id IS DISTINCT FROM v.photo_id
       AND (s.photo_id IS NULL OR btrim(s.photo_id) = '' OR s.photo_id ~* '^(ADD_[0-9]+|IMP-[0-9]+|ROW-[0-9]+)$')`,
    [updates.map((item) => item.id), updates.map((item) => item.photoId)]
  );
}
