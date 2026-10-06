# Admin UI, organization consistency, crop and mobile login review

Base: f10eecbdb9935e7fa6c62739fd0b8aad147608a5. Date: 2026-10-06.

## Changes

- Shared admin styling updates typography, surfaces, inputs, tables, buttons, sidebar and responsive detail toolbars. Login uses a professional split layout. Welcome Admin opens recovery by click or keyboard; there is no separate visible recovery link.
- School, Institute and Organization retain ID Card Generator beside Cropping Tool. It clearly announces the future feature and does not pretend to generate a card.
- Organization uses the shared Form Setup, Excel upload dialog and Info/settings layout. Field names, enabled state, required state and order remain configurable; existing field types cannot be changed in place, avoiding incompatible stored data.
- Existing common Excel export, photo grouping and deletion dialogs are retained. Organization photos now download as one ZIP, scoped to the selected organization and applicable configured fields. Capture-date filters use the same India calendar day across listing, download and deletion.
- Excel reimports with Photo Number update the same organization record, preserving images. Duplicate numbers within a file are rejected. Missing columns leave existing values unchanged; an explicitly blank cell clears that text value. Imports without Photo Number add records.
- Text edits use upsert so newly added configured fields save even when old records have no corresponding value yet.
- Crop opens with no selection, including when dimensions were previously saved. Drag creates a selection; dimensions constrain its aspect ratio and export at 300 DPI. Rotated selections remain inside the image. Lock is removed. Brightness/contrast preview is clipped to the selected region. OK prepares a preview; only successful final Save marks the selected photo cropped.
- Organization crop metadata is per photo field. Save preserves capture time, uses a new storage object, and commits metadata transactionally. Failed database commit rolls back and cleans the new object. Adding another photo field cannot incorrectly mark an incomplete record fully cropped.
- Mobile login sends a mobile audience so an admin with matching credentials cannot be selected ahead of School/Institute/Organization staff. Admin login explicitly requests the admin audience. API base URLs with a trailing /api are normalized to prevent /api/api.
- Android visual design is unchanged. Organization edit/captured-section settings now affect the existing app controls, and the API enforces editing settings while allowing missing required text to be completed.
- Existing admin credential display was not changed.

## Validation

- Admin: `cd admin-web && npm run build` passed.
- Backend: `cd admin-web/backend && npm test` passed (18 tests).
- Android TypeScript: `cd teacher-app && npx tsc --noEmit` passed.
- Chromium checks against mocked API data exercised login heading recovery, Organization detail/form/info/upload, School/Institute generator buttons, responsive toolbar, no initial crop selection, selection-only tone preview and 3.5 x 4.5 cm export (413 x 531 pixels). No page JavaScript errors in the final run.
- Git whitespace checks passed.

Tests use mocked database/storage and browser responses. They are not evidence that a production migration, actual credentials, device login, email OTP, or live storage download succeeded. No APK was generated in this round.

## Deployment order

1. Back up the production database and deploy during the normal maintenance window.
2. Install existing locked dependencies in `admin-web/backend` with `npm ci`, then run `npm run migrate` with the intended production environment. This adds `photo_captured_at` and `photo_cropped` to organization submission values.
3. Run `npm run build` and restart the backend with the existing deployment process.
4. In `admin-web`, run `npm ci` and `npm run build`; deploy `dist` using the existing website deployment process.
5. Rebuild the Android release using the existing native project, signing configuration and API environment. The mobile audience fix requires both the updated API and rebuilt app. Do not regenerate or replace signing/Firebase configuration for this UI change.
6. Check one School, Institute and Organization staff login on a real device. Confirm API health and actual configured API URL. If login still fails, capture its exact displayed error and corresponding server log without sharing passwords.
7. Check a record through admin/app: name, photo number, enabled/required fields, capture time, crop status and counts. Try Excel update, download ZIP, crop OK without Save, successful Save, failed Save and permitted deletion in a test organization.

Legacy capture times were not separately stored per organization photo, so migration uses the value creation timestamp where needed. Historical record-level crop flags can only be safely transferred when exactly one non-signature photo exists. Multi-photo legacy records remain conservatively uncropped until reviewed; their exact past per-photo state cannot be reconstructed from the old schema.

## Source delivery

Apply the included patch to a clean checkout based on the base commit above using `git am --keep-cr --3way changes.patch`. If there are conflicts, stop and resolve them before continuing or pushing. The patch contains one complete commit; do not separately overwrite the same files from the changed-files directory and then apply the patch.
