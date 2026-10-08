# Release 1.0.151

Admin: page back links moved into shared header, crop Back returns to its school/institute records with unsaved-change confirmation. Eight workflow actions stay on one horizontal row; smaller status tabs/actions form the second row. Narrow screens scroll the toolbar horizontally rather than clipping buttons. Sidebar logo swing restored and surrounding white panel removed.

Excel: admin import transaction explicitly allows matching entered details. Manual app/parent-form duplicate checks remain active, and photo-number constraints remain intact. Run backend migration before importing.

Mobile: no white logo circle; white backing only inside the logo's ID card. Larger home title with a small subtitle gap. Order Now opens the selected product image plus an English purchase request addressed to the admin; removed helper text. Actual WhatsApp caption delivery depends on installed WhatsApp and requires a phone check.

Notifications: existing On/Off registration remains truthful (failed registration does not display success). Firebase token errors now explain the required setup rather than expose technical errors. APK build now verifies google-services.json matches com.schoolid.teacher and the native Google Services plugin is present. Missing Firebase setup cannot be fixed without the correct existing project's file. This release does not claim live push delivery is repaired. Supply teacher-app/google-services.json from the Firebase project already connected to the server; do not commit this file or create an unrelated Firebase project. If plugin check fails, send android/app/build.gradle for review. Server push configuration can also require correction.

Validation: admin and backend builds; mobile TypeScript; 8 mobile tests; database duplicate tests including transaction-limited Excel exemption and continuing manual duplicate rejection. Browser crop/toolbar checks. No physical APK or live push test performed here.

After Apply-Push-Merge.ps1 succeeds, deploy on EC2:

    cd "$HOME/school-id-app"
    git pull --ff-only origin main
    bash admin-web/scripts/deploy-ec2.sh

Then run Update-Build-APK.ps1 in PowerShell. The script preserves the existing short-path native project and builds APK 1.0.151 after configuration verification. Public website is unchanged.
