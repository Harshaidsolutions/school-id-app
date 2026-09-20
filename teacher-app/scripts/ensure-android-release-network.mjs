/**
 * Release APK must allow HTTP to production EC2 (nginx on port 80).
 * app.json sets android.usesCleartextTraffic but the native android/ folder
 * is not regenerated on every Gradle build — patch the release manifest.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidRoot = path.join(__dirname, "..", "android");
const manifestPath = path.join(
  androidRoot,
  "app",
  "src",
  "main",
  "AndroidManifest.xml"
);
const xmlDir = path.join(androidRoot, "app", "src", "main", "res", "xml");
const networkConfigPath = path.join(xmlDir, "network_security_config.xml");

const NETWORK_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <!-- Production API: http://13.203.129.105/api (nginx → Express) -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">13.203.129.105</domain>
  </domain-config>
</network-security-config>
`;

function patchManifest() {
  if (!fs.existsSync(manifestPath)) {
    console.warn("Skip network patch — AndroidManifest not found:", manifestPath);
    return;
  }

  fs.mkdirSync(xmlDir, { recursive: true });
  fs.writeFileSync(networkConfigPath, NETWORK_CONFIG);

  let xml = fs.readFileSync(manifestPath, "utf8");
  let changed = false;

  if (!xml.includes('android:usesCleartextTraffic="true"')) {
    xml = xml.replace(
      /<application\b/,
      '<application android:usesCleartextTraffic="true"'
    );
    changed = true;
  }

  if (!xml.includes("networkSecurityConfig")) {
    xml = xml.replace(
      /<application\b([^>]*)>/,
      '<application$1 android:networkSecurityConfig="@xml/network_security_config">'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(manifestPath, xml);
    console.log("Patched release AndroidManifest for cleartext HTTP to production API.");
  } else {
    console.log("Release AndroidManifest already allows cleartext HTTP.");
  }

  console.log("Wrote", path.relative(androidRoot, networkConfigPath));
}

patchManifest();
