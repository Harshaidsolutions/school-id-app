import * as FileSystem from "expo-file-system/legacy";

export type StoredLocalImage = { uri: string; name: string; type: string };

export function isLocalMediaUri(uri: string | null | undefined): boolean {
  if (!uri) return false;
  const lower = uri.toLowerCase();
  return (
    lower.startsWith("file://") ||
    lower.startsWith("content://") ||
    lower.startsWith("ph://")
  );
}

/** Copy a picked image into app storage so draft uploads survive restart/logout. */
export async function persistOrgDetailsImage(
  sourceUri: string,
  userId: string,
  kind: "signature" | "logo" | "organization",
  mimeType?: string | null
): Promise<StoredLocalImage> {
  const ext =
    mimeType?.includes("png") || sourceUri.toLowerCase().includes(".png")
      ? "png"
      : "jpg";
  const name = `${kind}.${ext}`;
  const baseDir = FileSystem.documentDirectory;
  if (!baseDir) {
    return localImageFromUri(sourceUri, `${kind}.jpg`, mimeType);
  }
  const dir = `${baseDir}org-details/${userId}`;
  const dest = `${dir}/${name}`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return {
    uri: dest,
    name,
    type: ext === "png" ? "image/png" : "image/jpeg",
  };
}

export function localImageFromUri(
  uri: string,
  defaultName: string,
  mimeType?: string | null
): StoredLocalImage {
  const name = uri.split("/").pop() ?? defaultName;
  const type =
    mimeType ??
    (name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
  return { uri, name, type };
}

export function resolveUploadFile(
  pending: StoredLocalImage | null,
  previewUri: string | null,
  defaultName: string
): StoredLocalImage | null {
  if (pending?.uri) return pending;
  if (previewUri && isLocalMediaUri(previewUri)) {
    return localImageFromUri(previewUri, defaultName);
  }
  return null;
}
