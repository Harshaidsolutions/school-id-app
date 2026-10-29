#!/usr/bin/env python3
"""
Photo AI worker for the bulk ID Card Generator.

Runs as one long-lived process started by the Node API (src/utils/photoAi.ts).
Reads one JSON job per line on stdin and answers one JSON line on stdout:

  job:   {"id": "...", "in": "/tmp/a.jpg", "out": "/tmp/a.png",
          "removeBg": true, "bg": "#ffffff", "face": true, "enhance": true,
          "w": 600, "h": 750}
  reply: {"id": "...", "ok": true, "faces": 1, "steps": ["bg", "face", "enhance"]}

Optional libraries (installed by admin-web/scripts/setup-photo-ai.sh):
  rembg + onnxruntime  -> background removal
  opencv-python-headless -> face detection, CLAHE light/contrast correction
Pillow and numpy are required. Missing optional libraries only disable that step.
"""
import json
import sys
import traceback

import numpy as np
from PIL import Image, ImageFilter, ImageOps

try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover - depends on server
    cv2 = None

_rembg_session = None
_rembg_error = None


def rembg_available():
    try:
        import rembg  # noqa: F401  # type: ignore
        return True
    except Exception:
        return False


def remove_background(img):
    """Return an RGBA image with the background removed (person segmentation)."""
    global _rembg_session, _rembg_error
    from rembg import new_session, remove  # type: ignore
    if _rembg_session is None:
        try:
            _rembg_session = new_session("u2net_human_seg")
        except Exception as exc:  # model download failed: fall back to the general model
            _rembg_error = str(exc)
            _rembg_session = new_session("u2net")
    out = remove(img.convert("RGB"), session=_rembg_session)
    return out.convert("RGBA")


def hex_to_rgb(value, default=(255, 255, 255)):
    try:
        v = value.strip().lstrip("#")
        if len(v) == 3:
            v = "".join(c * 2 for c in v)
        return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default


def flatten(img, rgb):
    if img.mode != "RGBA":
        return img.convert("RGB")
    base = Image.new("RGB", img.size, rgb)
    base.paste(img, mask=img.split()[3])
    return base


_cascade = None


def detect_face(img):
    """Largest face as (x, y, w, h) in image pixels, or None."""
    global _cascade
    if cv2 is None:
        return None
    if _cascade is None:
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        _cascade = cv2.CascadeClassifier(path)
        if _cascade.empty():
            return None
    rgb = np.array(img.convert("RGB"))
    scale = 800.0 / max(rgb.shape[0], rgb.shape[1])
    scale = min(1.0, scale)
    small = cv2.resize(rgb, None, fx=scale, fy=scale) if scale < 1 else rgb
    gray = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    gray = cv2.equalizeHist(gray)
    min_side = max(24, int(min(gray.shape) * 0.08))
    faces = _cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(min_side, min_side))
    if len(faces) == 0:
        return None
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    return (x / scale, y / scale, w / scale, h / scale)


def face_crop(img, face, out_w, out_h, fill_rgb):
    """Crop so the face is centred horizontally, eyes sit ~40% from the top, and every
    photo has the same face size (passport style). Pads with the background colour."""
    aspect = out_w / float(out_h)
    if face is not None:
        fx, fy, fw, fh = face
        crop_h = fh / 0.46            # face box fills ~46% of the photo height
        crop_w = crop_h * aspect
        cx = fx + fw / 2.0
        cy = fy + fh * 0.45           # slightly above the face-box centre
        left = cx - crop_w / 2.0
        top = cy - crop_h * 0.42
    else:
        # No face found: keep the upper-centre of the photo (where heads usually are)
        w, h = img.size
        if w / float(h) > aspect:
            crop_h = h
            crop_w = h * aspect
        else:
            crop_w = w
            crop_h = w / aspect
        left = (w - crop_w) / 2.0
        top = max(0.0, (h - crop_h) * 0.2)
    box = (int(round(left)), int(round(top)), int(round(left + crop_w)), int(round(top + crop_h)))
    canvas = Image.new(img.mode, (box[2] - box[0], box[3] - box[1]),
                       fill_rgb + ((0,) if img.mode == "RGBA" else ()))
    canvas.paste(img, (-box[0], -box[1]))
    return canvas.resize((out_w, out_h), Image.LANCZOS)


def enhance(img):
    """Auto light/contrast for print: CLAHE on lightness, gentle brightness lift, light sharpen."""
    alpha = img.split()[3] if img.mode == "RGBA" else None
    rgb = img.convert("RGB")
    if cv2 is not None:
        arr = np.array(rgb)
        lab = cv2.cvtColor(arr, cv2.COLOR_RGB2LAB)
        l_chan, a_chan, b_chan = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_chan = clahe.apply(l_chan)
        mean = float(l_chan.mean())
        if mean < 120:  # dark photo: lift mid-tones
            gamma = max(0.6, min(1.0, mean / 135.0))
            table = np.array([((i / 255.0) ** gamma) * 255 for i in range(256)]).astype("uint8")
            l_chan = cv2.LUT(l_chan, table)
        arr = cv2.cvtColor(cv2.merge((l_chan, a_chan, b_chan)), cv2.COLOR_LAB2RGB)
        rgb = Image.fromarray(arr)
    else:
        rgb = ImageOps.autocontrast(rgb, cutoff=1)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.6, percent=70, threshold=3))
    if alpha is not None:
        rgb = rgb.convert("RGBA")
        rgb.putalpha(alpha)
    return rgb


def process(job):
    steps = []
    img = Image.open(job["in"])
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGBA") if img.mode in ("RGBA", "LA", "P") else img.convert("RGB")
    fill = hex_to_rgb(job.get("bg") or "#ffffff")
    out_w = int(job.get("w") or 600)
    out_h = int(job.get("h") or 750)

    face = detect_face(img) if job.get("face") else None
    if job.get("removeBg"):
        if not rembg_available():
            raise RuntimeError("Background removal is not installed on the server (run setup-photo-ai.sh)")
        img = remove_background(img)
        steps.append("bg")
    if job.get("face"):
        img = face_crop(img, face, out_w, out_h, fill)
        steps.append("face" if face is not None else "centre")
    else:
        img = ImageOps.fit(img, (out_w, out_h), Image.LANCZOS, centering=(0.5, 0.35))
    if job.get("enhance"):
        img = enhance(img)
        steps.append("enhance")
    img = flatten(img, fill) if job.get("removeBg") else img.convert("RGB")
    img.save(job["out"], "PNG", optimize=False)
    return {"faces": 1 if face is not None else 0, "steps": steps}


def main():
    print(json.dumps({"ready": True, "rembg": rembg_available(), "cv2": cv2 is not None}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        job_id = None
        try:
            job = json.loads(line)
            job_id = job.get("id")
            result = process(job)
            print(json.dumps({"id": job_id, "ok": True, **result}), flush=True)
        except Exception as exc:  # report and keep serving
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"id": job_id, "ok": False, "error": str(exc)}), flush=True)


if __name__ == "__main__":
    main()
