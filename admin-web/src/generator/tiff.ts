/** Uncompressed RGB TIFF (baseline) with DPI tags — opens in Photoshop, CorelDRAW, print RIPs. */
export function canvasToTiff(canvas: HTMLCanvasElement, dpi: number): Blob {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available");
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  return rgbaToTiff(rgba, width, height, dpi);
}

export function rgbaToTiff(rgba: Uint8ClampedArray, width: number, height: number, dpi: number): Blob {
  const pixelBytes = width * height * 3;
  const entries = 12;
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const extraOffset = ifdOffset + ifdSize; // BitsPerSample (6 bytes) + 2 rationals (16 bytes)
  const dataOffset = extraOffset + 6 + 16;
  const header = new ArrayBuffer(dataOffset);
  const v = new DataView(header);
  v.setUint16(0, 0x4949); // "II" little-endian
  v.setUint16(2, 42, true);
  v.setUint32(4, ifdOffset, true);
  v.setUint16(ifdOffset, entries, true);
  let p = ifdOffset + 2;
  const tag = (id: number, type: number, count: number, value: number) => {
    v.setUint16(p, id, true);
    v.setUint16(p + 2, type, true);
    v.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) v.setUint16(p + 8, value, true);
    else v.setUint32(p + 8, value, true);
    p += 12;
  };
  const SHORT = 3, LONG = 4, RATIONAL = 5;
  tag(256, LONG, 1, width);                 // ImageWidth
  tag(257, LONG, 1, height);                // ImageLength
  tag(258, SHORT, 3, extraOffset);          // BitsPerSample -> 8,8,8
  tag(259, SHORT, 1, 1);                    // Compression: none
  tag(262, SHORT, 1, 2);                    // Photometric: RGB
  tag(273, LONG, 1, dataOffset);            // StripOffsets
  tag(277, SHORT, 1, 3);                    // SamplesPerPixel
  tag(278, LONG, 1, height);                // RowsPerStrip
  tag(279, LONG, 1, pixelBytes);            // StripByteCounts
  tag(282, RATIONAL, 1, extraOffset + 6);   // XResolution
  tag(283, RATIONAL, 1, extraOffset + 14);  // YResolution
  tag(296, SHORT, 1, 2);                    // ResolutionUnit: inch
  v.setUint32(p, 0, true);                  // next IFD
  v.setUint16(extraOffset, 8, true);
  v.setUint16(extraOffset + 2, 8, true);
  v.setUint16(extraOffset + 4, 8, true);
  v.setUint32(extraOffset + 6, dpi, true);
  v.setUint32(extraOffset + 10, 1, true);
  v.setUint32(extraOffset + 14, dpi, true);
  v.setUint32(extraOffset + 18, 1, true);
  const pixels = new Uint8Array(pixelBytes);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3] / 255; // flatten on white
    pixels[j] = Math.round(rgba[i] * a + 255 * (1 - a));
    pixels[j + 1] = Math.round(rgba[i + 1] * a + 255 * (1 - a));
    pixels[j + 2] = Math.round(rgba[i + 2] * a + 255 * (1 - a));
  }
  return new Blob([header, pixels], { type: "image/tiff" });
}
