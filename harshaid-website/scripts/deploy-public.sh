#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
TARGET=/var/www/harshaidsolutions
[[ -f "$SOURCE/index.html" ]] || { echo 'Website source missing'; exit 1; }
[[ -d "$TARGET" ]] || { echo 'Expected public web root missing. Check Nginx root first.'; exit 1; }
sudo cp -a "$TARGET" "${TARGET}-backup-$(date +%Y%m%d%H%M%S)"
sudo cp -a "$SOURCE/." "$TARGET/"
# Support clean URLs even when Nginx has only try_files $uri $uri/ /index.html.
while read -r route source; do
  sudo mkdir -p "$TARGET/$route"
  sudo cp "$SOURCE/$source" "$TARGET/$route/index.html"
done <<'ROUTES'
about-us about.html
contact-us contact.html
brochures gallery.html
get-in-touch get-in-touch.html
my-app my-app.html
videos videos.html
buy-now buy-now.html
ROUTES
printf '%s\n' 'Public website updated. Open an Incognito tab to check it.'
