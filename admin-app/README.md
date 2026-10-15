# My School ID Admin — Android 1.0.0

Separate Android package `com.schoolid.admin`. The school/teacher APK is unchanged.

This is an online Trusted Web Activity (TWA), not a separately rewritten native admin frontend. It opens the existing HTTPS admin website with the same login, permissions, records and operations. The phone layout uses the existing responsive navigation and the new lavender/cyan theme with reduced-motion-aware animations. Website deployments update the app's screens without rebuilding its APK. Uploads/downloads and external links use the browser engine rather than custom WebView bridges.

## Build on Windows

Prerequisites: Android Studio, JDK 17+, Android SDK Platform 36, internet access for Gradle dependencies. No teacher-app Firebase configuration is needed for this launcher. It does not add native background push notifications; the existing website notification functionality remains.

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\admin-app\scripts\build-release.ps1
```

The script downloads Gradle through the checked-in wrapper, runs `assembleRelease`, signs the APK, and copies `MySchoolIDCard-Admin-v1.0.0.apk` to your Desktop. On first build choose a signing password. On subsequent builds use the same password. Back up `%USERPROFILE%\.school-id-admin-signing\admin-release.jks` securely; losing it prevents updates to installed copies. Never commit the key or its password.

## Full-screen verification (required once per signing key)

1. Deploy this release's admin frontend and backend on EC2 using the existing deployment script.
2. After building, open `admin-app/output/admin-android.env`. It contains the public certificate fingerprint, not the private key/password.
3. Add its `ADMIN_ANDROID_CERT_SHA256=...` line to the existing `admin-web/backend/.env` on EC2. Preserve other settings. Multiple supported certificates can be comma-separated.
4. Restart the backend: `pm2 restart harsha-backend --update-env`.
5. Verify `https://myschoolidcard.in/.well-known/assetlinks.json` returns HTTP 200 JSON with package `com.schoolid.admin` and the exact fingerprint. Nginx must forward that path to the backend, like the rest of the admin site; it must not redirect to the login screen.
6. Install the APK and test login, school/institute records, Excel import/export, ZIP/photo downloads, crop selection/save, parent forms and external WhatsApp links on a physical phone.

If Nginx serves this path itself, add this exact location inside the existing HTTPS server block for myschoolidcard.in (retain its TLS configuration and use its existing backend port):

```nginx
location = /.well-known/assetlinks.json {
    proxy_pass http://127.0.0.1:5000;
    proxy_set_header Host $host;
}
```

Validate with `sudo nginx -t` before `sudo systemctl reload nginx`.

Until certificate verification succeeds, Chrome may show a browser toolbar. An up-to-date browser supporting TWA and an internet connection are required. The app shares the website's browser session; existing admin access rules still apply. Signing/installation and real-device behavior must be verified before distribution. Play Store distribution additionally requires the Play App Signing fingerprint and store compliance work; this package is for direct APK installation.

## Maintenance

Increment versionCode/versionName in android/app/build.gradle for native APK updates. Use the same signing key. Do not replace the working teacher app build scripts. The ID Card Generator retains the website's current implementation; this launcher does not create unfinished generator/desktop features.

## macOS build

Install Android Studio for Apple Silicon and SDK Platform 36; use your existing JDK 21. From the repository root:

```bash
bash admin-app/scripts/build-release-macos.sh
```

The script creates a separate Admin signing key locally on your Mac, prompts for its password without displaying it, signs the APK and copies it to your Desktop. Keep that key and password for all Admin updates. No teacher Firebase configuration or teacher signing key is needed. The generated `output/assetlinks.json` contains only the public certificate association. Deploy it at `https://myschoolidcard.in/.well-known/assetlinks.json`, or use the backend environment setting described above. Website deployment and certificate association are required before fullscreen verification succeeds.

The new website uses the supplied light lavender/cyan reference style. All website routes and permissions are retained. This app needs internet and does not provide offline record editing or additional native push notifications. Physical-device verification of file pickers, downloads, cropping, login and external links is still required.
