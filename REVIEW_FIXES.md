# Review fixes — 5 October 2026

Base: `6e409c096187c2b37450d31525f8c191c7daec66` in `Harshaidsolutions/school-id-app`.

This is a reviewed source patch, not a production-readiness certificate. Admin password display/storage behavior is preserved as requested. No live records, accounts, photos, deployment, or APK were modified.

## Implemented

- **Permissions:** explicit database super-admin flag instead of username/email-pattern or oldest-admin runtime escalation; stop future broad migration grants; enforce owner checks for creation, import, form configuration, organization-wide student/photo deletion and print batches; restrict global cleanup and creation of additional admins.
- **Sessions:** check current account activity, role, organization assignment and password-derived credential version on authenticated requests. Password changes invalidate old tokens. Shared 401 handling clears web/mobile sign-in state. Database failures remain server errors instead of logging users out.
- **Authentication attempts:** bounded per-process login/reset attempts; admin OTP resend cooldown and verification limit. Multiple API replicas still require a shared limiter.
- **Excel safety:** serialize imports per organization; block replacement when captured/printed records exist; provide Update / Add alongside replacement; commit form configuration and imported rows in the same transaction. Matching rows retain record IDs and photos. Merge uses the existing class + photo-ID identity rule, and supplied text values can overwrite existing text.
- **Record recovery:** web and mobile preserve a confirmed created record ID after attachment failure and retry only attachments that have not succeeded. Mobile success returns a refreshed server record. A lost creation response before its ID reaches the client is still an unresolved idempotency case.
- **Statuses/settings:** Pending tab count matches Pending Photos; hidden fields do not keep records incomplete; optional Organization text fields do not count as pending; signature-only fields do not count as captured photographs. Mobile polls form fields and organization settings together, prevents overlapping pulls, keeps confirmed settings on failures, and permits completing incomplete records. Edit responses preserve server-normalized values and refreshed status flags.
- **Organization mobile:** refresh on focus, pull-to-refresh and periodic refresh while not editing; virtualized list; shared ID Cards header/progress components. This does not complete full workflow/UI parity.
- **UI:** responsive wrapping for admin detail actions; remove inactive ID Card Generator tile; visible password-recovery link; wrap login email; public brochure accessible names; bounded mobile system font scaling.
- **Crop:** Undo restores brightness/contrast as well as geometry; visible Undo action; discard confirmation for editor Back/Photos/Reset/filter/thumbnail actions and warning on page unload. Browser SPA navigation outside the editor is not fully guarded.
- **Performance/build:** lazy-loaded admin pages reduce the main JavaScript chunk from approximately 688 KB to 339 KB; add missing Expo asset/filesystem dependencies; remove obsolete face-detector props.
- **Retention:** photo cleanup is inactive unless `PHOTO_CLEANUP_ENABLED=true` is explicitly configured.

## Validation completed

- Admin TypeScript check and production build: passed.
- Backend TypeScript build: passed.
- Mobile TypeScript check: passed. Native APK build/camera behavior was not tested.
- Ten backend regression tests: passed. These use mocked database calls and an actual generated Excel workbook; they are not live PostgreSQL integration tests.
- `git diff --check`: passed.
- Browser layout automation was attempted but Chromium could not be installed in this environment. No claim is made that all screen sizes were visually verified.

## Release effects

Deploy the backend and web update together, then distribute a separately tested mobile build. Existing tokens predate the credential-version check, so users must sign in again after backend deployment. Keep the deployed database migrations current. Existing `is_super_admin=true` grants are retained; review them separately because old migrations may already have granted excessive privileges. Disabling cleanup changes the previous seven-day deletion policy; enabling it restores that policy.

## Still outstanding from the original review

1. Full School/Institute/Organization shared workflow: Organization Add Record, common category navigation, capture actions, and complete UI parity.
2. Durable create-request idempotency across lost responses, modal closure or app restart; offline upload queue.
3. Import preview, restore/backup and header-remapping workflows; confirm actual production identity/data cases on staging.
4. Crop physical-size/DPI output, original-photo restoration, redo, full zoom/pan/straighten controls and always-visible actions on every viewport.
5. Server-side pagination, thumbnails and load/concurrency testing.
6. Authenticated responsive screenshots, keyboard/font-scale checks, Android camera/gallery tests, APK permission/exported-activity review, architecture-specific distribution, and identification of the exact v140 source build.
7. Shared persistent authentication rate limiting, production permission audit, CI with reproducible dependency locks, and real-database/end-to-end tests.

## Re-run checks

```sh
npm install --prefix admin-web
npm install --prefix admin-web/backend
npm install --prefix teacher-app
npm run build --prefix admin-web
npm test --prefix admin-web/backend
cd teacher-app
npx tsc --noEmit
```
