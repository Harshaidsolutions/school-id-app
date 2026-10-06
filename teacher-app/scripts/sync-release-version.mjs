/** Keep an existing native project version aligned without regenerating it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {expo} = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const target = path.join(root, 'android/app/build.gradle');
if (!fs.existsSync(target)) throw new Error('Run in the existing Android build folder: android/app/build.gradle is missing.');
let text = fs.readFileSync(target, 'utf8');
if (!/versionCode\s+\d+/.test(text) || !/versionName\s+["'][^"']+["']/.test(text)) {
  throw new Error('Native version format is unfamiliar. No files changed.');
}
text = text.replace(/versionCode\s+\d+/, `versionCode ${expo.android.versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${expo.version}"`);
fs.writeFileSync(target, text);
console.log(`Native release version: ${expo.version} (${expo.android.versionCode})`);
