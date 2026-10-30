// Adds the admin release signing key to android/app/build.gradle (after expo prebuild).
// Passwords are read from environment variables at build time, never written to disk.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "android", "app", "build.gradle");
let src = fs.readFileSync(file, "utf8");

if (!src.includes("adminRelease {")) {
  src = src.replace(
    /signingConfigs\s*\{/,
    `signingConfigs {
        adminRelease {
            storeFile file(System.getenv('ADMIN_KEYSTORE'))
            storePassword System.getenv('ADMIN_KEYSTORE_PASSWORD')
            keyAlias 'school-id-admin'
            keyPassword System.getenv('ADMIN_KEYSTORE_PASSWORD')
        }`
  );
}

// Point the release build type at the admin key.
const start = src.search(/buildTypes\s*\{/);
if (start < 0) throw new Error("buildTypes block not found in android/app/build.gradle");
const relIdx = src.indexOf("release {", start);
if (relIdx < 0) throw new Error("release build type not found");
const nextSigning = src.indexOf("signingConfig signingConfigs.", relIdx);
if (nextSigning >= 0) {
  const end = src.indexOf("\n", nextSigning);
  src = src.slice(0, nextSigning) + "signingConfig signingConfigs.adminRelease" + src.slice(end);
} else {
  src = src.replace("release {", "release {\n            signingConfig signingConfigs.adminRelease");
}

fs.writeFileSync(file, src);
console.log("Release signing set to the admin key.");
