/**
 * Launcher icons from in-app-logo.png — same artwork as Login screen AppIcon.
 * Run: node scripts/generate-icon-assets.mjs
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const loginLogoPath = path.join(assets, "in-app-logo.png");
const fallbackLogoPath = path.join(assets, "mascot-id-card.png");
const logoPath = fs.existsSync(loginLogoPath) ? loginLogoPath : fallbackLogoPath;

const SIZE = 1024;
const ORANGE = { r: 245, g: 129, b: 31, alpha: 1 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Android adaptive foreground: 66dp visible circle in 108dp layer. */
const ANDROID_SAFE_DIAMETER_RATIO = 66 / 108;
/** Small inset inside the safe circle so squircle/circle masks never clip. */
const ADAPTIVE_SAFE_INSET = 0.96;
/** Legacy square launcher — larger fill; no adaptive mask on older devices. */
const LEGACY_ICON_FILL = 0.8;
const SPLASH_LOGO_RATIO = 0.5;
const FAVICON_LOGO_RATIO = 0.34;

const LEGACY_LAUNCHER = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const ADAPTIVE_FOREGROUND = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

const TRANSPARENT_SPLASH_ICON = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#00000000"/>
  <size android:width="1dp" android:height="1dp"/>
</shape>
`;

async function loadLogo() {
  return sharp(logoPath).png().toBuffer();
}

async function logoAspect() {
  const meta = await sharp(logoPath).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  return w / h;
}

/** Largest axis-aligned logo rect inscribed in a centered circle. */
function dimensionsInSafeCircle(aspect, canvasSize, diameterRatio) {
  const maxDiameter = canvasSize * diameterRatio;
  const height = Math.round(maxDiameter / Math.sqrt(1 + aspect * aspect));
  const width = Math.round(height * aspect);
  return { width, height };
}

/** Largest logo rect centered on square canvas (legacy / iOS). */
function dimensionsInSquareBox(aspect, canvasSize, fillRatio) {
  const maxBox = canvasSize * fillRatio;
  let height = maxBox;
  let width = height * aspect;
  if (width > maxBox) {
    width = maxBox;
    height = width / aspect;
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
  };
}

async function composeLogoCanvas(outName, canvasSize, dims, bgColor, transparentBg) {
  const logo = await sharp(await loadLogo())
    .resize(dims.width, dims.height, {
      fit: "contain",
      background: TRANSPARENT,
    })
    .png()
    .toBuffer();

  const left = Math.round((canvasSize - dims.width) / 2);
  const top = Math.round((canvasSize - dims.height) / 2);

  await sharp({
    create: {
      width: canvasSize,
      height: canvasSize,
      channels: 4,
      background: transparentBg ? TRANSPARENT : bgColor,
    },
  })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(path.join(assets, outName));

  console.log(
    "Wrote",
    outName,
    `(logo ${dims.width}x${dims.height}px centered in ${canvasSize}px, top=${top}, bottom=${canvasSize - top - dims.height})`
  );
}

async function verifyIconBounds(fileName) {
  const filePath = path.join(assets, fileName);
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minY = info.height;
  let maxY = 0;
  let minX = info.width;
  let maxX = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a > 8) {
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }

  const padTop = minY;
  const padBottom = info.height - 1 - maxY;
  const padLeft = minX;
  const padRight = info.width - 1 - maxX;
  console.log(
    `[verify ${fileName}] content ${maxX - minX + 1}x${maxY - minY + 1}px padding T${padTop} B${padBottom} L${padLeft} R${padRight}`
  );

  if (padTop < 8 || padBottom < 8) {
    console.warn(`[verify ${fileName}] WARNING: top/bottom padding may be too tight for adaptive masks.`);
  }
}

async function syncLauncherIcons(aspect) {
  const legacyDims = dimensionsInSquareBox(aspect, SIZE, LEGACY_ICON_FILL);
  const splashDims = dimensionsInSquareBox(aspect, SIZE, SPLASH_LOGO_RATIO);
  await composeLogoCanvas("app-icon.png", SIZE, legacyDims, WHITE, false);
  await composeLogoCanvas("app-icon-ios.png", SIZE, legacyDims, WHITE, false);
  await composeLogoCanvas("splash-icon.png", SIZE, splashDims, ORANGE, false);

  const adaptiveDims = dimensionsInSafeCircle(
    aspect,
    SIZE,
    ANDROID_SAFE_DIAMETER_RATIO * ADAPTIVE_SAFE_INSET
  );
  await composeLogoCanvas(
    "adaptive-icon-foreground.png",
    SIZE,
    adaptiveDims,
    TRANSPARENT,
    true
  );

  const faviconDims = dimensionsInSquareBox(aspect, SIZE, FAVICON_LOGO_RATIO);
  await composeLogoCanvas("favicon.png", SIZE, faviconDims, WHITE, false);
  console.log("Synced launcher icons from", path.basename(logoPath));
}

async function composeOnboardingJpeg(srcName, outName, maxWidth = 900) {
  const src = path.join(assets, srcName);
  if (!fs.existsSync(src)) return;
  await sharp(src)
    .resize(maxWidth, maxWidth, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(path.join(assets, outName));
  console.log("Wrote", outName);
}

async function writeAndroidSplashDrawables() {
  const resRoot = path.join(__dirname, "..", "android", "app", "src", "main", "res");
  const drawableDir = path.join(resRoot, "drawable");
  if (fs.existsSync(drawableDir)) {
    fs.writeFileSync(
      path.join(drawableDir, "transparent_splash_icon.xml"),
      TRANSPARENT_SPLASH_ICON
    );
  }

  const launcherXml = path.join(resRoot, "mipmap-anydpi-v26", "ic_launcher.xml");
  const launcherRoundXml = path.join(resRoot, "mipmap-anydpi-v26", "ic_launcher_round.xml");
  for (const xmlPath of [launcherXml, launcherRoundXml]) {
    if (!fs.existsSync(xmlPath)) continue;
    let xml = fs.readFileSync(xmlPath, "utf8");
    xml = xml.replace(
      /@drawable\/ic_launcher_foreground_inset/g,
      "@mipmap/ic_launcher_foreground"
    );
    fs.writeFileSync(xmlPath, xml);
  }

  const folders = [
    "drawable-mdpi",
    "drawable-hdpi",
    "drawable-xhdpi",
    "drawable-xxhdpi",
    "drawable-xxxhdpi",
  ];
  for (const folder of folders) {
    const logo = path.join(resRoot, folder, "splashscreen_logo.png");
    if (fs.existsSync(logo)) fs.unlinkSync(logo);
  }

  const stylesPath = path.join(resRoot, "values", "styles.xml");
  if (fs.existsSync(stylesPath)) {
    let xml = fs.readFileSync(stylesPath, "utf8");
    xml = xml.replace(/@drawable\/splashscreen_logo/g, "@drawable/transparent_splash_icon");
    xml = xml.replace(
      /<item name="android:windowSplashScreenBehavior">icon_preferred<\/item>\s*/g,
      ""
    );
    fs.writeFileSync(stylesPath, xml);
  }

  console.log("Native splash: orange background only (no logo before branded splash).");
}

async function writeResizedIcon(srcPath, destPath, size, transparent = false) {
  const bg = transparent ? TRANSPARENT : WHITE;
  const ext = path.extname(destPath).toLowerCase();
  let pipeline = sharp(srcPath).resize(size, size, { fit: "contain", background: bg });
  if (ext === ".webp") {
    pipeline = pipeline.webp({ quality: 95 });
  } else {
    pipeline = pipeline.png();
  }
  await pipeline.toFile(destPath);
}

function removeDuplicateMipmap(basePath) {
  for (const ext of [".png", ".webp"]) {
    const file = `${basePath}${ext}`;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}

async function syncAndroidMipmaps() {
  const resRoot = path.join(__dirname, "..", "android", "app", "src", "main", "res");
  if (!fs.existsSync(resRoot)) {
    console.log("Android res/ not found — skip mipmap sync (run after prebuild).");
    return;
  }

  const appIcon = path.join(assets, "app-icon.png");
  const adaptiveFg = path.join(assets, "adaptive-icon-foreground.png");
  if (!fs.existsSync(appIcon) || !fs.existsSync(adaptiveFg)) {
    console.warn("Icon assets missing — skip mipmap sync.");
    return;
  }

  let wrote = 0;
  for (const [folder, size] of Object.entries(LEGACY_LAUNCHER)) {
    const dir = path.join(resRoot, folder);
    fs.mkdirSync(dir, {recursive:true});
    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      removeDuplicateMipmap(path.join(dir, name));
      const dest = path.join(dir, `${name}.webp`);
      await writeResizedIcon(appIcon, dest, size);
      wrote++;
    }
  }

  for (const [folder, size] of Object.entries(ADAPTIVE_FOREGROUND)) {
    const dir = path.join(resRoot, folder);
    fs.mkdirSync(dir, {recursive:true});
    removeDuplicateMipmap(path.join(dir, "ic_launcher_foreground"));
    const dest = path.join(dir, "ic_launcher_foreground.webp");
    await writeResizedIcon(adaptiveFg, dest, size, true);
    wrote++;
  }

  // Existing native folders may still reference an old foreground drawable.
  // Replace only launcher resources, preserving signing and Firebase settings.
  const adaptiveDir = path.join(resRoot, "mipmap-anydpi-v26");
  fs.mkdirSync(adaptiveDir, {recursive:true});
  const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@android:color/white" />
  <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
  for (const folder of fs.readdirSync(resRoot).filter(f => /^mipmap-anydpi-v[0-9]+$/.test(f))) {
    for (const name of ["ic_launcher", "ic_launcher_round"]) fs.writeFileSync(path.join(resRoot, folder, `${name}.xml`), adaptiveXml);
  }

  if (wrote > 0) {
    console.log(`Synced ${wrote} Android mipmap launcher file(s).`);
  } else {
    console.log("No mipmap folders yet — run expo prebuild first, then re-run assets:generate.");
  }
}

const aspect = await logoAspect();
console.log("Logo source:", path.basename(logoPath), "aspect", aspect.toFixed(3));

await syncLauncherIcons(aspect);
await composeOnboardingJpeg("onboarding-3d-illustration-clean.png", "onboarding-page2.jpg");
await writeAndroidSplashDrawables();
await syncAndroidMipmaps();

await verifyIconBounds("app-icon.png");
await verifyIconBounds("adaptive-icon-foreground.png");

console.log("Done.");
