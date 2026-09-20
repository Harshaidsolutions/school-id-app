import { resolveMediaUrl } from "./mediaUrl";

/** Normalize local picks and API paths for React Native Image. */
export function toImageUri(uri: string | null | undefined): string | null {
  if (!uri?.trim()) return null;
  const trimmed = uri.trim();
  if (
    trimmed.startsWith("file:") ||
    trimmed.startsWith("content:") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("asset:")
  ) {
    return trimmed;
  }
  return resolveMediaUrl(trimmed);
}
