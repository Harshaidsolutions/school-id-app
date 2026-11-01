#!/usr/bin/env bash
# Build the existing teacher app on Apple Silicon/Intel macOS without changing package/signing identity.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -z "${JAVA_HOME:-}" ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || /usr/libexec/java_home -v 17)"
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export EXPO_PUBLIC_API_URL='https://myschoolidcard.in'
[[ -d "$ANDROID_HOME" ]] || { echo 'Install Android Studio and Android SDK using its SDK Manager first.'; exit 1; }
[[ -f google-services.json ]] || { echo 'Put the existing Firebase google-services.json for com.schoolid.teacher in teacher-app/. Notifications require it.'; exit 1; }
node -e 'const c=require("./google-services.json");if(!c.client?.some(x=>x.client_info?.android_client_info?.package_name==="com.schoolid.teacher"))throw Error("Wrong Firebase Android package")'
: "${SCHOOL_ID_KEYSTORE:?Set SCHOOL_ID_KEYSTORE to the existing production signing keystore path.}"
: "${SCHOOL_ID_KEY_ALIAS:?Set SCHOOL_ID_KEY_ALIAS to the existing production key alias.}"
[[ -f "$SCHOOL_ID_KEYSTORE" ]] || { echo 'Signing keystore not found.'; exit 1; }
# Read passwords locally. Do not paste signing secrets into chat or commit them.
read -r -s -p 'Keystore password: ' SCHOOL_ID_STORE_PASSWORD; printf '\n'
read -r -s -p 'Key password: ' SCHOOL_ID_KEY_PASSWORD; printf '\n'
export SCHOOL_ID_STORE_PASSWORD SCHOOL_ID_KEY_PASSWORD SCHOOL_ID_KEYSTORE SCHOOL_ID_KEY_ALIAS
trap 'unset SCHOOL_ID_STORE_PASSWORD SCHOOL_ID_KEY_PASSWORD' EXIT
npm ci
npm run assets:generate
npm run assets:verify
if [[ ! -f android/gradlew ]]; then
  # Generates native folders on a fresh Git clone; never --clean an existing native project.
  npx expo prebuild --platform android --no-install
fi
node scripts/verify-push-config.cjs
node scripts/sync-release-version.mjs
npm run android:network
cd android
chmod +x gradlew
# Sign with the keystore passed in the environment. Uses the Android Gradle Plugin's
# injected-signing properties (the same ones Android Studio uses), which work on new AGP versions.
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file="$SCHOOL_ID_KEYSTORE" \
  -Pandroid.injected.signing.store.password="$SCHOOL_ID_STORE_PASSWORD" \
  -Pandroid.injected.signing.key.alias="$SCHOOL_ID_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$SCHOOL_ID_KEY_PASSWORD"
VERSION="$(node -p 'require("../app.json").expo.version')"
TARGET="$HOME/Desktop/MySchoolIDCard-v$VERSION.apk"
cp app/build/outputs/apk/release/app-release.apk "$TARGET"
printf 'APK saved: %s\n' "$TARGET"
