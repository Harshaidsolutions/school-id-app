/**
 * After release bundle, fail if mascot-id-card.png is missing from app.manifest.
 * Run against extracted APK assets/ or android/app/build output.
 */
import fs from "fs";
import path from "path";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node scripts/verify-bundle-manifest.mjs <path/to/app.manifest>");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const assets = manifest.assets ?? [];
const names = assets.map((a) => a.name ?? String(a));

const required = ["mascot-id-card", "in-app-logo"];
const forbidden = ["harsha-logo", "splash-id-lanyard"];

let failed = 0;

for (const name of required) {
  if (!names.includes(name)) {
    console.error("MISSING from bundle manifest:", name);
    failed++;
  } else {
    console.log("OK manifest has", name);
  }
}

for (const name of forbidden) {
  if (names.includes(name)) {
    console.error("STALE asset still in manifest (clear Metro cache):", name);
    failed++;
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log("\nBundle manifest logo assets verified.");
