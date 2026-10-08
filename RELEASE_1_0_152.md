# Release 1.0.152 — app and admin visual refresh

Includes the pending 1.0.151 fixes; read RELEASE_1_0_151.md for Excel migration and notification configuration requirements.

Mobile visual layer: shared violet/sky header gradients, teal actions, coral accents, pale lavender surfaces and coloured text. Consistent compact Poppins/Inter typography, more generous card spacing and rounded cards/navigation. Removed black UI literals and black overlays in favour of violet; actual photos and camera content are unchanged. Existing alternate theme uses violet surfaces instead of near-black. App-wide press animation preserves handlers/layout and observes Reduce Motion. Business logic, navigation, labels and product data are retained by this visual refresh.

Admin: matching light violet/sky/teal design for the header, sidebar, cards, forms, buttons and tables; gentle entry/hover/press animations with reduced-motion support. Includes the pending header Back links, two toolbar rows, smaller status text and restored sidebar swing.

Validation: admin production build, mobile TypeScript, eight mobile regressions; browser crop preview/rotation/save and responsive toolbar/link checks at 390/768/1024/1366. SQL regression for Excel-only duplicate exemption passed. The actual Android app has not been built or visually verified on a device here: install the APK and check login, Home, ID Cards, edit/add, settings, camera and Order Now on your phone.

Notification delivery remains unverified. A missing Firebase file or server credentials requires the existing project's configuration. The build script now checks Firebase before building; do not treat a successful theme update as a push-delivery fix.

PowerShell:
1. Extract the ZIP and run Apply-Push-Merge.ps1 (handles main on app 1.0.149 or 1.0.151).
2. Deploy backend/admin on EC2 before using Excel imports:

    cd "$HOME/school-id-app"
    git pull --ff-only origin main
    bash admin-web/scripts/deploy-ec2.sh

3. Run Update-Build-APK.ps1. It builds in C:\s1006000246\teacher-app and copies MySchoolIDCard-v1.0.152.apk to Desktop. Keep the existing Firebase file/signing configuration. If the Firebase check fails, send the exact output. Public website deployment is not needed for this release.
