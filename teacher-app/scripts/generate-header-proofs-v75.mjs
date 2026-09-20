/**
 * QA proofs — header logo (white card, compact) on Home + Drawer.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const logoPath = path.join(assets, "in-app-logo-header.png");
const headerLogoW = 50;
const orange = { r: 245, g: 97, b: 20 };

const logoBuf = await sharp(logoPath).png().toBuffer();
const headerLogo = await sharp(logoBuf)
  .resize(headerLogoW, null, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
const headerMeta = await sharp(headerLogo).metadata();

const closeup = await sharp(logoPath)
  .extract({ left: 40, top: 90, width: 200, height: 200 })
  .resize(520, 520, { fit: "inside", kernel: sharp.kernel.lanczos3 })
  .png()
  .toBuffer();
const closeupMeta = await sharp(closeup).metadata();

const titleSvg = Buffer.from(
  `<svg width="240" height="44">
    <text x="0" y="22" font-family="Arial" font-size="20" font-weight="800" fill="white">My School ID Card</text>
    <text x="0" y="38" font-family="Arial" font-size="11" fill="rgba(255,255,255,0.92)">Get Your Identity Here...</text>
  </svg>`
);

const proofs = [
  {
    name: "logo-header-closeup-v75-proof.png",
    w: (closeupMeta.width ?? 520) + 48,
    h: (closeupMeta.height ?? 520) + 48,
    layers: [{ input: closeup, left: 24, top: 24 }],
  },
  {
    name: "home-header-v75-proof.png",
    w: 390,
    h: 72,
    layers: [
      { input: headerLogo, left: 10, top: Math.round((72 - (headerMeta.height ?? 48)) / 2) },
      { input: titleSvg, left: 68, top: 14 },
    ],
  },
  {
    name: "drawer-header-v75-proof.png",
    w: 300,
    h: 64,
    layers: [
      { input: headerLogo, left: 12, top: Math.round((64 - (headerMeta.height ?? 48)) / 2) },
    ],
  },
];

for (const p of proofs) {
  const out = path.join(assets, p.name);
  await sharp({
    create: { width: p.w, height: p.h, channels: 4, background: { ...orange, alpha: 1 } },
  })
    .composite(p.layers)
    .png()
    .toFile(out);
  const desktop = path.join(process.env.USERPROFILE ?? "", "Desktop", p.name);
  if (process.env.USERPROFILE) fs.copyFileSync(out, desktop);
  console.log("Wrote", out);
}
