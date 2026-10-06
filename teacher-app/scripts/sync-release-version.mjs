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

// Gradle assembleRelease does not apply Expo's display name to an existing project.
const resRoot = path.join(root, 'android/app/src/main/res');
const escapedName = expo.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
for (const entry of fs.readdirSync(resRoot, {withFileTypes:true})) {
  if (!entry.isDirectory() || !entry.name.startsWith('values')) continue;
  const strings = path.join(resRoot, entry.name, 'strings.xml');
  if (!fs.existsSync(strings)) continue;
  let xml = fs.readFileSync(strings, 'utf8');
  if (/<string\b[^>]*name="app_name"[^>]*>[\s\S]*?<\/string>/.test(xml)) {
    xml = xml.replace(/<string\b[^>]*name="app_name"[^>]*>[\s\S]*?<\/string>/g, `<string name="app_name">${escapedName}</string>`);
  } else if (entry.name === 'values') {
    xml = xml.replace('</resources>', `<string name="app_name">${escapedName}</string>\n</resources>`);
  }
  fs.writeFileSync(strings, xml);
}
const manifestPath = path.join(root, 'android/app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
manifest = manifest.replace(/<application\b[^>]*>/, tag => {
  for (const [attr, value] of Object.entries({label:'@string/app_name',icon:'@mipmap/ic_launcher',roundIcon:'@mipmap/ic_launcher_round'})) {
    const pattern = new RegExp(`android:${attr}="[^"]*"`);
    tag = pattern.test(tag) ? tag.replace(pattern, `android:${attr}="${value}"`) : tag.replace(/\/?>$/, ending => ` android:${attr}="${value}"${ending}`);
  }
  return tag;
});
manifest = manifest.replace(/<activity\b[^>]*>/g, tag => {
  if (/android:name="[^"]*MainActivity"/.test(tag)) return tag.replace(/android:label="[^"]*"/, 'android:label="@string/app_name"');
  return tag;
});
fs.writeFileSync(manifestPath, manifest);
console.log(`Native launcher name: ${expo.name}`);
