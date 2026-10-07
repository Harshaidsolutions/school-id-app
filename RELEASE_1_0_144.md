# Release 1.0.144 — record media and notifications

This release builds on 1.0.143, including that release's responsive admin UI, organization editing, duplicate-record checks, app branding, and API configuration corrections.

## Changes

- Schools, Institutes and Organizations use the same photo/signature viewer, with Previous/Next, a record count, keyboard arrows/Escape, authenticated images and navigation kept inside the mobile viewport. Navigation follows the currently displayed filtered records and skips records without the selected image field. Organization signatures navigate the same configured signature field across records.
- School/Institute signature upload fields appear as viewable signature columns.
- Organizations are available in the admin notification composer, sent list, backend ownership checks, mobile inbox/read/delete routes and push-token targeting.
- Each recipient receives one stored announcement containing both text and image. The composer disables concurrent sends, retains failed recipients for retry and reuses a per-recipient request identifier. Database locking and a unique index prevent a repeated request from inserting or dispatching a second announcement.
- Android push uses one data-only display path and a stable notification tray identifier. Full message text accompanies the image. Login no longer re-schedules inbox rows as local notifications, which could duplicate an earlier push as text-only. Missed announcements remain available in the app inbox.
- The native notification patch fails the build if its required source locations cannot be patched. Rebuild/install APK 1.0.144 to apply it.

## Validation

- Backend build and 32 tests passed, including image/text payload, organization ownership, scoped inbox/read/delete, retry suppression and new organization image dispatch.
- Admin production build passed. Mobile TypeScript check and API configuration tests passed.
- Browser checks with mocked data passed for photo/signature navigation in all three modules at 390x844 and organization send/retry behavior. One successful recipient was not resent after a second recipient failed; text/image stayed together and the retry identifier was preserved.
- Notification migration passed on a temporary PostgreSQL-compatible PGlite database, including rerun and unique-request enforcement.
- Native notification patch applied successfully and was safe to run twice.

## Deployment and limits

Deploy the backend migration before starting the updated backend, rebuild the admin website, and install the new APK. Existing app sessions must register their push token with the updated backend; signing out/in after installation triggers the usual registration flow.

No production database or real user notification was touched during these checks. No Android APK was built here, and real-device SNS/FCM delivery and account login still require verification after deployment. The changes remove the identified duplicate paths; they do not guarantee exactly-once delivery by an external push service. A server crash after a database commit but before push dispatch can leave an announcement in the inbox without a tray alert.
