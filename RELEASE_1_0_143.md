# Record editing, duplicate prevention and Android branding — 1.0.143

Based on GitHub main 8207d02 (the previously applied 1.0.142 update).

## Changes
- Organization Edit now supports photo number, all enabled text fields, and image replacement. A replaced image becomes uncropped with a new capture timestamp. Crop Save retains its existing timestamp/preview semantics. Text and photo requests save sequentially; an upload failure keeps the editor open for retry and may leave already-saved text intact.
- School/Institute admins can edit photo numbers independent of the mobile ON/OFF restriction. Canonical and configured photo-number values stay aligned. Optional text can now actually be cleared.
- Form Setup has one labeled Visible toggle. Required/Optional remains available through a selector, alongside field type configuration.
- Shared admin surfaces have violet, teal and rose accents. Phone detail pages can scroll vertically without collapsing their tables; row actions remain visible while scrolling horizontally. Login fits tested 1366x768, 390x844 and 360x640 viewports. Very small/zoomed screens and on-screen keyboards may still need scrolling to keep controls accessible.
- App tagline is grey on login/pre-login and stays white on the splash screen.
- App 1.0.143 corrects the known retired EC2-IP/HTTP API configuration to https://myschoolidcard.in. Explicit development servers remain supported. A 404 now displays the API address for diagnosis.
- The release build script sets the production API origin for that process, probes the route without credentials, regenerates native launcher icons, and synchronizes the native name (My School ID Card) and version. Updating app.json alone does not update an existing native Android project.

## Duplicate rule and migration
Run the existing EC2 migration BEFORE restarting the updated backend. It installs scoped database triggers for School/Institute records and Organization field submissions, covering app, admin and Excel writes.

Matching is case/whitespace normalized and compares entered details within the SAME school, institute or organization. Photo numbers, image files, capture/crop status and timestamps are excluded; a new photo or generated number must not create the same person twice. Matching only a person's name is insufficient when other details differ. Blank Organization submissions are not treated as identical people.

The API returns HTTP 409: "Data already exists. Please contact admin." Existing duplicates are retained; this migration does not delete records. Photo/status-only updates to existing duplicate records remain possible. Spreadsheet batches containing newly repeated details roll back, rather than partially importing those rows.

## Validation
- Admin production build and mobile TypeScript check passed.
- 26 backend tests passed (including prior regressions, replacement vs crop status, duplicate error response, admin number edit, optional clearing and Organization number collision rollback).
- Two mobile API configuration tests passed.
- Duplicate SQL ran twice successfully in an isolated PGlite database; tests cover normalized equality, organization scope, different details, updates, photo-only edits and transaction rollback. Production PostgreSQL migration and multi-connection contention were not exercised.
- Mocked-data browser checks cover compact login, mobile form controls, Organization photo/number editing and table action access. Prior crop checks still pass.
- Native branding scripts tested against a temporary Android resource fixture, including retained signing configuration. No actual Gradle APK build or device install was performed here.

## Live login
An empty request to https://myschoolidcard.in/api/auth/login returned the expected HTTP 400 validation response. This proves route availability only. Real account login remains unverified; do not infer that every credential is valid. Deploy the backend, install the rebuilt 1.0.143 APK and retest. If it fails, provide its displayed error/API address (not passwords).

## Deployment
1. Extract the delivered ZIP. Run Apply-Push-Merge.ps1 in Windows PowerShell (the script uses the existing Desktop repository and a separate checkout).
2. On EC2, from the repository root: `git pull --ff-only origin main && bash admin-web/scripts/deploy-ec2.sh`. The script runs migration and rebuilds/restarts the backend and admin UI.
3. Run Update-Build-APK.ps1 from the extracted package. It exports the committed main source to C:\s1006000246\teacher-app, backs up the existing project without caches, preserves native/signing/Firebase files, then invokes teacher-app/scripts/build-release.ps1.
4. Install Desktop\MySchoolIDCard-v1.0.143.apk. Verify app name, icon and login page version.

An installed launcher may cache its icon temporarily. Do not uninstall an app with pending local work just to refresh an icon.
