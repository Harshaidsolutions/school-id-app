/**
 * Build transparent in-app logo from attached reference artwork.
 * Edge-connected flood fill preserves white ID card interior.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const output = path.join(assets, "in-app-logo.png");
const legacyOutput = path.join(assets, "app-logo-transparent.png");
const input = process.argv[2] ?? path.join(assets, "app-logo-source.png");

if (!fs.existsSync(input)) {
  console.error("Input not found:", input);
  process.exit(1);
}

function isBackground(r, g, b, a) {
  if (a < 8) return true;
  const lum = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return lum >= 230 && spread <= 40;
}

function floodFillBackground(data, width, height) {
  const visited = new Uint8Array(width * height);
  const queue = [];
  const idx = (x, y) => y * width + x;

  function tryAdd(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const p = i * 4;
    if (!isBackground(data[p], data[p + 1], data[p + 2], data[p + 3])) return;
    visited[i] = 1;
    queue.push(i);
  }

  for (let x = 0; x < width; x++) {
    tryAdd(x, 0);
    tryAdd(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    tryAdd(0, y);
    tryAdd(width - 1, y);
  }

  while (queue.length) {
    const i = queue.pop();
    const x = i % width;
    const y = Math.floor(i / width);
    tryAdd(x - 1, y);
    tryAdd(x + 1, y);
    tryAdd(x, y - 1);
    tryAdd(x, y + 1);
  }

  for (let i = 0; i < width * height; i++) {
    if (visited[i]) data[i * 4 + 3] = 0;
  }
}

function defringeHalos(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const spread =
      Math.max(data[i], data[i + 1], data[i + 2]) -
      Math.min(data[i], data[i + 1], data[i + 2]);
    if (lum >= 205 && spread <= 45) {
      const t = Math.min(1, (lum - 205) / 50);
      data[i + 3] = Math.round(data[i + 3] * (1 - t * 0.95));
    }
  }
}

function isGreen(r, g, b, a) {
  if (a < 16) return false;
  return g >= 70 && g > r + 18 && g > b + 12;
}

/** Pale mint-green fill between card and swoosh (not the vibrant main arc). */
function isPaleGreenArtifact(r, g, b, a) {
  if (a < 16) return false;
  if (g < 90 || g <= r || g <= b) return false;
  const dominance = g - Math.max(r, b);
  const lum = (r + g + b) / 3;
  return dominance >= 6 && dominance <= 55 && lum >= 88 && lum <= 215;
}

/** Semi-transparent fringe between card and swoosh reads as green on orange headers. */
function removeSemiTransparentCardEdgeHalo(data, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const a = data[p + 3];
      if (a < 8 || a >= 252) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const lum = (r + g + b) / 3;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const greenTint = g - Math.max(r, b);
      const inRightWedge =
        x >= width * 0.54 &&
        x <= width * 0.9 &&
        y >= height * 0.36 &&
        y <= height * 0.58;
      const inLeftWedge =
        x >= width * 0.34 &&
        x <= width * 0.46 &&
        y >= height * 0.28 &&
        y <= height * 0.36;
      if (!inRightWedge && !inLeftWedge) continue;
      if (a < 220 && lum >= 120 && spread <= 55) {
        data[p + 3] = 0;
        continue;
      }
      if (greenTint >= 2 && g >= 200 && a < 180) {
        data[p + 3] = 0;
      }
    }
  }
}

/** Any green-tinted pixel in the card/swoosh gap (not the vibrant main arc). */
function isWedgeGreen(r, g, b, a) {
  if (a < 16) return false;
  if (isGreen(r, g, b, a) || isPaleGreenArtifact(r, g, b, a)) return true;
  const dominance = g - Math.max(r, b);
  const lum = (r + g + b) / 3;
  return dominance >= 4 && g >= 85 && lum >= 80 && lum <= 220;
}

