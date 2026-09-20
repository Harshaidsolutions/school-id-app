/**
 * Header logo = login artwork (in-app-logo.png) with orange spark recolored white.
 * No card cropping or interior fill — pixel-identical to login except the star.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const input = path.join(assets, "in-app-logo.png");
const output = path.join(assets, "in-app-logo-header.png");

function isOrangeSpark(r, g, b, a) {
  if (a < 160) return false;
  return r >= 190 && g >= 70 && g <= 210 && b <= 110 && r > g && g > b;
}

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const { width, height } = info;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    if (x < width * 0.48 || y > height * 0.42) continue;
    const p = (y * width + x) * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const a = data[p + 3];
    if (isOrangeSpark(r, g, b, a)) {
      data[p] = 255;
      data[p + 1] = 255;
      data[p + 2] = 255;
      data[p + 3] = 255;
    }
  }
}

await sharp(data, { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);

const androidAssets = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "assets"
);
fs.mkdirSync(androidAssets, { recursive: true });
fs.copyFileSync(output, path.join(androidAssets, "in-app-logo-header.png"));
console.log("Wrote", output);
