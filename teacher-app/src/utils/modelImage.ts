import type { TeacherModel } from "../types";
import { resolveMediaUrl } from "./mediaUrl";

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Best preview URL for a model/tag catalog item (same pattern as templates). */
export function modelImageUrl(model: TeacherModel | null | undefined): string | null {
  if (!model) return null;
  const extra = model as TeacherModel & Record<string, unknown>;
  const raw =
    pickString(extra, [
      "image_url",
      "imageUrl",
      "image",
      "thumbnail_url",
      "thumbnailUrl",
      "thumbnail",
      "preview_url",
      "previewUrl",
      "photo_url",
      "photoUrl",
    ]) ?? model.image_url;
  return resolveMediaUrl(raw);
}

export function modelImageUrlByName(
  name: string,
  catalog: TeacherModel[]
): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const found =
    catalog.find((m) => m.name === trimmed) ??
    catalog.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  return modelImageUrl(found);
}

function urlsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const aTail = a.split("/").pop() ?? a;
  const bTail = b.split("/").pop() ?? b;
  return aTail === bTail || a.endsWith(bTail) || b.endsWith(aTail);
}

/** Resolve catalog item name when UI shows preview but name state is empty. */
export function modelNameFromPreviewUrl(
  previewUrl: string | null | undefined,
  catalog: TeacherModel[]
): string {
  if (!previewUrl?.trim()) return "";
  const normalized = previewUrl.trim();
  for (const item of catalog) {
    const url = modelImageUrl(item);
    if (url && urlsMatch(normalized, url)) return item.name;
  }
  return "";
}
