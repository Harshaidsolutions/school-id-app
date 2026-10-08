# Release 1.0.149

- Crop page: Back to Schools / Institutes, with unsaved-edit confirmation; one bottom Rotate image dropdown (left/right 90 degrees); medium 124x88 sidebar logo.
- Colourful form switches. Parent-form toggle updates optimistically with rollback on server failure; app refreshes while focused/foreground every two seconds, without overlapping requests. Network delay still applies.
- Circular home/drawer logo background; equal-width product Close / Book Now controls.
- Removed duplicate "Use the photo above" rows; Photo Number fallback replaces ID label. Excel edit aliases now save current values, including cleared values and separate parent names. Parent Phone is no longer mistaken for Parent Name.
- Product booking includes image and an English request with product name. The message is also copied as a fallback if the installed WhatsApp version omits its caption.
- Public website: refreshed shared typography, colours, cards, navigation, responsive homepage, reduced-motion-aware animation, functional product catalogue on Buy Now. Book Now targets the configured business with name, message and image URL. Share product image uses native sharing where supported (user chooses WhatsApp and recipient).

Validation: admin production build; mobile TypeScript; 8 mobile regression tests including stale Excel aliases; browser crop rotation/save and responsive controls; public routes at 390/768/1366 widths and booking URL payload.
Physical Android WhatsApp, APK build, live deployment and two-device refresh remain to verify on the user's devices.

After push/merge, on EC2 from the repository root:

    git pull --ff-only origin main
    bash admin-web/scripts/deploy-ec2.sh

Public site uses /var/www/harshaidsolutions in the checked-in Nginx configuration. Confirm the live root matches, then back up and copy the static files:

    sudo cp -a /var/www/harshaidsolutions /var/www/harshaidsolutions-backup-$(date +%Y%m%d%H%M%S)
    sudo cp -a harshaid-website/. /var/www/harshaidsolutions/

Rebuild/install APK using Update-Build-APK.ps1 for the mobile changes. No database migration added in this release.
