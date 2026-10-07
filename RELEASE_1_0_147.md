# My School ID Card 1.0.147

- School/Institute action boxes now use a consistent four-column desktop/two-column mobile layout, with wrapping controls and vertical scrolling when the expanded controls need more room.
- School link, Copy and Share are hidden by default under + Link. Click again to collapse. Existing links remain unchanged.
- The expanded panel includes parent-form class choices, one class per line (commas also supported). Existing school classes populate the initial choices. Save class choices updates the same link.
- Parent forms require Student Photo, Student Name and Class. Class is a dropdown and the backend rejects missing or unlisted choices. Name and Class must be enabled in Form Setup. Hidden optional fields remain hidden.
- Child-admin uploaded logos and the Harsha sidebar logo share the same 148 x 120 pixel contain frame. Images keep their aspect ratio.
- Crop preview supports brightness/contrast after OK. Save renders from the original accepted crop and current adjustments so effects are applied once. Output dimensions and backend-success cropped status are preserved.
- Reset, Photos, OK/Edit crop, Save and Undo are in the bottom action bar.
- School and Institute names stay on a single line; long names have ellipsis and a full-name title.
- Android UI is unchanged in this release. Only version metadata advances to 1.0.147 / 147.

Validation: backend build and 37 tests; admin production build; browser checks at 390/768/1024/1366px; required class form, collapsed panel, logo frame; wheel zoom, post-OK tone preview, saved JPEG pixel check ensuring brightness is applied once, and preserved 413 x 531 crop dimensions. Local PostgreSQL-compatible checks passed for valid classes, invalid/missing class rejection, duplicate prevention, IDs and capture metadata.

Deployment: run Apply-Push-Merge.ps1 from the extracted ZIP in Windows PowerShell. Requires main at 1.0.146, creates a separate worktree and preserves local edits. It never force-pushes.
Then from the EC2 repository root:
  git pull --ff-only origin main
  bash admin-web/scripts/deploy-ec2.sh
The migration adds schools.parent_form_classes before backend restart. Existing school classes are the fallback for old links until choices are explicitly saved.

Optional APK rebuild: run Update-Build-APK.ps1 after deployment. Output Desktop\MySchoolIDCard-v1.0.147.apk. Uses the existing C:\s1006000246\teacher-app native build folder.

This package has not been deployed or tested against the live database or on a physical phone. No APK was built in this environment.
