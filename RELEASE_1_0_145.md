# Release 1.0.145

## Requested app changes
- Organization ID Cards now follow the School screen structure: green header and greeting; category cards with counts/progress; two-column portrait grid using the same StudentGridCell component; All/Pending/Captured/Pending Data filters; record viewer with Back, Edit Form and Next.
- Category names and record details come from enabled Organization Form Setup fields. Class, Department, Designation and Group are recognized; All Records includes records without a group. Signatures do not count as captured photos.
- Organization editing remains scoped to the existing organization API and respects edit permissions. Add Record opens the organization's existing form link; Required Details and Share Form Link are in the header options menu. This preserves Organization's different initial data collection flow.
- Removed the version label from the login screen. Version remains in Settings for support.
- Sidebar Settings includes Push notifications On/Off for this phone. Off unregisters its token on the server, persists locally, suppresses foreground presentation and clears scheduled/tray notifications. On requests permission and registers the phone again. Failed operations show an error and do not falsely confirm a changed switch. The in-app announcement inbox remains available. Already-in-transit remote messages may still arrive briefly after disabling.
- Registration and switch operations are serialized to prevent an in-flight registration undoing Off. The backend restricts token removal to its authenticated owner.

## Build repairs
- Synchronizes the lock file with package.json, including expo-file-system 19.0.24, resolving the npm ci mismatch.
- Keeps a transparent legacy splashscreen_logo drawable when regenerating icons so older native launcher resources can still link. Launcher logo generation is retained.
- Version 1.0.145 / Android versionCode 145.

## Validation
- Mobile TypeScript and six API/notification-preference tests passed (off/on, persisted preference, failure handling, registration race).
- Backend build and 34 tests passed, including unregister ownership.
- Organization component interaction checks with mocked native components/API passed: group selection, shared grid names/photo state, next/back and edit/save.
- Native icon-generation fixture passed twice with an older launcher reference, verifying the splash compatibility resource and launcher images.
- npm ci dry run validates the corrected lock file.

No real Android APK/device or live push notification was used for these checks. Component checks are not a device visual certification. Build/install the APK and verify the Organization grid, keyboard, Settings switch, foreground/background push and form editing on a test account after deployment.

Deploy backend first, then install the new APK. No new database migration is introduced by this release. The package is based on the current GitHub main including release144, the Organization dashboard update and 10 MB notification-image fix.