/** Targeted cleanup: pale green fill wedged between card right edge and swoosh. */
function removeCardRightWedgeGreen(data, width, height) {
  const xMin = Math.round(width * 0.57);
  const xMax = Math.round(width * 0.76);
  const yMin = Math.round(height * 0.36);
  const yMax = Math.round(height * 0.58);
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      const p = (y * width + x) * 4;
      if (data[p + 3] < 8) continue;
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      if (isWedgeGreen(r, g, b, data[p + 3])) {
        data[p + 3] = 0;
      }
    }
  }
}

function removePaleGreenArtifacts(data, width, height) {
  const idx = (x, y) => y * width + x;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      const p = i * 4;
      if (!isPaleGreenArtifact(data[p], data[p + 1], data[p + 2], data[p + 3])) {
        continue;
      }
      let nearDark = false;
      for (let dy = -2; dy <= 2 && !nearDark; dy++) {
        for (let dx = -2; dx <= 2 && !nearDark; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = idx(nx, ny) * 4;
          if (isDark(data[np], data[np + 1], data[np + 2], data[np + 3])) {
            nearDark = true;
          }
        }
      }
      if (nearDark) data[p + 3] = 0;
    }
  }
}

function isDark(r, g, b, a) {
  if (a < 16) return false;
  return (r + g + b) / 3 < 72;
}

/** Remove green blobs that touch the dark ID card but are not the main swoosh. */
function removeGreenAdjacentToCard(data, width, height, maxPixels = 6500) {
  const idx = (x, y) => y * width + x;
  const visited = new Uint8Array(width * height);

  function isGreenAt(i) {
    const p = i * 4;
    return isGreen(data[p], data[p + 1], data[p + 2], data[p + 3]);
  }

  function isDarkAt(i) {
    const p = i * 4;
    return isDark(data[p], data[p + 1], data[p + 2], data[p + 3]);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (visited[start] || !isGreenAt(start)) continue;

      const queue = [start];
      visited[start] = 1;
      const component = [start];
      let touchesDark = false;

      while (queue.length) {
        const i = queue.pop();
        const cx = i % width;
        const cy = Math.floor(i / width);
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = idx(nx, ny);
          if (!visited[ni]) {
            if (isDarkAt(ni)) touchesDark = true;
            if (isGreenAt(ni)) {
              visited[ni] = 1;
              queue.push(ni);
              component.push(ni);
            }
          } else if (isDarkAt(ni)) {
            touchesDark = true;
          }
        }
      }

      if (touchesDark && component.length <= maxPixels) {
        for (const i of component) {
          data[i * 4 + 3] = 0;
        }
      }
    }
  }
}

/** Drop small enclosed green blobs (e.g. teardrop between card edge and swoosh). */
function removeSmallGreenIslands(data, width, height, maxPixels = 4200) {
  const idx = (x, y) => y * width + x;
  const visited = new Uint8Array(width * height);

  function isGreenAt(i) {
    const p = i * 4;
    return isGreen(data[p], data[p + 1], data[p + 2], data[p + 3]);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = idx(x, y);
      if (visited[start] || !isGreenAt(start)) continue;

      const queue = [start];
      visited[start] = 1;
      const component = [start];
      let touchesBorder = false;

      while (queue.length) {
        const i = queue.pop();
        const cx = i % width;
        const cy = Math.floor(i / width);
        if (cx === 0 || cy === 0 || cx === width - 1 || cy === height - 1) {
          touchesBorder = true;
        }
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = idx(nx, ny);
          if (visited[ni] || !isGreenAt(ni)) continue;
          visited[ni] = 1;
          queue.push(ni);
          component.push(ni);
        }
      }

      if (component.length <= maxPixels && !touchesBorder) {
        for (const i of component) {
          data[i * 4 + 3] = 0;
        }
      }
    }
  }
}

