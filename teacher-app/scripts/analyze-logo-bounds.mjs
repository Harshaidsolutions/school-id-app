import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const logoPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "mascot-id-card.png"
);

const { data, info } = await sharp(logoPath)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

let minA = 255;
let maxA = 0;
let lowAlpha = 0;
let corners = [];

for (const [cx, cy] of [
  [0, 0],
  [info.width - 1, 0],
  [0, info.height - 1],
  [info.width - 1, info.height - 1],
  [50, 50],
  [info.width - 51, 50],
]) {
  const i = (cy * info.width + cx) * 4;
  corners.push({ cx, cy, rgba: [data[i], data[i + 1], data[i + 2], data[i + 3]] });
}

for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a < minA) minA = a;
    if (a > maxA) maxA = a;
    if (a < 32) lowAlpha++;
  }
}

console.log({ size: `${info.width}x${info.height}`, minA, maxA, lowAlpha, corners });
