import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { fetchImageBytes } from "../config/storage";

export interface IdCardStudent {
  id: string;
  name: string;
  class: string;
  roll_no: string | null;
  photo_url: string | null;
}

const POINTS_PER_INCH = 72;

// A4 in points
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

const CARD_WIDTH = 3.5 * POINTS_PER_INCH; // 252 pt
const CARD_HEIGHT = 2.2 * POINTS_PER_INCH; // 158.4 pt

const PAGE_MARGIN = 0.4 * POINTS_PER_INCH; // 28.8 pt
const GUTTER = 0.2 * POINTS_PER_INCH; // 14.4 pt

function computeGrid(): { cols: number; rows: number; perPage: number } {
  const usableWidth = A4_WIDTH - 2 * PAGE_MARGIN;
  const usableHeight = A4_HEIGHT - 2 * PAGE_MARGIN;

  const cols = Math.max(
    1,
    Math.floor((usableWidth + GUTTER) / (CARD_WIDTH + GUTTER))
  );
  const rows = Math.max(
    1,
    Math.floor((usableHeight + GUTTER) / (CARD_HEIGHT + GUTTER))
  );

  return { cols, rows, perPage: cols * rows };
}

function sanitizeText(text: string): string {
  // WinAnsi (StandardFonts) can't encode arbitrary unicode; strip unsupported chars.
  // eslint-disable-next-line no-control-regex
  return text.replace(/[^\x00-\xFF]/g, "").trim();
}

function truncateToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string {
  let result = text;
  while (result.length > 0 && font.widthOfTextAtSize(result, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  if (result.length < text.length && result.length > 1) {
    result = result.slice(0, -1) + "…".replace(/[^\x00-\xFF]/g, ".");
  }
  return result;
}

async function embedPhoto(
  pdfDoc: PDFDocument,
  student: IdCardStudent,
  cache: Map<string, PDFImage | null>
): Promise<PDFImage | null> {
  if (!student.photo_url) {
    return null;
  }

  if (cache.has(student.photo_url)) {
    return cache.get(student.photo_url) ?? null;
  }

  const fetched = await fetchImageBytes(student.photo_url);
  if (!fetched) {
    cache.set(student.photo_url, null);
    return null;
  }

  let image: PDFImage | null = null;
  try {
    if (
      fetched.contentType.includes("png") ||
      student.photo_url.toLowerCase().includes(".png")
    ) {
      image = await pdfDoc.embedPng(fetched.bytes);
    } else {
      image = await pdfDoc.embedJpg(fetched.bytes);
    }
  } catch {
    // Fallback: try the other format before giving up
    try {
      image = await pdfDoc.embedPng(fetched.bytes);
    } catch {
      try {
        image = await pdfDoc.embedJpg(fetched.bytes);
      } catch {
        image = null;
      }
    }
  }

  cache.set(student.photo_url, image);
  return image;
}

function drawCard(
  page: PDFPage,
  x: number,
  y: number,
  student: IdCardStudent,
  photo: PDFImage | null,
  font: PDFFont,
  boldFont: PDFFont
): void {
  // Card border
  page.drawRectangle({
    x,
    y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const padding = 10;
  const photoBoxSize = CARD_HEIGHT - 2 * padding;
  const photoX = x + padding;
  const photoY = y + padding;

  // Photo area
  if (photo) {
    const scale = Math.min(
      photoBoxSize / photo.width,
      photoBoxSize / photo.height
    );
    const drawWidth = photo.width * scale;
    const drawHeight = photo.height * scale;
    page.drawImage(photo, {
      x: photoX + (photoBoxSize - drawWidth) / 2,
      y: photoY + (photoBoxSize - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  } else {
    page.drawRectangle({
      x: photoX,
      y: photoY,
      width: photoBoxSize,
      height: photoBoxSize,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
      color: rgb(0.95, 0.95, 0.95),
    });
    page.drawText("No Photo", {
      x: photoX + 12,
      y: photoY + photoBoxSize / 2,
      size: 9,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  const textX = photoX + photoBoxSize + 12;
  const textMaxWidth = x + CARD_WIDTH - padding - textX;
  let textY = y + CARD_HEIGHT - padding - 14;

  const name = truncateToWidth(
    sanitizeText(student.name) || "Unknown",
    boldFont,
    12,
    textMaxWidth
  );
  page.drawText(name, {
    x: textX,
    y: textY,
    size: 12,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1),
  });

  textY -= 22;
  page.drawText(`Class: ${sanitizeText(student.class)}`, {
    x: textX,
    y: textY,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  textY -= 16;
  page.drawText(`Roll No: ${sanitizeText(student.roll_no ?? "")}`, {
    x: textX,
    y: textY,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
}

/**
 * Generates a print-ready A4 PDF with multiple ID cards per page.
 * Returns the PDF bytes.
 */
export async function generateIdCardsPdf(
  students: IdCardStudent[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { cols, rows, perPage } = computeGrid();
  const photoCache = new Map<string, PDFImage | null>();

  let page: PDFPage | null = null;

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    if (!student) continue;

    const indexOnPage = i % perPage;
    if (indexOnPage === 0) {
      page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    }
    if (!page) continue;

    const col = indexOnPage % cols;
    const row = Math.floor(indexOnPage / cols);

    const x = PAGE_MARGIN + col * (CARD_WIDTH + GUTTER);
    // y is measured from the bottom in pdf-lib; place rows top-to-bottom
    const y =
      A4_HEIGHT - PAGE_MARGIN - CARD_HEIGHT - row * (CARD_HEIGHT + GUTTER);

    const photo = await embedPhoto(pdfDoc, student, photoCache);
    drawCard(page, x, y, student, photo, font, boldFont);
  }

  return pdfDoc.save();
}

export const ID_CARD_LAYOUT = computeGrid();