function removeWhiteHaloAtGreenBoundary(data, width, height) {
  const idx = (x, y) => y * width + x;
  const sample = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return null;
    const p = idx(x, y) * 4;
    return {
      r: data[p],
      g: data[p + 1],
      b: data[p + 2],
      a: data[p + 3],
    };
  };

  for (let pass = 0; pass < 6; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = idx(x, y) * 4;
        if (data[p + 3] < 8) continue;
        const lum = (data[p] + data[p + 1] + data[p + 2]) / 3;
        const spread =
          Math.max(data[p], data[p + 1], data[p + 2]) -
          Math.min(data[p], data[p + 1], data[p + 2]);
        if (lum < 165 || spread > 42) continue;

        let greens = [];
        let strongWhite = 0;
        let nearDark = false;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const n = sample(x + dx, y + dy);
            if (!n || n.a < 8) continue;
            const nLum = (n.r + n.g + n.b) / 3;
            const nSpread =
              Math.max(n.r, n.g, n.b) - Math.min(n.r, n.g, n.b);
            if (isDark(n.r, n.g, n.b, n.a)) nearDark = true;
            if (isGreen(n.r, n.g, n.b, n.a)) greens.push(n);
            if (nLum >= 220 && nSpread <= 28 && n.a > 200) strongWhite++;
          }
        }
        if (!greens.length) continue;

        if (nearDark) {
          data[p + 3] = 0;
          continue;
        }

        if (greens.length >= strongWhite || data[p + 3] < 240) {
          data[p + 3] = 0;
        }
      }
    }
  }
}

const { data, info } = await sharp(input)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

floodFillBackground(data, info.width, info.height);
removeWhiteHaloAtGreenBoundary(data, info.width, info.height);
removeGreenAdjacentToCard(data, info.width, info.height);
removeSmallGreenIslands(data, info.width, info.height);
removePaleGreenArtifacts(data, info.width, info.height);
removeCardRightWedgeGreen(data, info.width, info.height);
removeSemiTransparentCardEdgeHalo(data, info.width, info.height);
defringeHalos(data);
removeWhiteHaloAtGreenBoundary(data, info.width, info.height);
removeGreenAdjacentToCard(data, info.width, info.height);
removeSmallGreenIslands(data, info.width, info.height);
removePaleGreenArtifacts(data, info.width, info.height);
removeCardRightWedgeGreen(data, info.width, info.height);
removeSemiTransparentCardEdgeHalo(data, info.width, info.height);

/** Remove semi-opaque light fringe that reads as a white box on gradient splash. */
function removeSplashLightFringe(data) {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 8 || a >= 252) continue;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const spread =
      Math.max(data[i], data[i + 1], data[i + 2]) -
      Math.min(data[i], data[i + 1], data[i + 2]);
    if (a < 240 && lum >= 165 && spread <= 55) {
      data[i + 3] = 0;
    }
  }
}

const { data: trimmedData, info: trimmedInfo } = await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .trim({ threshold: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true });

await sharp(trimmedData, {
  raw: {
    width: trimmedInfo.width,
    height: trimmedInfo.height,
    channels: 4,
  },
})
  .png({ compressionLevel: 9 })
  .toFile(output);

const splashOutput = path.join(assets, "in-app-logo-splash.png");
const splashPixels = Buffer.from(trimmedData);
removeSplashLightFringe(splashPixels);
await sharp(splashPixels, {
  raw: {
    width: trimmedInfo.width,
    height: trimmedInfo.height,
    channels: 4,
  },
})
  .png({ compressionLevel: 9 })
  .toFile(splashOutput);
fs.copyFileSync(output, legacyOutput);

/** White silhouette for orange headers (Home, Drawer). */
const lightOutput = path.join(assets, "in-app-logo-light.png");
const colorMeta = await sharp(output).metadata();
const { data: colorPixels, info: colorInfo } = await sharp(output)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const lightPixels = Buffer.from(colorPixels);
for (let i = 0; i < lightPixels.length; i += 4) {
  if (lightPixels[i + 3] > 0) {
    lightPixels[i] = 255;
    lightPixels[i + 1] = 255;
    lightPixels[i + 2] = 255;
  }
}
await sharp(lightPixels, {
  raw: {
    width: colorInfo.width,
    height: colorInfo.height,
    channels: 4,
  },
})
  .png({ compressionLevel: 9 })
  .toFile(lightOutput);

