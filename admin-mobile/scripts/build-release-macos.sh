#!/usr/bin/env bash
# Builds the native My School ID Admin app (APK for phones + AAB for Google Play) on a Mac.
# Same way as the teacher app: Expo prebuild + Gradle, signed with the admin release key.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [[ -z "${JAVA_HOME:-}" ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || /usr/libexec/java_home -v 21)"
fi
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
export EXPO_PUBLIC_API_URL='https://myschoolidcard.in'
export EXPO_NO_GIT_STATUS=1
[[ -d "$ANDROID_HOME" ]] || { echo 'Install Android Studio and the Android SDK first (same as for the teacher app).'; exit 1; }
command -v npm >/dev/null || { echo 'Install Node.js 20+ first.'; exit 1; }

KEYSTORE="$HOME/.school-id-admin-signing/admin-release.jks"
[[ -f "$KEYSTORE" ]] || { echo "Signing key not found at $KEYSTORE"; exit 1; }
read -r -s -p 'Admin signing password: ' ADMIN_KEYSTORE_PASSWORD; printf '\n'
export ADMIN_KEYSTORE_PASSWORD ADMIN_KEYSTORE="$KEYSTORE"
keytool -list -keystore "$KEYSTORE" -storepass:env ADMIN_KEYSTORE_PASSWORD -alias school-id-admin >/dev/null || { echo 'Wrong password. Use the same password as the first admin build.'; exit 1; }

SIGNING_DIR="$(mktemp -d -t admin-signing)"
trap 'unset ADMIN_KEYSTORE_PASSWORD; rm -rf "$SIGNING_DIR"' EXIT

echo ""
echo "Step 1/4: Installing packages…"
npm install --no-audit --no-fund
npx expo install --fix || true

echo ""
echo "Step 2/4: Preparing the Android project…"
npx expo prebuild --platform android --no-install
PROPS=android/gradle.properties
grep -q '^org.gradle.jvmargs=' "$PROPS" && sed -i '' 's/^org.gradle.jvmargs=.*/org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8/' "$PROPS" || echo 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8' >> "$PROPS"
grep -q '^reactNativeArchitectures=' "$PROPS" && sed -i '' 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a,armeabi-v7a/' "$PROPS" || echo 'reactNativeArchitectures=arm64-v8a,armeabi-v7a' >> "$PROPS"

cat > "$SIGNING_DIR/signing.gradle" <<'GRADLE'
gradle.projectsEvaluated {
    rootProject.allprojects { p ->
        if (p.plugins.hasPlugin('com.android.application')) {
            def signing = p.android.signingConfigs.findByName('adminRelease') ?: p.android.signingConfigs.create('adminRelease')
            signing.storeFile = new File(System.getenv('ADMIN_KEYSTORE'))
            signing.storePassword = System.getenv('ADMIN_KEYSTORE_PASSWORD')
            signing.keyAlias = 'school-id-admin'
            signing.keyPassword = System.getenv('ADMIN_KEYSTORE_PASSWORD')
            p.android.buildTypes.release.signingConfig = signing
        }
    }
}
GRADLE

echo ""
echo "Step 3/4: Building the APK and Play Store bundle (5–15 minutes)…"
cd android
chmod +x gradlew
./gradlew --init-script "$SIGNING_DIR/signing.gradle" assembleRelease bundleRelease

echo ""
echo "Step 4/4: Copying to your Desktop…"
VERSION="$(node -p 'require("../app.json").expo.version')"
cp app/build/outputs/apk/release/app-release.apk "$HOME/Desktop/MySchoolIDAdmin-v$VERSION.apk"
cp app/build/outputs/bundle/release/app-release.aab "$HOME/Desktop/MySchoolIDAdmin-v$VERSION-PlayStore.aab"
echo ""
echo "DONE"
echo "  Phone APK      : $HOME/Desktop/MySchoolIDAdmin-v$VERSION.apk"
echo "  Play Store AAB : $HOME/Desktop/MySchoolIDAdmin-v$VERSION-PlayStore.aab"
