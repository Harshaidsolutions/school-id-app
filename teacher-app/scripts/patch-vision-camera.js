/**
 * VisionCamera v5 declares `"react-native": "src/index"`.
 * Metro on Windows often fails resolving sibling TS files from that entry.
 */
const fs = require("fs");
const path = require("path");

function patchPkg(relDir, reactNativeEntry) {
  const pkgPath = path.join(__dirname, "..", "node_modules", relDir, "package.json");
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (pkg["react-native"] === reactNativeEntry) return;
  pkg["react-native"] = reactNativeEntry;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[patch-vision-camera] patched ${relDir}`);
}

patchPkg("react-native-vision-camera", "lib/index");
patchPkg("react-native-vision-camera-face-detector", "lib/module/index");
