import type { TemplateItem } from "../types";
import { resolveMediaUrl } from "./mediaUrl";

function pickConfigUrl(
  cfg: Record<string, unknown>,
  keys: string[]
): string | null {
  for (const key of keys) {
    const value = cfg[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Best preview URL for a template (front side or primary image). */
export function templatePreviewUrl(item: TemplateItem): string | null {
  const cfg =
    item.config_json && typeof item.config_json === "object"
      ? (item.config_json as Record<string, unknown>)
      : {};
  const raw =
    pickConfigUrl(cfg, [
      "frontUrl",
      "front_url",
      "front_image_url",
      "frontImage",
      "previewUrl",
      "preview_url",
      "thumbnail",
      "thumbnail_url",
    ]) ?? item.image_url;
  return resolveMediaUrl(raw);
}
