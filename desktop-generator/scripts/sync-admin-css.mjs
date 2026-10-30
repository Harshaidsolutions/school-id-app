// Copies the admin design system CSS next to the renderer (without its own Tailwind import),
// so this app builds without installing admin-web's node_modules.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, "../../admin-web/src");
const out = path.resolve(here, "../renderer/generated");
fs.mkdirSync(out, { recursive: true });
const strip = (css) => css.replace(/^\s*@import\s+["']tailwindcss["'];?\s*$/m, "").replace(/^\s*@import\s+url\([^)]*\);?\s*$/gm, "");
fs.writeFileSync(path.join(out, "admin.css"), strip(fs.readFileSync(path.join(src, "index.css"), "utf8")));
fs.writeFileSync(path.join(out, "generator.css"), strip(fs.readFileSync(path.join(src, "theme/generator.css"), "utf8")));
console.log("admin CSS synced");
