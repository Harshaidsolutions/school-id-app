# My School ID Card 1.0.148

## Admin website
- Sidebar logos are smaller (100 x 64 contain frame).
- The status tabs, Search, Link, Filter, Bulk Delete and Add Student share one toolbar row below the main action buttons. Narrow screens can scroll this row horizontally; controls are not compressed or clipped.
- + Link only opens the link/Copy/Share controls. The class-choice editor and Save class choices button are removed. Parent forms read the existing school's Class values and require the parent to choose one.
- Form Setup has a Parent student form switch. It defaults OFF. Switching ON validates the required fields/classes and creates the school link if needed. The app hides the card while OFF and refreshes while focused. This controls app visibility, not access to an already-shared public link.
- Crop header shows school name and current photo number/student. Removed the Back controls. OK is orange; Save is green. Whole-image rotation buttons are on the bottom bar: rotate before selecting a crop or after OK in preview. The saved JPEG includes the rotation; quarter turns swap its output width/height. Existing crop-frame rotation and final-save status rules remain intact.
- Added an install manifest, app-logo PNG icons at 192/512, apple-touch icon and a network-only service worker. Student/API data are not cached for offline use. This applies to the admin site at myschoolidcard.in.

## Android app
- Product preview includes Book Now next to Close. It opens WhatsApp sharing with the bundled product image and “I want to book this product: <name>”, addressed to the owning admin's configured WhatsApp/phone. Platform accounts use the configured platform number or existing support fallback. Sending is confirmed by the user inside WhatsApp.
- Home/drawer use the exact login logo artwork, with a white background for contrast. Home header title/tagline spacing is reduced.
- Child-admin uploaded logo is returned by the scoped branding API and shown in the home hero instead of the child-admin name. Missing uploaded logos use the platform brand fallback.
- Settings uses “Notifications”. OFF removes the authenticated device token from the delivery registry before confirming, clears scheduled/tray notifications and persists the preference. It does not wait on SNS calls or race an endpoint disable against a later ON. ON creates the Android notification channel before permission/token registration; explicit server registration failure is reported rather than pretending delivery is connected.
- Parent student form card uses the app's Poppins/Inter typography and orange/green theme; it is shown only when enabled by admin.
- School class screens say Add Member instead of Add Student.
- Added react-native-share 12.3.1 and Android WhatsApp package visibility. A new native APK build is required (an OTA/JS update alone is insufficient).

## Verification
Passed: backend build + 40 tests; mobile TypeScript + 7 tests; admin production build; npm ci lockfile dry-run. Browser checks at 390/768/1024/1366 verified toolbar alignment, collapsed controls, parent dropdown, compact admin logo, Form Setup switch and manifest/icon dimensions. Crop checks verified post-OK brightness applied once, 413 x 531 output rotated to 531 x 413 in preview AND uploaded JPEG, and bottom actions. Component tests verified parent-card Copy/Share and server-enabled visibility changes. Native manifest patch was checked for idempotence.

Not performed here: Windows APK build, installation on a real phone, WhatsApp recipient/image/caption validation on that phone, production push delivery, database migration or EC2 deployment. Notification delivery still requires working Firebase/SNS credentials and Android permission. Already-dispatched messages cannot be recalled.

## Install this update
1. Extract the ZIP and run Apply-Push-Merge.ps1 in Windows PowerShell. Main must already contain 1.0.147. The script creates a separate worktree and preserves local edits; it never force-pushes.
2. From the EC2 repository root:
   git pull --ff-only origin main
   bash admin-web/scripts/deploy-ec2.sh
   This adds schools.parent_form_enabled before restarting the API.
3. For each school that needs the link in the app: enable Student Name and Class in Form Setup, ensure imported records have the school's class values, then turn ON Parent student form.
4. Run Update-Build-APK.ps1 in Windows PowerShell. It syncs current main to C:\s1006000246\teacher-app, preserves native/Firebase configuration, installs the lockfile and runs assembleRelease. Output: Desktop\MySchoolIDCard-v1.0.148.apk.
5. Install and check Book Now and Notifications OFF/ON on a physical phone. Check the app parent link after refreshing/focusing ID Cards.
6. After website deployment, remove the old Chrome shortcut and install the site again using Chrome's Install app/Add to Home screen option. Existing shortcuts may retain their old icon; browser installation UI varies.

Implementation references: https://react-native-share.github.io/react-native-share/docs/share-single and https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
