/**
 * Crop transparent margins from mascot-id-card.png (ignores faint edge fringe).
 * Run: node scripts/trim-brand-logo.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const logoPath = path.join(root, "assets", "mascot-id-card.png");

const ROW_FILL = 0.35;
const COL_FILL = 0.1;
const ALPHA_MIN = 32;

function rowFill(data, width, y) {
  let count = 0;
  for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) count++;
  }
  return count / width;
}

function colFill(data, width, height, x) {
  let count = 0;
  for (let y = 0; y < height; y++) {
    if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) count++;
  }
  return count / height;
}

function findTrimBounds(data, width, height) {
  let top = 0;
  let bottom = height - 1;
  let left = 0;
  let right = width - 1;

  while (top < height && rowFill(data, width, top) < ROW_FILL) top++;
  while (bottom > top && rowFill(data, width, bottom) < ROW_FILL) bottom--;
  while (left < width && colFill(data, width, height, left) < COL_FILL) left++;
  while (right > left && colFill(data, width, height, right) < COL_FILL) right--;

  if (right <= left || bottom <= top) {
    return { left: 0, top: 0, width, height };
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

const meta = await sharp(logoPath).metadata();
const { data, info } = await sharp(logoPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const bounds = findTrimBounds(data, info.width, info.height);

const cropped = await sharp(logoPath)
  .extract(bounds)
  .png({ compressionLevel: 9 })
  .toBuffer({ resolveWithObject: true });

await sharp(cropped.data).toFile(logoPath);

console.log(
  "Cropped mascot-id-card.png:",
  `${meta.width}x${meta.height} -> ${cropped.info.width}x${cropped.info.height}`,
  `aspect=${(cropped.info.height / cropped.info.width).toFixed(4)}`
);
