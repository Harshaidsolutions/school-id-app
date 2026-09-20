import { SERVER_ORIGIN } from "../api/client";

/** Turn API-relative paths into absolute URLs for Image components. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `http:${trimmed}`;
  const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${SERVER_ORIGIN}${path}`;
}
