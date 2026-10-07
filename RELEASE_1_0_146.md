# My School ID Card 1.0.146

## Changes
- Schools now have Create Link beside the shortened search field, plus Copy and Share. Repeated clicks return the same school link.
- Public parent forms use the school's currently enabled Form Setup/Excel fields. Disabled fields and generated photo-number fields are omitted. Student Name and a JPG/PNG student photo are mandatory. Enable Student Name before creating a link. Optional enabled signature upload is supported.
- Parent submissions create ordinary school student records. They use the existing school serial allocator (ADD_000, ADD_001, ...; at least three digits), photo storage, capture timestamps and uncropped status. Existing school/admin/app workflows operate on those same records.
- Repeated entered details are rejected with “Data already exists. Please contact admin.” Photo upload failures roll back the student insert. Missing class values use the existing UNKNOWN grouping so records remain accessible to teachers.
- The app's school ID Cards class/section screen includes the existing parent link with Copy and native Share. It refreshes on screen focus and every 30 seconds while focused.
- Separate Organization sidebar navigation and dashboard cards are removed. Existing Organization records and legacy routes are preserved; no historical records are automatically moved into Schools.
- Bell notification dates use DD/MM/YYYY and time in India time.
- School/Institute grouped photo deletion deletes existing photos while retaining records. Redundant Pending/Uncaptured photo choices are removed; data-deletion options remain.
- Crop editor mouse-wheel zoom works over the image with no zoom buttons. Zoom is a view operation and preserves crop output measurements and the OK/Preview/Save workflow.
- Admin Management displays Username, Password, Email, Phone in that order after Name.
- App release version/versionCode: 1.0.146 / 146. Adds Expo Clipboard using the installed Expo 54 compatible version.

## Validation
- Backend TypeScript build and 37 automated tests passed.
- Admin production build and mobile TypeScript check passed.
- Six mobile regression tests and npm ci lockfile dry-run passed.
- Browser checks at 390px and 1366px verified the school link toolbar and required parent form submission; crop wheel zoom and 413 x 531 output for a 3.5 x 4.5 cm crop passed.
- Local PostgreSQL-compatible integration checks verified real insert/duplicate SQL, sequential IDs, transaction rollback and captured/uncropped metadata.
- React component checks verified app Copy/Share and clearing the previous school's link after account changes.
- No production database migration, EC2 deployment, physical-device test, or Android APK build was performed here.

## Deploy before building the new APK
1. Run Apply-Push-Merge.ps1 from the extracted release ZIP. It creates a separate worktree, preserves your existing local edits, and pushes without force. Main at 1.0.144 receives the included 1.0.145 prerequisite first; main at 1.0.145 receives only 1.0.146.
2. In your EC2 repository root run:
   git pull --ff-only origin main
   bash admin-web/scripts/deploy-ec2.sh
   This runs migrations, including schools.parent_form_token, before restarting the API. Take the usual database backup first.
3. Run Update-Build-APK.ps1 in Windows PowerShell. It exports main, backs up the existing short-path app project, preserves native Android/Firebase/environment files, installs the synchronized lockfile and builds with gradlew assembleRelease.
4. APK output: Desktop\MySchoolIDCard-v1.0.146.apk.
5. In Admin: open a School, check Form Setup, Create Link, submit a test parent form, and confirm the same student in the school list and app. Verify copy/share on a real phone.

Use PUBLIC_WEB_ORIGIN on the backend if the public site differs from https://myschoolidcard.in.
