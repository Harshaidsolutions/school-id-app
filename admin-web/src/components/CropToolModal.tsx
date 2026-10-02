import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import api from "../api/client";
import type { Student } from "../types";
import type { ConfiguredCategoryField } from "../utils/formFieldHelpers";
import { authenticatedStudentPhotoUrl, invalidateStudentPhotoCache } from "../utils/studentPhotoSrc";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "new"; startX: number; startY: number }
  | { kind: "move"; startX: number; startY: number; origin: Rect }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; origin: Rect };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 0.04;

export function CropToolModal({
  students,
  categories,
  onClose,
  onSaved,
}: {
  students: Student[];
  categories: ConfiguredCategoryField[];
  onClose: () => void;
  onSaved: (student: Student) => void;
}) {
  const photos = useMemo(
    () => students.filter((student) => Boolean(student.photo_url)),
    [students]
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const gallery = useMemo(() => {
    return photos.filter((student) =>
      categories.every((field) => {
        const selected = filters[field.key];
        if (!selected) return true;
        return categoryValue(student, field) === selected;
      })
    );
  }, [photos, categories, filters]);
  const options = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const field of categories) {
      const values = new Set<string>();
      for (const student of photos) {
        const value = categoryValue(student, field);
        if (value) values.add(value);
      }
      next[field.key] = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }
    return next;
  }, [photos, categories]);

  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState("");
  const [rotation, setRotation] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [phase, setPhase] = useState<"edit" | "preview">("edit");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState("crosshair");
  const imageRef = useRef<HTMLImageElement | null>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const previewUrlRef = useRef("");
  const student = gallery[index] ?? null;

  useEffect(() => {
    if (index > gallery.length - 1) setIndex(0);
  }, [gallery.length, index]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSrc("");
    setRotation(0);
    setRect(null);
    setPhase("edit");
    setPreviewBlob(null);
    setError(null);
    clearPreview();
    if (!student?.photo_url) return;
    void authenticatedStudentPhotoUrl(student.id, { signal: controller.signal }).then((url) => {
      if (!cancelled) setSrc(url || "");
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [student?.id, student?.photo_captured_at]);

  useEffect(() => {
    const image = imageRef.current;
    const view = viewRef.current;
    if (!image || !view || phase !== "edit" || !src) return;
    const paint = () => {
      const rad = (rotation * Math.PI) / 180;
      const box = rotatedSize(image.naturalWidth, image.naturalHeight, rad);
      const scale = Math.min(1, 1100 / Math.max(box.width, box.height));
      view.width = Math.max(1, Math.round(box.width * scale));
      view.height = Math.max(1, Math.round(box.height * scale));
      const ctx = view.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, view.width, view.height);
      ctx.save();
      ctx.translate(view.width / 2, view.height / 2);
      ctx.rotate(rad);
      ctx.scale(scale, scale);
      ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
      ctx.restore();
    };
    if (image.complete && image.naturalWidth) paint();
    else image.addEventListener("load", paint, { once: true });
    return () => image.removeEventListener("load", paint);
  }, [rotation, src, phase]);

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }

  function setAngle(value: number) {
    setRotation(wrapAngle(value));
    setPhase("edit");
    setPreviewBlob(null);
    clearPreview();
  }

  function localPoint(event: PointerEvent<HTMLDivElement>): { x: number; y: number } | null {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (phase !== "edit") return;
    const point = localPoint(event);
    const box = stageRef.current?.getBoundingClientRect();
    if (!point || !box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (rect) {
      const hit = handleAt(point.x * box.width, point.y * box.height, rect, box.width, box.height);
      if (hit && hit !== "move") {
        dragRef.current = { kind: "resize", handle: hit, startX: point.x, startY: point.y, origin: rect };
        return;
      }
      if (hit === "move") {
        dragRef.current = { kind: "move", startX: point.x, startY: point.y, origin: rect };
        return;
      }
    }
    dragRef.current = { kind: "new", startX: point.x, startY: point.y };
    setRect({ x: point.x, y: point.y, w: 0, h: 0 });
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const point = localPoint(event);
    const box = stageRef.current?.getBoundingClientRect();
    if (!point || !box) return;
    const drag = dragRef.current;
    if (!drag) {
      if (!rect) {
        setCursor("crosshair");
        return;
      }
      const hit = handleAt(point.x * box.width, point.y * box.height, rect, box.width, box.height);
      setCursor(cursorFor(hit ?? "new"));
      return;
    }
    if (drag.kind === "new") {
      setRect(clampRect(rectFromPoints(drag.startX, drag.startY, point.x, point.y), false));
      setCursor("crosshair");
      return;
    }
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    if (drag.kind === "move") {
      setRect(clampRect({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy }));
      setCursor("move");
      return;
    }
    setRect(clampRect(resizeRect(drag.origin, drag.handle, dx, dy)));
    setCursor(cursorFor(drag.handle));
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === "new") {
      setRect((current) => (current && (current.w < MIN_SIZE || current.h < MIN_SIZE) ? null : current));
    }
  }

  async function applyOk() {
    const image = imageRef.current;
    if (!image || !src || applying) return;
    setApplying(true);
    setError(null);
    try {
      const blob = await renderCrop(image, rotation, rect ?? { x: 0, y: 0, w: 1, h: 1 });
      clearPreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewBlob(blob);
      setPhase("preview");
    } catch {
      setError("Could not prepare the crop preview.");
    } finally {
      setApplying(false);
    }
  }

  async function saveCrop() {
    if (!student || !previewBlob || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", previewBlob, `${student.photo_id || student.id}.jpg`);
      const { data } = await api.post<{ student: Student }>(`/admin/students/${student.id}/photo`, body);
      invalidateStudentPhotoCache(student.id);
      onSaved(data.student);
    } catch {
      setError("Could not save the cropped photo.");
    } finally {
      setSaving(false);
    }
  }

  if (!photos.length) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#312E81]/35 px-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_18px_48px_rgba(99,102,241,0.16)]">
          <h2 className="text-lg font-semibold text-[#1E293B]">Cropping Tool</h2>
          <p className="mt-2 text-sm text-[#64748B]">No captured photos for this school or institute yet.</p>
          <button type="button" className="btn-primary mt-4" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#312E81]/35 px-3 py-4" role="dialog" aria-modal="true" aria-label="Cropping Tool">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_18px_48px_rgba(99,102,241,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Cropping Tool</h2>
            <p className="text-xs text-[#64748B]">
              {student ? student.student_name ?? "Student" : "No photos in this filter"}
              {student?.photo_id ? ` · Photo ${student.photo_id}` : ""}
              {student ? ` · ${index + 1} of ${gallery.length}` : ""}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-3 border-b border-[#E2E8F0] px-4 py-3">
            {categories.map((field) => (
              <label key={field.key} className="text-xs font-semibold text-[#1E293B]">
                {field.label}
                <select
                  className="input-field mt-1 min-w-[10rem]"
                  value={filters[field.key] ?? ""}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, [field.key]: event.target.value }));
                    setIndex(0);
                  }}
                >
                  <option value="">{`All ${field.label}`}</option>
                  {(options[field.key] ?? []).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[11rem_minmax(0,1fr)]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">
            {gallery.map((item, itemIndex) => (
              <GalleryThumb
                key={item.id}
                student={item}
                active={itemIndex === index}
                onClick={() => setIndex(itemIndex)}
              />
            ))}
            {gallery.length === 0 ? (
              <p className="px-1 text-xs text-[#64748B]">No photos match this filter.</p>
            ) : null}
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-[#312E81]">
            <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-hidden p-4">
              {phase === "preview" && previewUrl ? (
                <img src={previewUrl} alt="Cropped preview" className="max-h-[58vh] max-w-full object-contain" />
              ) : src && student ? (
                <div ref={stageRef} className="relative inline-block max-h-[58vh] max-w-full">
                  <img ref={imageRef} src={src} alt="" className="pointer-events-none absolute h-px w-px opacity-0" />
                  <canvas ref={viewRef} className="block max-h-[58vh] max-w-full" />
                  <div
                    className="absolute inset-0 touch-none"
                    style={{ cursor }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                  >
                    {rect ? <CropFrame rect={rect} /> : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/80">{student ? "Loading photo…" : "Choose a photo."}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#1E1B4B] px-3 py-2">
              <button type="button" className="btn-secondary" disabled={!student || index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <button type="button" className="btn-secondary" disabled={!student || index >= gallery.length - 1} onClick={() => setIndex((value) => Math.min(gallery.length - 1, value + 1))}>Next</button>
              <label className="text-xs font-semibold text-white">
                Rotate
                <select
                  aria-label="Rotate"
                  className="ml-2 rounded-lg border border-white/20 bg-white px-2 py-1.5 text-xs font-semibold text-[#1E293B]"
                  value=""
                  onChange={(event) => {
                    const action = event.target.value;
                    if (action === "left") setAngle(rotation - 90);
                    if (action === "right") setAngle(rotation + 90);
                    if (action === "reset") setAngle(0);
                  }}
                >
                  <option value="">Choose</option>
                  <option value="left">Rotate Left</option>
                  <option value="right">Rotate Right</option>
                  <option value="reset">Reset</option>
                </select>
              </label>
              <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-xs font-semibold text-white">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={1}
                  value={clampAngle(rotation)}
                  aria-label="Rotation angle"
                  onChange={(event) => setAngle(Number(event.target.value))}
                  className="w-full accent-[#C4B5FD]"
                />
                <input
                  type="number"
                  min={-180}
                  max={180}
                  value={clampAngle(rotation)}
                  aria-label="Rotation degrees"
                  onChange={(event) => setAngle(Number(event.target.value))}
                  className="w-16 rounded-lg border border-white/20 bg-white px-2 py-1 text-xs text-[#1E293B]"
                />
              </label>
              {phase === "preview" ? (
                <button type="button" className="btn-secondary" onClick={() => { setPhase("edit"); setPreviewBlob(null); clearPreview(); }}>Back</button>
              ) : (
                <button type="button" className="btn-secondary" disabled={!src || applying} onClick={() => void applyOk()}>
                  {applying ? "Preparing…" : "OK"}
                </button>
              )}
              <button type="button" className="btn-primary" disabled={!previewBlob || saving} onClick={() => void saveCrop()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            {error ? <p className="px-3 pb-2 text-sm text-[#FECACA]">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryThumb({
  student,
  active,
  onClick,
}: {
  student: Student;
  active: boolean;
  onClick: () => void;
}) {
  const holder = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const node = holder.current;
    if (!node || !student.photo_url) return;
    let cancelled = false;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void authenticatedStudentPhotoUrl(student.id, { thumb: true, signal: controller.signal }).then((url) => {
          if (!cancelled && url) setSrc(url);
        });
      },
      { root: node.parentElement, rootMargin: "120px" }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
    };
  }, [student.id, student.photo_url, student.photo_captured_at]);
  return (
    <button
      ref={holder}
      type="button"
      onClick={onClick}
      className={`flex w-24 shrink-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left lg:w-full ${
        active ? "border-[#8B5CF6] bg-[#F5F3FF]" : "border-[#E2E8F0] bg-white"
      }`}
    >
      {src ? (
        <img src={src} alt="" className="h-10 w-10 rounded-md object-cover" />
      ) : (
        <span className="block h-10 w-10 animate-pulse rounded-md bg-[#EEF2FF]" />
      )}
      <span className="min-w-0 truncate text-xs font-semibold text-[#1E293B]">
        {student.photo_id || student.student_name || "Photo"}
      </span>
    </button>
  );
}

function CropFrame({ rect }: { rect: Rect }) {
  return (
    <div
      className="absolute border-2 border-white"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
        boxShadow: "0 0 0 9999px rgba(30, 27, 75, 0.55)",
      }}
    >
      {HANDLES.map((handle) => (
        <span
          key={handle}
          className="pointer-events-none absolute h-3 w-3 rounded-sm border-2 border-[#6366F1] bg-white"
          style={handleStyle(handle)}
        />
      ))}
    </div>
  );
}

function handleStyle(handle: Handle): CSSProperties {
  const pos: Record<Handle, React.CSSProperties> = {
    nw: { left: 0, top: 0 },
    n: { left: "50%", top: 0 },
    ne: { left: "100%", top: 0 },
    e: { left: "100%", top: "50%" },
    se: { left: "100%", top: "100%" },
    s: { left: "50%", top: "100%" },
    sw: { left: 0, top: "100%" },
    w: { left: 0, top: "50%" },
  };
  return { ...pos[handle], transform: "translate(-50%, -50%)" };
}

function categoryValue(student: Student, field: ConfiguredCategoryField): string {
  const extra = student.extra_fields?.[field.key];
  if (extra != null && String(extra).trim()) return String(extra).trim();
  if (field.kind === "class" && student.class_section?.trim()) return student.class_section.trim();
  return "";
}

function wrapAngle(value: number): number {
  if (!Number.isFinite(value)) return 0;
  let next = value % 360;
  if (next > 180) next -= 360;
  if (next <= -180) next += 360;
  return Math.round(next * 10) / 10;
}

function clampAngle(value: number): number {
  return Math.max(-180, Math.min(180, Math.round(value)));
}

function rotatedSize(width: number, height: number, radians: number) {
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.max(1, width * cos + height * sin),
    height: Math.max(1, width * sin + height * cos),
  };
}

function rectFromPoints(x1: number, y1: number, x2: number, y2: number): Rect {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

function clampRect(rect: Rect, enforceMin = true): Rect {
  let w = Math.min(1, Math.max(0, rect.w));
  let h = Math.min(1, Math.max(0, rect.h));
  if (enforceMin) {
    w = Math.max(MIN_SIZE, w);
    h = Math.max(MIN_SIZE, h);
  }
  w = Math.min(1, w);
  h = Math.min(1, h);
  const x = Math.min(1 - w, Math.max(0, rect.x));
  const y = Math.min(1 - h, Math.max(0, rect.y));
  return { x, y, w, h };
}

function resizeRect(origin: Rect, handle: Handle, dx: number, dy: number): Rect {
  let { x, y, w, h } = origin;
  if (handle.includes("w")) {
    x += dx;
    w -= dx;
  }
  if (handle.includes("e")) w += dx;
  if (handle.includes("n")) {
    y += dy;
    h -= dy;
  }
  if (handle.includes("s")) h += dy;
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  return { x, y, w, h };
}

function handleAt(
  px: number,
  py: number,
  rect: Rect,
  width: number,
  height: number
): Handle | "move" | null {
  const x = rect.x * width;
  const y = rect.y * height;
  const w = rect.w * width;
  const h = rect.h * height;
  const points: Record<Handle, [number, number]> = {
    nw: [x, y],
    n: [x + w / 2, y],
    ne: [x + w, y],
    e: [x + w, y + h / 2],
    se: [x + w, y + h],
    s: [x + w / 2, y + h],
    sw: [x, y + h],
    w: [x, y + h / 2],
  };
  for (const handle of HANDLES) {
    const [hx, hy] = points[handle];
    if (Math.hypot(px - hx, py - hy) <= 12) return handle;
  }
  if (px >= x && px <= x + w && py >= y && py <= y + h) return "move";
  return null;
}

function cursorFor(hit: Handle | "move" | "new"): string {
  if (hit === "move") return "move";
  if (hit === "n" || hit === "s") return "ns-resize";
  if (hit === "e" || hit === "w") return "ew-resize";
  if (hit === "nw" || hit === "se") return "nwse-resize";
  if (hit === "ne" || hit === "sw") return "nesw-resize";
  return "crosshair";
}

function renderCrop(image: HTMLImageElement, rotation: number, crop: Rect): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const rad = (rotation * Math.PI) / 180;
    const box = rotatedSize(image.naturalWidth, image.naturalHeight, rad);
    const rotated = document.createElement("canvas");
    rotated.width = Math.max(1, Math.round(box.width));
    rotated.height = Math.max(1, Math.round(box.height));
    const ctx = rotated.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas is unavailable"));
      return;
    }
    ctx.translate(rotated.width / 2, rotated.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    const sx = crop.x * rotated.width;
    const sy = crop.y * rotated.height;
    const sw = Math.max(1, crop.w * rotated.width);
    const sh = Math.max(1, crop.h * rotated.height);
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(sw));
    output.height = Math.max(1, Math.round(sh));
    const out = output.getContext("2d");
    if (!out) {
      reject(new Error("Canvas is unavailable"));
      return;
    }
    out.drawImage(rotated, sx, sy, sw, sh, 0, 0, output.width, output.height);
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the photo"));
    }, "image/jpeg", 0.95);
  });
}
