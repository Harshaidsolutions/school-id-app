import * as pdfjs from "pdfjs-dist";
// Bundled worker (no internet): Vite copies it next to the app.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Renders page 1 of a PDF template to a PNG blob at print quality (offline). */
export async function pdfToImage(file: Blob, page = 1, dpi = 300): Promise<Blob> {
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false });
  const doc = await task.promise;
  try {
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const viewport = p.getViewport({ scale: dpi / 72 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("PDF could not be converted."))), "image/png"));
  } finally {
    await task.destroy();
  }
}
