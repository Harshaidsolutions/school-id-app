# Run in the existing short-path teacher-app project after syncing current source.
& {
    $ErrorActionPreference = "Stop"
    Set-Location (Split-Path $PSScriptRoot -Parent)
    if (-not (Test-Path '.\android\gradlew.bat')) { throw 'Existing native Android project is required.' }
    $oldApi = $env:EXPO_PUBLIC_API_URL
    try {
        # Override obsolete .env values only for this production build.
        $env:EXPO_PUBLIC_API_URL = 'https://myschoolidcard.in'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$env:EXPO_PUBLIC_API_URL/api/auth/login" -Method Post -ContentType 'application/json' -Body '{}' -TimeoutSec 20 | Out-Null
            throw 'Unexpected login preflight response.'
        } catch {
            if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 400) { throw }
        }
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
        npm run assets:generate
        if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed.' }
        npm run assets:verify
        if ($LASTEXITCODE -ne 0) { throw 'Asset verification failed.' }
        node scripts/sync-release-version.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Native branding/version sync failed.' }
        npm run android:network
        if ($LASTEXITCODE -ne 0) { throw 'Network configuration failed.' }
        Set-Location android
        .\gradlew.bat assembleRelease
        if ($LASTEXITCODE -ne 0) { throw 'APK build failed. Send the FAILURE section.' }
        $desktop = [Environment]::GetFolderPath('Desktop')
        $version = (Get-Content '..\app.json' -Raw | ConvertFrom-Json).expo.version
        $target = Join-Path $desktop "MySchoolIDCard-v$version.apk"
        Copy-Item '.\app\build\outputs\apk\release\app-release.apk' $target -Force
        Write-Host "APK saved: $target"
    } finally { $env:EXPO_PUBLIC_API_URL = $oldApi }
}
