#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
[[ -d "$ANDROID_HOME/platforms/android-36" ]] || { echo 'Install Android SDK Platform 36 using Android Studio > SDK Manager.'; exit 1; }
command -v keytool >/dev/null || { echo 'Install JDK 17 or 21 first.'; exit 1; }
umask 077
SIGNING_DIR="$HOME/.school-id-admin-signing"
mkdir -p "$SIGNING_DIR" "$APP_DIR/output"
export ADMIN_KEYSTORE_PATH="$SIGNING_DIR/admin-release.jks"
read -r -s -p 'Admin signing password (keep it for future builds): ' ADMIN_KEYSTORE_PASSWORD
printf '\n'
export ADMIN_KEYSTORE_PASSWORD
trap 'unset ADMIN_KEYSTORE_PASSWORD' EXIT
if [[ ! -f "$ADMIN_KEYSTORE_PATH" ]]; then
  [[ ${#ADMIN_KEYSTORE_PASSWORD} -ge 6 ]] || { echo 'Use at least 6 characters.'; exit 1; }
  read -r -s -p 'Confirm signing password: ' CONFIRM_PASSWORD
  printf '\n'
  [[ "$CONFIRM_PASSWORD" == "$ADMIN_KEYSTORE_PASSWORD" ]] || { echo 'Passwords did not match.'; exit 1; }
  unset CONFIRM_PASSWORD
  keytool -genkeypair -keystore "$ADMIN_KEYSTORE_PATH" -storepass:env ADMIN_KEYSTORE_PASSWORD -keypass:env ADMIN_KEYSTORE_PASSWORD -alias school-id-admin -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=My School ID Admin, O=Harsha ID Solutions, C=IN'
fi
keytool -list -keystore "$ADMIN_KEYSTORE_PATH" -storepass:env ADMIN_KEYSTORE_PASSWORD -alias school-id-admin >/dev/null
REPO_DIR="$(cd "$APP_DIR/.." && pwd)"
command -v npm >/dev/null || { echo 'Install Node.js 20+ first (same as for the teacher app).'; exit 1; }
echo ""
echo "Step 1/2: Building all admin screens (admin-web)…"
cd "$REPO_DIR/admin-web"
npm install --include=dev --no-audit --no-fund
npx vite build
[[ -s dist/index.html ]] || { echo 'Admin screens build failed.'; exit 1; }
echo ""
echo "Step 2/2: Building the Android APK…"
cd "$APP_DIR/android"
chmod +x gradlew
./gradlew clean assembleRelease bundleRelease
APK="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -s "$APK" ]] || { echo 'Release APK was not generated.'; exit 1; }
VERSION="$(sed -n "s/.*versionName '\\(.*\\)'.*/\\1/p" app/build.gradle | head -1)"
OUT="$HOME/Desktop/MySchoolIDCard-Admin-v${VERSION}.apk"
AAB="$APP_DIR/android/app/build/outputs/bundle/release/app-release.aab"
[[ -s "$AAB" ]] || { echo 'Play Store bundle (.aab) was not generated.'; exit 1; }
OUT_AAB="$HOME/Desktop/MySchoolIDCard-Admin-v${VERSION}-PlayStore.aab"
cp "$APK" "$OUT"
cp "$AAB" "$OUT_AAB"
"$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | tail -1)/apksigner" verify --print-certs "$OUT" | head -3 || true
echo ""
echo "DONE. Saved on your Desktop:"
echo "  Play Store upload file : $OUT_AAB"
echo "  Phone test file (APK)  : $OUT"
echo "Send it to the phone with WhatsApp (as Document) or Google Drive, then tap it to install."
echo "Back up ~/.school-id-admin-signing/admin-release.jks and your password securely."
