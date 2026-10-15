& {
    $ErrorActionPreference = 'Stop'
    $root = Split-Path $PSScriptRoot -Parent
    $android = Join-Path $root 'android'
    $oldJava = $env:JAVA_HOME
    $oldSdk = $env:ANDROID_HOME
    $oldKey = $env:ADMIN_KEYSTORE_PATH
    $oldPass = $env:ADMIN_KEYSTORE_PASSWORD
    try {
        if (-not $env:JAVA_HOME) {
            $studioJava = "$env:ProgramFiles\Android\Android Studio\jbr"
            if (Test-Path "$studioJava\bin\java.exe") { $env:JAVA_HOME = $studioJava }
        }
        if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\keytool.exe")) {
            throw 'Set JAVA_HOME to JDK 17 or newer, or install Android Studio.'
        }
        if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
        if (-not (Test-Path "$env:ANDROID_HOME\platforms\android-36\android.jar")) {
            throw 'In Android Studio > SDK Manager, install Android SDK Platform 36 and accept its license. Then run this script again.'
        }
        $keyFolder = Join-Path $env:USERPROFILE '.school-id-admin-signing'
        New-Item -ItemType Directory -Force $keyFolder | Out-Null
        $env:ADMIN_KEYSTORE_PATH = Join-Path $keyFolder 'admin-release.jks'
        Write-Host "Signing key: $env:ADMIN_KEYSTORE_PATH"
        Write-Host 'Keep this key and password backed up. Use the same key for every future Admin APK update.'
        $secure = Read-Host 'Enter the Admin signing password (new password on first build, at least 6 characters)' -AsSecureString
        $env:ADMIN_KEYSTORE_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
        if ($env:ADMIN_KEYSTORE_PASSWORD.Length -lt 6) { throw 'Signing password must contain at least 6 characters.' }
        $keytool = "$env:JAVA_HOME\bin\keytool.exe"
        if (-not (Test-Path $env:ADMIN_KEYSTORE_PATH)) {
            & $keytool -genkeypair -keystore $env:ADMIN_KEYSTORE_PATH -storetype JKS -alias school-id-admin -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=My School ID Admin' -storepass:env ADMIN_KEYSTORE_PASSWORD -keypass:env ADMIN_KEYSTORE_PASSWORD
            if ($LASTEXITCODE -ne 0) { throw 'Signing key creation failed.' }
        }
        $output = Join-Path $root 'output'
        New-Item -ItemType Directory -Force $output | Out-Null
        $cert = Join-Path $output 'admin-release.der'
        & $keytool -exportcert -keystore $env:ADMIN_KEYSTORE_PATH -alias school-id-admin -storepass:env ADMIN_KEYSTORE_PASSWORD -file $cert
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read signing certificate. Check your password.' }
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try { $fingerprint = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($cert))).Replace('-', ':') } finally { $sha.Dispose() }
        "ADMIN_ANDROID_CERT_SHA256=$fingerprint" | Set-Content (Join-Path $output 'admin-android.env') -Encoding ascii
        Push-Location $android
        try {
            & .\gradlew.bat assembleRelease
            if ($LASTEXITCODE -ne 0) { throw 'Admin APK build failed. Send the FAILURE section.' }
            $desktop = [Environment]::GetFolderPath('Desktop')
            $target = Join-Path $desktop 'MySchoolIDCard-Admin-v1.0.0.apk'
            Copy-Item '.\app\build\outputs\apk\release\app-release.apk' $target -Force
        } finally { Pop-Location }
        Write-Host "APK saved: $target"
        Write-Host "Website certificate setting saved: $output\admin-android.env"
        Write-Host 'Add that setting to admin-web/backend/.env on EC2 and restart the backend. See README.md for verification.'
    } finally {
        $env:JAVA_HOME = $oldJava
        $env:ANDROID_HOME = $oldSdk
        $env:ADMIN_KEYSTORE_PATH = $oldKey
        $env:ADMIN_KEYSTORE_PASSWORD = $oldPass
    }
}
