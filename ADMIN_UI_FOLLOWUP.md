# Color, layout, Required Details and mobile login follow-up

Base: 2697bc3, the previous update merged into main. Release: app 1.0.142.

## Implemented
- Shared violet/blue/teal palette with pale surfaces and colored text. Crop and ID Generator use distinct colorful gradients. Existing app layout retained; light theme text uses colored ink.
- Login has a larger logo, nonwrapping email and spacious stacked contact cards. Welcome Admin recovery behavior remains intact.
- Crop actions moved from the long sidebar to a visible toolbar. Settings are compact and responsive. New selection must start inside the actual photo. Existing Save/preview semantics are retained.
- Organization uses the full shared Required Details editor, with year, phones, code, address, instructions, model, tags, template, logo, signature and building photo. Admin Info shows the same stored profile. Visibility switches cover the same fields.
- Organization catalog/profile routes enforce its authenticated organization and owner-scoped templates. School/Institute record routes remain restricted to their original roles.
- Institute code now returns the alias consumed by the shared app form, preventing a saved code from appearing empty.
- App pre-login tagline is larger. Login displays version 1.0.142, validates responses and differentiates HTTP failures. Login requests do not reuse an old bearer token or trigger the old-session expiration callback.

## Mobile login: outstanding live verification
The exact account failure has not been reproduced with real credentials. The production /api/health endpoint responded successfully, which does not verify login. The previously built APK predates these updates. Install the new APK and confirm the login page says 1.0.142.

If login still fails, run this READ-ONLY diagnostic on EC2 from admin-web/backend with the normal backend environment loaded:

```bash
npx tsx scripts/diagnoseMobileLogin.ts "ACTUAL_USERNAME"
```

It reports linkage, active state, and whether an owner's displayed password matches its bcrypt login hash, without printing either value. It does not change accounts. Supply the reported error/result, not passwords. Do not bypass authentication or enable a disabled account automatically.

## Deployment and APK
1. Apply this follow-up patch on top of main at 2697bc3, push, and merge it.
2. On EC2, pull main then run the existing admin-web/scripts/deploy-ec2.sh. Its migration adds Organization profile fields and backfills existing contact details once, before rebuilding/restarting.
3. Update the SAME short-path Android project used for the previous successful build. It must contain the latest teacher-app source, app.json and scripts. Updating only the Desktop checkout does not update C:\s1006000246.
4. From that teacher-app folder run `node scripts/sync-release-version.mjs`, then `npm run android:network`. The version script preserves existing native/signing/Firebase configuration.
5. From teacher-app/android run `.\gradlew.bat assembleRelease`. After BUILD SUCCESSFUL copy app/build/outputs/apk/release/app-release.apk to Desktop and install it. Check Version 1.0.142 before retesting.

Do not regenerate Android or replace production signing/Firebase files for this patch. No APK or production deployment was performed here.

## Validation
Passed: Admin production build, backend build, all 22 backend regression tests, Android TypeScript checks and git diff --check. Browser checks use mocked data, not production records. They exercise the full Organization Info fields, login contact layout, common toolbar, crop selection outside-image rejection, visible Save action and 300 DPI export. Live database migration, device uploads and actual credentials require deployment verification.

Color reference: https://atlassian.design/foundations/color/accents (shared accent tokens rather than separate themes per module).
