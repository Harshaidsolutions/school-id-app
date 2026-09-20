import { pool } from "../config/database";

export type TagSelectionItem = {
  name: string;
  image_url: string | null;
};

/** Resolve catalog model/tag name to its uploaded image URL. */
export async function catalogImageByName(
  kind: "model" | "tag",
  name: string,
  ownerAdminId?: string | null
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const ownerClause = ownerAdminId
    ? ` AND owner_admin_id = $3`
    : "";
  const ownerParams = ownerAdminId ? [ownerAdminId] : [];

  const exact = await pool.query<{ image_url: string | null }>(
    `SELECT image_url
     FROM catalog_items
     WHERE kind = $1 AND name = $2${ownerClause}
     LIMIT 1`,
    [kind, trimmed, ...ownerParams]
  );
  if (exact.rows[0]?.image_url) return exact.rows[0].image_url;

  const ci = await pool.query<{ image_url: string | null }>(
    `SELECT image_url
     FROM catalog_items
     WHERE kind = $1 AND LOWER(name) = LOWER($2)${ownerClause}
     LIMIT 1`,
    [kind, trimmed, ...ownerParams]
  );
  return ci.rows[0]?.image_url ?? null;
}

/** Comma-separated tag names → image URLs from catalog_items (kind = tag). */
export async function resolveTagSelections(
  tags: string | null | undefined,
  ownerAdminId?: string | null
): Promise<TagSelectionItem[]> {
  if (!tags?.trim()) return [];
  const names = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const unique = [...new Set(names)];
  const items: TagSelectionItem[] = [];
  for (const name of unique) {
    items.push({
      name,
      image_url: await catalogImageByName("tag", name, ownerAdminId),
    });
  }
  return items;
}

export async function resolveModelImageUrl(
  model: string | null | undefined,
  ownerAdminId?: string | null
): Promise<string | null> {
  if (!model?.trim()) return null;
  return catalogImageByName("model", model, ownerAdminId);
}

export async function resolveTemplateImageUrl(
  templateId: string | null | undefined
): Promise<string | null> {
  if (!templateId?.trim()) return null;
  const result = await pool.query<{ image_url: string | null }>(
    `SELECT image_url FROM templates WHERE id = $1 LIMIT 1`,
    [templateId]
  );
  return result.rows[0]?.image_url ?? null;
}
