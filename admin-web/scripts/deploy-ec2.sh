#!/usr/bin/env bash
# Pull → migrate → rebuild admin + API → restart (run from repo root or admin-web)
#
# Manual EC2 (from ~/school-id-app after git pull):
#   cd admin-web/backend && npm install && npm run migrate && npm run build
#   cd ..                  # admin-web/ — NOT cd ../admin-web (that path does not exist)
#   npm install && npm run build
#   rm -rf backend/public/assets && cp -r dist/* backend/public/
#   pm2 restart harsha-backend
set -euo pipefail
ADMIN="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ADMIN/.." && pwd)"

cd "$REPO"
git pull origin main

cd "$ADMIN/backend"
npm install
npm run migrate
npm run build

cd "$ADMIN"
npm install
npm run build
rm -rf "$ADMIN/backend/public/assets"
cp -r "$ADMIN/dist/"* "$ADMIN/backend/public/"

pm2 restart harsha-backend

echo "Deployed. Admin:"
head -n 12 "$ADMIN/backend/public/index.html"
