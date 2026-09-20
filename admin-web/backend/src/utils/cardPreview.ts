import sharp, { type OverlayOptions } from "sharp";
import { fetchImageBytes, uploadCardPreview } from "../config/storage";

export interface CardPreviewInput {
  studentId: string;
  schoolId: string;
  name: string;
  className: string;
  rollNo: string;
  photoUrl: string | null;
  templateImageUrl: string | null;
  schoolName: string | null;
}

/**
 * Renders a simple ID card preview PNG:
 * - Uses template image as background when available, otherwise a green placeholder card
 * - Composites the student photo on the left
 * - Overlays name / class / roll via SVG text
 */
export async function renderCardPreviewPng(
  input: CardPreviewInput
): Promise<{ png: Buffer; previewUrl: string; previewBase64: string }> {
  const width = 640;
  const height = 400;

  let base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 22, g: 163, b: 74 },
    },
  });

  if (input.templateImageUrl) {
    const fetched = await fetchImageBytes(input.templateImageUrl);
    if (fetched) {
      base = sharp(Buffer.from(fetched.bytes)).resize(width, height, {
        fit: "cover",
      });
    }
  }

  const composites: OverlayOptions[] = [];

  const photoSize = 160;
  const photoLeft = 40;
  const photoTop = 80;

  if (input.photoUrl) {
    const photo = await fetchImageBytes(input.photoUrl);
    if (photo) {
      const photoBuf = await sharp(Buffer.from(photo.bytes))
        .resize(photoSize, photoSize, { fit: "cover" })
        .jpeg()
        .toBuffer();
      composites.push({
        input: photoBuf,
        left: photoLeft,
        top: photoTop,
      });
    }
  } else {
    const placeholder = await sharp({
      create: {
        width: photoSize,
        height: photoSize,
        channels: 3,
        background: { r: 226, g: 232, b: 240 },
      },
    })
      .jpeg()
      .toBuffer();
    composites.push({
      input: placeholder,
      left: photoLeft,
      top: photoTop,
    });
  }

  const escapeXml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const schoolLabel = escapeXml(input.schoolName ?? "School ID");
  const name = escapeXml(input.name);
  const klass = escapeXml(input.className);
  const roll = escapeXml(input.rollNo);

  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="56" fill="rgba(0,0,0,0.35)"/>
      <text x="24" y="36" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${schoolLabel}</text>
      <text x="230" y="120" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#0f172a">${name}</text>
      <text x="230" y="165" font-family="Arial, sans-serif" font-size="20" fill="#334155">Class: ${klass}</text>
      <text x="230" y="200" font-family="Arial, sans-serif" font-size="20" fill="#334155">Roll No: ${roll}</text>
      <rect x="24" y="${height - 48}" width="${width - 48}" height="28" rx="8" fill="rgba(22,163,74,0.9)"/>
      <text x="40" y="${height - 28}" font-family="Arial, sans-serif" font-size="14" fill="#ffffff">Harsha ID Solutions — Preview</text>
    </svg>
  `);

  composites.push({ input: svg, left: 0, top: 0 });

  const png = await base.composite(composites).png().toBuffer();
  const previewUrl = await uploadCardPreview(input.schoolId, input.studentId, png);
  const previewBase64 = `data:image/png;base64,${png.toString("base64")}`;

  return { png, previewUrl, previewBase64 };
}
