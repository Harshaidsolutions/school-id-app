#!/usr/bin/env bash
# One-time EC2 setup for the ID Card Generator's server features:
#   - Photo AI: background removal (rembg), face centring + light correction (OpenCV)
#   - Ghostscript: PDF templates and press-ready CMYK PDF export
#
# Usage (on EC2, from the repo root):  bash admin-web/scripts/setup-photo-ai.sh
# Then: pm2 restart harsha-backend
#
# Memory: background removal loads a ~170 MB model; use an instance with 2 GB+ RAM
# (t3.small is the minimum, t3.medium recommended for large batches).
set -euo pipefail
ADMIN="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$ADMIN/backend/.photo-ai"

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y python3 python3-venv python3-pip ghostscript libgl1 libglib2.0-0
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y python3 python3-pip ghostscript mesa-libGL
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y python3 python3-pip ghostscript mesa-libGL
fi

python3 -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install "rembg[cpu]" opencv-python-headless pillow numpy

# Download the person-segmentation model now so the first job is fast
"$VENV/bin/python" - <<'PY'
from rembg import new_session
new_session("u2net_human_seg")
print("Background removal model ready")
PY

ENV_FILE="$ADMIN/backend/.env"
if [ -f "$ENV_FILE" ] && ! grep -q '^PHOTO_AI_PYTHON=' "$ENV_FILE"; then
  echo "PHOTO_AI_PYTHON=$VENV/bin/python" >> "$ENV_FILE"
  echo "Added PHOTO_AI_PYTHON to backend/.env"
else
  echo "Set PHOTO_AI_PYTHON=$VENV/bin/python in the API environment (AWS env / backend/.env)."
fi

gs --version >/dev/null && echo "Ghostscript $(gs --version) ready"
echo "Done. Restart the API: pm2 restart harsha-backend"
