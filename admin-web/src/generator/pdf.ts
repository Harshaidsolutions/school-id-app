/**
 * Small PDF writer for print sheets: JPEG card images (embedded as-is, no re-encoding),
 * crop marks / cut lines and a slug line. Coordinates are millimetres from the top-left.
 */
export type PdfOp =
  | { type: "image"; ref: string; x: number; y: number; w: number; h: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; width: number; dash?: number; gray?: number }
  | { type: "rect"; x: number; y: number; w: number; h: number; width: number; dash?: number; gray?: number }
  | { type: "text"; x: number; y: number; size: number; text: string };

const MM = 72 / 25.4;
const enc = new TextEncoder();
const num = (n: number) => (Math.round(n * 1000) / 1000).toString();

export class PdfWriter {
  private parts: BlobPart[] = [];
  private offsets: number[] = [];
  private length = 0;
  private nextId = 4; // 1 catalog, 2 pages, 3 font
  private pageIds: number[] = [];
  private images = new Map<string, number>();
  private imageCount = 0;

  constructor(private title = "ID cards") {
    this.write(enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n"));
  }

  private write(part: Uint8Array | Blob): void {
    this.parts.push(part as BlobPart);
    this.length += part instanceof Blob ? part.size : part.byteLength;
  }

  private beginObject(id: number): void {
    this.offsets[id] = this.length;
    this.write(enc.encode(`${id} 0 obj\n`));
  }

  /** Embeds a baseline/progressive JPEG (RGB or grayscale). Returns a reference for image ops. */
  addJpeg(jpeg: Blob, widthPx: number, heightPx: number, gray = false): string {
    const id = this.nextId++;
    const ref = `Im${++this.imageCount}`;
    this.beginObject(id);
    this.write(enc.encode(
      `<< /Type /XObject /Subtype /Image /Width ${widthPx} /Height ${heightPx} /ColorSpace /${gray ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.size} >>\nstream\n`
    ));
    this.write(jpeg);
    this.write(enc.encode("\nendstream\nendobj\n"));
    this.images.set(ref, id);
    return ref;
  }

  addPage(widthMm: number, heightMm: number, ops: PdfOp[]): void {
    const H = heightMm * MM;
    const lines: string[] = [];
    const used = new Set<string>();
    let hasText = false;
    for (const op of ops) {
      if (op.type === "image") {
        used.add(op.ref);
        const w = op.w * MM, h = op.h * MM, x = op.x * MM, yTop = H - op.y * MM;
        const m = [w, 0, 0, h, x, yTop - h];
        lines.push(`q ${m.map(num).join(" ")} cm /${op.ref} Do Q`);
      } else if (op.type === "line") {
        const g = op.gray ?? 0;
        lines.push(`q ${num(g)} G ${num(op.width * MM)} w ${op.dash ? `[${num(op.dash * MM)}] 0 d ` : ""}${num(op.x1 * MM)} ${num(H - op.y1 * MM)} m ${num(op.x2 * MM)} ${num(H - op.y2 * MM)} l S Q`);
      } else if (op.type === "rect") {
        const g = op.gray ?? 0;
        lines.push(`q ${num(g)} G ${num(op.width * MM)} w ${op.dash ? `[${num(op.dash * MM)}] 0 d ` : ""}${num(op.x * MM)} ${num(H - (op.y + op.h) * MM)} ${num(op.w * MM)} ${num(op.h * MM)} re S Q`);
      } else {
        hasText = true;
        const safe = op.text.replace(/[^\x20-\x7e]/g, "?").replace(/([\\()])/g, "\\$1");
        lines.push(`BT /F1 ${num(op.size)} Tf ${num(op.x * MM)} ${num(H - op.y * MM)} Td (${safe}) Tj ET`);
      }
    }
    const content = enc.encode(lines.join("\n"));
    const contentId = this.nextId++;
    this.beginObject(contentId);
    this.write(enc.encode(`<< /Length ${content.byteLength} >>\nstream\n`));
    this.write(content);
    this.write(enc.encode("\nendstream\nendobj\n"));
    const pageId = this.nextId++;
    const xobjects = [...used].map((ref) => `/${ref} ${this.images.get(ref)} 0 R`).join(" ");
    this.beginObject(pageId);
    this.write(enc.encode(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(widthMm * MM)} ${num(H)}] /Contents ${contentId} 0 R /Resources << ${xobjects ? `/XObject << ${xobjects} >>` : ""} ${hasText ? "/Font << /F1 3 0 R >>" : ""} >> >>\nendobj\n`
    ));
    this.pageIds.push(pageId);
  }

  get pageCount(): number {
    return this.pageIds.length;
  }

  finish(): Blob {
    this.beginObject(3);
    this.write(enc.encode("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n"));
    this.beginObject(2);
    this.write(enc.encode(`<< /Type /Pages /Kids [${this.pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${this.pageIds.length} >>\nendobj\n`));
    this.beginObject(1);
    this.write(enc.encode("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"));
    const infoId = this.nextId++;
    this.beginObject(infoId);
    const safeTitle = this.title.replace(/[^\x20-\x7e]/g, "").replace(/([\\()])/g, "\\$1");
    this.write(enc.encode(`<< /Title (${safeTitle}) /Producer (My School ID Card - ID Card Generator) >>\nendobj\n`));
    const xrefStart = this.length;
    const size = this.nextId;
    let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
    for (let i = 1; i < size; i++) {
      const off = this.offsets[i];
      xref += off === undefined ? "0000000000 65535 f \n" : `${String(off).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${size} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    this.write(enc.encode(xref));
    return new Blob(this.parts, { type: "application/pdf" });
  }
}
