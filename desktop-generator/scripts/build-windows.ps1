# Builds the Windows installers (.exe and .msi) for the offline ID Card Generator.
# Run in PowerShell on a Windows PC from the repository root:
#   powershell -ExecutionPolicy Bypass -File .\desktop-generator\scripts\build-windows.ps1
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Install Node.js 20 or newer from https://nodejs.org first." }
$pub = Get-Content ".\electron\publicKey.cjs" -Raw
if ($pub -match "REPLACE_WITH_PUBLIC_KEY") { throw "Put the licence PUBLIC key into desktop-generator\electron\publicKey.cjs first (see README.md, step 1)." }

npm install
if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }

npm run dist
if ($LASTEXITCODE -ne 0) { throw "Build failed. Send the error text above." }

$out = Join-Path (Get-Location) "release"
Get-ChildItem $out -Include *.exe, *.msi -Recurse | ForEach-Object { Write-Host "Built: $($_.FullName)" -ForegroundColor Green }
explorer $out
