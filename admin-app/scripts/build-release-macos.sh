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
cd "$APP_DIR/android"
chmod +x gradlew
./gradlew assembleRelease
APK="$APP_DIR/android/app/build/outputs/apk/release/app-release.apk"
[[ -s "$APK" ]] || { echo 'Release APK was not generated.'; exit 1; }
CERT="$APP_DIR/output/admin-signing-certificate.der"
keytool -exportcert -keystore "$ADMIN_KEYSTORE_PATH" -storepass:env ADMIN_KEYSTORE_PASSWORD -alias school-id-admin -file "$CERT"
FINGERPRINT="$(openssl x509 -inform DER -in "$CERT" -noout -fingerprint -sha256 | cut -d= -f2)"
printf 'ADMIN_ANDROID_CERT_SHA256=%s\n' "$FINGERPRINT" > "$APP_DIR/output/admin-android.env"
python3 - "$FINGERPRINT" "$APP_DIR/output/assetlinks.json" <<'PY'
import json,sys
with open(sys.argv[2],'w') as f:
 json.dump([{'relation':['delegate_permission/common.handle_all_urls'],'target':{'namespace':'android_app','package_name':'com.schoolid.admin','sha256_cert_fingerprints':[sys.argv[1]]}}],f,indent=2)
PY
cp "$APK" "$HOME/Desktop/MySchoolIDCard-Admin-v1.0.0.apk"
echo "APK saved: $HOME/Desktop/MySchoolIDCard-Admin-v1.0.0.apk"
echo "Association file: $APP_DIR/output/assetlinks.json"
echo 'Back up ~/.school-id-admin-signing/admin-release.jks and your password securely.'
echo 'Deploy the certificate association on EC2 before testing fullscreen mode. See admin-app/README.md.'
