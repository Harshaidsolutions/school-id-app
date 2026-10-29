/** Reads an uploaded picture (logo, QR code, stamp, sign) and keeps it as a compact PNG data URL. */
export async function fileToDataUrl(file: File, maxSide = 1200): Promise<string> {
  if (!/^image\//.test(file.type)) throw new Error("Choose a PNG or JPG image");
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * s));
  c.height = Math.max(1, Math.round(bitmap.height * s));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c.toDataURL("image/png");
}

const cache = new Map<string, Promise<Blob>>();
/** data URL → Blob, cached so the same uploaded image decodes once. */
export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  let hit = cache.get(dataUrl);
  if (!hit) {
    hit = fetch(dataUrl).then((r) => r.blob());
    cache.set(dataUrl, hit);
  }
  return hit;
}
