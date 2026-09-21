# After assembleRelease, copy APK to Desktop (TeacherIDCapture-v{version}.apk).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$apk = Join-Path $root "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) {
  Write-Error "Release APK not found. Build from android: .\gradlew.bat assembleRelease"
}
$version = (Get-Content (Join-Path $root "app.json") -Raw | ConvertFrom-Json).expo.version
$dest = Join-Path $env:USERPROFILE "Desktop\teacher-app-v$version.apk"
Copy-Item $apk $dest -Force
Write-Host "Copied to $dest"
Write-Host "Size MB:" ([math]::Round((Get-Item $dest).Length / 1MB, 1))
explorer.exe (Split-Path $dest)