const androidAssets = path.join(__dirname, "..", "android", "app", "src", "main", "assets");
fs.mkdirSync(androidAssets, { recursive: true });
fs.copyFileSync(output, path.join(androidAssets, "in-app-logo.png"));
fs.copyFileSync(lightOutput, path.join(androidAssets, "in-app-logo-light.png"));
fs.copyFileSync(splashOutput, path.join(androidAssets, "in-app-logo-splash.png"));

const meta = colorMeta;
console.log("Wrote", output, `(${meta.width}x${meta.height})`);
console.log("Wrote", lightOutput);
console.log("Wrote", splashOutput);
console.log("Synced android/app/src/main/assets/in-app-logo.png + in-app-logo-light.png");

/** Screen proofs for QA */
const logoBuf = await sharp(output).png().toBuffer();
const lightLogoBuf = await sharp(lightOutput).png().toBuffer();
const proofs = [
  { name: "login-proof.png", bg: { r: 249, g: 249, b: 247 }, w: 390, h: 520, logoW: 125, top: 24, logo: logoBuf },
  { name: "home-header-proof.png", bg: { r: 245, g: 97, b: 20 }, w: 390, h: 120, logoW: 52, top: 28, logo: logoBuf },
  { name: "onboarding-proof.png", bg: { r: 255, g: 255, b: 255 }, w: 390, h: 420, logoW: 140, top: 80, logo: logoBuf },
  { name: "drawer-header-proof.png", bg: { r: 245, g: 97, b: 20 }, w: 320, h: 100, logoW: 54, top: 18, logo: logoBuf },
];

for (const p of proofs) {
  const resized = await sharp(p.logo)
    .resize(p.logoW, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const lm = await sharp(resized).metadata();
  const left = Math.round((p.w - (lm.width ?? p.logoW)) / 2);
  const outPath = path.join(assets, p.name);
  await sharp({
    create: { width: p.w, height: p.h, channels: 4, background: { ...p.bg, alpha: 1 } },
  })
    .composite([{ input: resized, left, top: p.top }])
    .png()
    .toFile(outPath);
  const desktop = path.join(
    process.env.USERPROFILE ?? "",
    "Desktop",
    p.name
  );
  if (process.env.USERPROFILE) fs.copyFileSync(outPath, desktop);
  console.log("Proof:", outPath);
}

/** Close-up on orange — confirms white halo removal between card and green swoosh. */
const closeupPath = path.join(assets, "logo-header-closeup-proof.png");
const closeupDesktop = path.join(
  process.env.USERPROFILE ?? "",
  "Desktop",
  "logo-header-closeup-proof.png"
);
const logoMeta = await sharp(output).metadata();
const cropW = Math.round((logoMeta.width ?? 281) * 0.62);
const cropH = Math.round((logoMeta.height ?? 355) * 0.58);
const cropLeft = Math.round((logoMeta.width ?? 281) * 0.12);
const cropTop = Math.round((logoMeta.height ?? 355) * 0.28);
const cropped = await sharp(output)
  .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
  .resize(520, null, { fit: "inside", kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer();
const croppedMeta = await sharp(cropped).metadata();
await sharp({
  create: {
    width: (croppedMeta.width ?? 520) + 48,
    height: (croppedMeta.height ?? 520) + 48,
    channels: 4,
    background: { r: 245, g: 97, b: 20, alpha: 1 },
  },
})
  .composite([{ input: cropped, left: 24, top: 24 }])
  .png()
  .toFile(closeupPath);
if (process.env.USERPROFILE) fs.copyFileSync(closeupPath, closeupDesktop);
console.log("Close-up proof:", closeupPath);
