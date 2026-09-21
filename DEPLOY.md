# Deploy workflow (School ID App)

## Part 1 — Build APK and copy to Desktop

### Paths

| What | Path |
|------|------|
| Git repo | `C:\sid\school-id-app` |
| Teacher app (in repo) | `C:\sid\school-id-app\teacher-app` |
| **Short build path** (Windows) | `C:\sid\teacher-app` |
| APK output | `C:\sid\teacher-app\android\app\build\outputs\apk\release\app-release.apk` |
| Desktop copy | `C:\Users\prave\Desktop\teacher-app-v1.0.XX.apk` |

### Step 1 — Make code changes in the repo

Edit under `C:\sid\school-id-app\teacher-app\`.

If you changed the app icon:

```powershell
cd C:\sid\school-id-app\teacher-app
node scripts/generate-icon-assets.mjs
```

Update version in:

- `teacher-app\app.json` → `"version": "1.0.XX"`
- `teacher-app\android\app\build.gradle` → `versionCode` and `versionName`

### Step 2 — Sync repo → short build path

```powershell
$src = "C:\sid\school-id-app\teacher-app"
$dst = "C:\sid\teacher-app"

Copy-Item "$src\app.json" "$dst\app.json" -Force
Copy-Item "$src\android\app\build.gradle" "$dst\android\app\build.gradle" -Force
Copy-Item "$src\src" "$dst\src" -Recurse -Force
Copy-Item "$src\scripts" "$dst\scripts" -Recurse -Force

Copy-Item "$src\assets\*.png" "$dst\assets\" -Force
Copy-Item "$src\android\app\src\main\res\mipmap-anydpi-v26\*.xml" "$dst\android\app\src\main\res\mipmap-anydpi-v26\" -Force
Get-ChildItem "$src\android\app\src\main\res\mipmap-*" -Directory | ForEach-Object {
  $destDir = Join-Path "$dst\android\app\src\main\res" $_.Name
  if (Test-Path $destDir) {
    Copy-Item "$($_.FullName)\*.webp" $destDir -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "Sync done"
```

Do **not** full-folder robocopy of `android/` (stale CMake paths). Do **not** run `gradlew clean` unless native deps changed.

### Step 3 — Build release APK

```powershell
cd C:\sid\teacher-app\android
.\gradlew assembleRelease
```

Wait for **`BUILD SUCCESSFUL`** (~3–4 minutes on incremental builds).

### Step 4 — Copy APK to Desktop

```powershell
Copy-Item "C:\sid\teacher-app\android\app\build\outputs\apk\release\app-release.apk" `
  "C:\Users\prave\Desktop\teacher-app-v1.0.XX.apk" -Force
```

### Step 5 — Install on phone

1. Uninstall the old app (important for icon updates).
2. Copy the APK to the phone and install.

---

## Part 2 — Push PC → Pull on EC2

APK is **not** deployed to EC2. Only backend + admin web.

### On PC

```powershell
cd C:\sid\school-id-app
git add .
git commit -m "Your message"
git push origin main
```

### On EC2

```bash
cd ~/school-id-app
git pull origin main

cd admin-web/backend
npm run migrate
npm run build

cd ../..
cd admin-web
npm run build:admin

pm2 restart harsha-backend
```

Use `npm run build:admin` (not plain `npm run build` alone) so static files land in `admin-web/backend/public`.

---

## Why builds get slow (avoid these)

| Mistake | Effect |
|---------|--------|
| Build under `C:\sid\school-id-app\teacher-app\android` | CMake path-length failures |
| `gradlew clean assembleRelease` | Full rebuild (~15–20+ min) |
| `--no-daemon` every time | Slower JVM startup |
| Full robocopy including `android/` build caches | Wrong paths, extra work |
| `-PreactNativeArchitectures=arm64-v8a` only | Smaller APK (~79 MB), not the usual ~187 MB universal build |

---

## One-line summary

**APK:** sync → `C:\sid\teacher-app` → `gradlew assembleRelease` → copy to Desktop → install on phone  

**Server:** `git push` on PC → `git pull` + migrate + `build:admin` + `pm2 restart` on EC2
