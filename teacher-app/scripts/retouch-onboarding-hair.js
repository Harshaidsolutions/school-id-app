/**
 * Aggressively darken white/gray hair streak artifacts near dark hair pixels.
 */
const { Jimp, rgbaToInt } = require("jimp");
const path = require("path");

const SRC = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "../assets/onboarding-3d-illustration-clean.png");
const OUT = path.join(__dirname, "../assets/onboarding-3d-illustration-clean.png");

async function main() {
  const img = await Jimp.read(SRC);
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const hair = { r: 22, g: 14, b: 10 };
  let changed = 0;

  // Two passes for stronger coverage
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = img.getPixelIndex(x, y);
        const a = img.bitmap.data[idx + 3];
        if (a < 30) continue;

        const r = img.bitmap.data[idx];
        const g = img.bitmap.data[idx + 1];
        const b = img.bitmap.data[idx + 2];
        const lum = (r + g + b) / 3;

        // Catch white AND light-gray streak pixels
        const isStreak =
          lum > 115 &&
          r > 100 &&
          g > 95 &&
          b > 90 &&
          Math.abs(r - g) < 55 &&
          Math.abs(g - b) < 55 &&
          // not pure green UI / not yellow folder
          !(g > r + 40 && g > b + 20) &&
          !(r > 180 && g > 140 && b < 100);

        if (!isStreak) continue;

        let darkN = 0;
        let skinN = 0;
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nIdx = img.getPixelIndex(nx, ny);
            if (img.bitmap.data[nIdx + 3] < 30) continue;
            const nr = img.bitmap.data[nIdx];
            const ng = img.bitmap.data[nIdx + 1];
            const nb = img.bitmap.data[nIdx + 2];
            const nl = (nr + ng + nb) / 3;
            if (nl < 85 && nr < 100) darkN++;
            // skin-ish
            if (nr > 140 && ng > 90 && ng < 180 && nb > 70 && nb < 160 && nr > nb) skinN++;
          }
        }

        // Prefer hair (near dark) over face highlights; allow if dark neighbors present
        if (darkN < 5) continue;
        if (skinN > darkN * 2 && lum < 200) continue;

        const t = Math.min(1, 0.55 + (lum - 115) / 140);
        const nr = Math.round(r * (1 - t) + hair.r * t);
        const ng = Math.round(g * (1 - t) + hair.g * t);
        const nb = Math.round(b * (1 - t) + hair.b * t);
        img.setPixelColor(rgbaToInt(nr, ng, nb, a), x, y);
        changed++;
      }
    }
  }

  await img.write(OUT);
  // also sync hero
  await img.write(path.join(__dirname, "../assets/onboarding-hero.png"));
  console.log(`Retouched ${changed} pixels → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
