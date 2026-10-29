/**
 * Minimal ZIP reader and writer for the generator (no npm dependency).
 * Reader: stored + deflate entries (uses the browser's DecompressionStream), ZIP64 sizes not supported.
 * Writer: stored entries with CRC-32 (images/PDFs are already compressed).
 */
export type ZipEntry = { name: string; size: number; read: () => Promise<Blob> };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Blob> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(stream).blob();
}

export async function readZip(file: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of central directory: scan backwards (comment can be up to 64 KB)
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid ZIP archive");
  const count = view.getUint16(eocd + 10, true);
  let ptr = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  const utf8 = new TextDecoder("utf-8");
  const latin = new TextDecoder("windows-1252");
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) throw new Error("ZIP central directory is damaged");
    const flags = view.getUint16(ptr + 8, true);
    const method = view.getUint16(ptr + 10, true);
    const compSize = view.getUint32(ptr + 20, true);
    const size = view.getUint32(ptr + 24, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localOffset = view.getUint32(ptr + 42, true);
    const nameBytes = buf.subarray(ptr + 46, ptr + 46 + nameLen);
    const name = (flags & 0x800 ? utf8 : latin).decode(nameBytes);
    ptr += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = buf.subarray(start, start + compSize);
    if (method !== 0 && method !== 8) continue; // unsupported compression: skip
    if (flags & 1) throw new Error("Password-protected ZIP files are not supported");
    entries.push({
      name,
      size,
      read: () => (method === 0 ? Promise.resolve(new Blob([data as BlobPart])) : inflateRaw(data)),
    });
  }
  return entries;
}

/** Streams files into a stored (uncompressed) ZIP. Files are kept as Blobs, so memory stays low. */
export class ZipWriter {
  private parts: BlobPart[] = [];
  private central: Uint8Array[] = [];
  private offset = 0;
  private count = 0;

  async add(name: string, blob: Blob): Promise<void> {
    const data = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x800, true); // UTF-8 names
    lv.setUint16(8, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, this.offset, true);
    cen.set(nameBytes, 46);
    this.parts.push(local, blob);
    this.central.push(cen);
    this.offset += local.length + data.length;
    this.count++;
  }

  finish(): Blob {
    const cenSize = this.central.reduce((s, c) => s + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.count, true);
    ev.setUint16(10, this.count, true);
    ev.setUint32(12, cenSize, true);
    ev.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...(this.central as BlobPart[]), end], { type: "application/zip" });
  }
}
