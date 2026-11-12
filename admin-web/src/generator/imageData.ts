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

/**
 * The print resolution (DPI) stored inside a PNG (pHYs) or JPG (JFIF / EXIF) file, or null when
 * the file does not say. Values below 100 are screen defaults (72 / 96), not a print size: ignored.
 */
export async function readImageDpi(blob: Blob): Promise<number | null> {
  try {
    const b = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
    const u16 = (i: number, le = false) => (le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
    const u32 = (i: number, le = false) => (le ? (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0 : ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0);
    // PNG stores pixels per metre (300 DPI = 11811 → 299.99): snap to the whole number.
    const ok = (v: number) => (Number.isFinite(v) && v >= 100 && v <= 2400 ? (Math.abs(v - Math.round(v)) < 0.6 ? Math.round(v) : Math.round(v * 100) / 100) : null);
    // PNG: chunks after the 8-byte signature; pHYs = pixels per metre (unit 1).
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      let p = 8;
      while (p + 12 <= b.length) {
        const len = u32(p);
        const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
        if (type === "pHYs" && b[p + 16] === 1) return ok(u32(p + 8) * 0.0254);
        if (type === "IDAT" || type === "IEND") break;
        p += 12 + len;
      }
      return null;
    }
    // JPEG: walk the markers; JFIF APP0 (units 1 = inch, 2 = cm) or EXIF APP1 XResolution.
    if (b[0] === 0xff && b[1] === 0xd8) {
      let p = 2;
      let found: number | null = null;
      while (p + 4 <= b.length && b[p] === 0xff) {
        const marker = b[p + 1];
        const len = u16(p + 2);
        const s = p + 4;
        if (marker === 0xe0 && b[s] === 0x4a && b[s + 1] === 0x46 && b[s + 2] === 0x49 && b[s + 3] === 0x46) {
          const units = b[s + 7];
          const x = u16(s + 8);
          if (units === 1) found = found ?? ok(x);
          if (units === 2) found = found ?? ok(x * 2.54);
        }
        if (marker === 0xe1 && b[s] === 0x45 && b[s + 1] === 0x78 && b[s + 2] === 0x69 && b[s + 3] === 0x66) {
          const t = s + 6; // TIFF header
          const le = b[t] === 0x49;
          const ifd = t + u32(t + 4, le);
          const n = u16(ifd, le);
          let xr: number | null = null;
          let unit = 2;
          for (let k = 0; k < n; k++) {
            const e = ifd + 2 + k * 12;
            if (e + 12 > b.length) break;
            const tag = u16(e, le);
            if (tag === 0x011a) { const off = t + u32(e + 8, le); const den = u32(off + 4, le); if (den) xr = u32(off, le) / den; }
            if (tag === 0x0128) unit = u16(e + 8, le);
          }
          if (xr) { const v = ok(unit === 3 ? xr * 2.54 : xr); if (v) return v; }
        }
        if (marker === 0xda || marker === 0xd9) break;
        p += 2 + len;
      }
      return found;
    }
  } catch {
    /* unreadable header: use the default */
  }
  return null;
}
