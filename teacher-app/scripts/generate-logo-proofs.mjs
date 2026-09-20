/**
 * QA proofs for v1.0.62 login logo at header size (wp(18) ≈ 70px on 390dp).
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const logoPath = path.join(assets, "in-app-logo.png");
const headerLogoW = 70;
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

const proofs = [
  {
    name: "logo-header-closeup-proof.png",
    w: (closeupMeta.width ?? 520) + 48,
    h: (closeupMeta.height ?? 520) + 48,
    layers: [{ input: closeup, left: 24, top: 24 }],
  },
  {
    name: "home-header-logo-proof.png",
    w: 390,
    h: 96,
    layers: [
      { input: headerLogo, left: 12, top: Math.round((96 - (headerMeta.height ?? 52)) / 2) },
      {
        input: Buffer.from(
          `<svg width="220" height="40">
            <text x="0" y="18" font-family="Arial" font-size="16" font-weight="800" fill="white">My School ID Card</text>
            <text x="0" y="34" font-family="Arial" font-size="11" fill="rgba(255,255,255,0.92)">Get Your Identity Here...</text>
          </svg>`
        ),
        left: 92,
        top: 28,
      },
    ],
  },
  {
    name: "drawer-header-logo-proof.png",
    w: 300,
    h: 88,
    layers: [
      { input: headerLogo, left: 16, top: Math.round((88 - (headerMeta.height ?? 52)) / 2) },
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
