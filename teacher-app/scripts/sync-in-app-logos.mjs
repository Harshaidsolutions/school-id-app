/**
 * Copy in-app logo PNGs into Android assets (optional belt-and-suspenders).
 * AppIcon uses Metro require() — this keeps asset:/ URIs working if reintroduced.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(__dirname, "..", "assets");
const androidAssets = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "src",
  "main",
  "assets"
);

const files = ["in-app-logo.png", "in-app-logo-header.png", "in-app-logo-light.png"];

fs.mkdirSync(androidAssets, { recursive: true });

for (const name of files) {
  const src = path.join(assets, name);
  if (!fs.existsSync(src)) {
    console.warn("Skip missing", name);
    continue;
  }
  fs.copyFileSync(src, path.join(androidAssets, name));
  console.log("Synced", name, "→ android assets");
}
