/**
 * Copies admin-web/dist → admin-web/backend/public for single-process serving.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adminRoot = path.join(__dirname, "..");
const src = path.join(adminRoot, "dist");
const dest = path.join(adminRoot, "backend", "public");

if (!fs.existsSync(src)) {
  console.error("dist/ not found. Run npm run build first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} → ${dest}`);
