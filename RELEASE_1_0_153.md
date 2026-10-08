# Release 1.0.153 — complete the shared visual treatment

Builds on 1.0.152. App content, navigation targets, forms, record actions and APIs are preserved.

Mobile:
- Consistent visual treatment across login/onboarding, Home, templates/models, instructions, ID Cards, classes/records, add/edit/detail, camera/preview, brochures, notifications, settings and sidebar using shared tokens plus removal of old screen-level accent overrides.
- Login uses a constrained-width form, a soft outlined card, violet primary action, coloured input text and gentler dividers. No near-black login text.
- Shared screen headers have subtle decorative rings and consistent icon buttons. Section dividers are compact accents. Selected bottom tabs have a soft colour background.
- Native page transitions and tab fades respect the device Reduce Motion preference. Screens and dialogs that previously used plain native Pressable now use the shared animated control; callbacks and disabled behaviour are preserved.
- Admin authentication, dialogs, tables and inputs complete the visual treatment from 1.0.152. Login background motion respects reduced motion.

Validation: admin build and mobile TypeScript; eight mobile regressions; browser crop/rotation/save, school toolbar/link workflow and responsive login at phone/tablet/desktop widths. No Android device screenshot or APK build was available here. Install the APK and check the actual native screens, keyboard and large-text settings.

PowerShell: run Apply-Push-Merge.ps1, then deploy admin on EC2:

    cd "$HOME/school-id-app"
    git pull --ff-only origin main
    bash admin-web/scripts/deploy-ec2.sh

Run Update-Build-APK.ps1 after Firebase setup is corrected. It expects the existing short-path project C:\s1006000246\teacher-app and copies MySchoolIDCard-v1.0.153.apk to Desktop. The missing google-services.json issue from the previous build is still a configuration prerequisite; visual changes cannot supply that Firebase file or prove push delivery. Public website is unchanged.
