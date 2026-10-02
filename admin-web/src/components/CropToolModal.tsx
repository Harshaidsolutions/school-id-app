import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import api from "../api/client";
import { studentFieldDisplay } from "../constants/formFields";
import type { Student } from "../types";
import type { ConfiguredCategoryField } from "../utils/formFieldHelpers";
import { authenticatedStudentPhotoUrl, invalidateStudentPhotoCache } from "../utils/studentPhotoSrc";

type Rect = { x: number; y: number; w: number; h: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type Drag =
  | { kind: "move"; startX: number; startY: number; origin: Rect }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; origin: Rect }
  | { kind: "rotate"; startPointer: number; startAngle: number };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
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
  const [phase, setPhase] = useState<"edit" | "preview">("edit");
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<Rect>({ ...FULL });
  const angleRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef("");
  const paintRef = useRef(0);
  const student = gallery[index] ?? null;

  useEffect(() => {
    if (index > gallery.length - 1) setIndex(0);
  }, [gallery.length, index]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (paintRef.current) cancelAnimationFrame(paintRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSrc("");
    setPhase("edit");
    setError(null);
    rectRef.current = { ...FULL };
    angleRef.current = 0;
    previewBlobRef.current = null;
    clearPreview();
    if (!student?.photo_url) return;
    void authenticatedStudentPhotoUrl(student.id, { signal: controller.signal }).then((url) => {
      if (!cancelled) setSrc(url || "");
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [student?.id, student?.photo_url]);

  useLayoutEffect(() => {
    paintEditor();
  }, [src, phase, student?.id]);

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }

  function paintEditor() {
    const frame = frameRef.current;
    const image = imageRef.current;
    const rect = rectRef.current;
    if (frame) {
      frame.style.left = `${rect.x * 100}%`;
      frame.style.top = `${rect.y * 100}%`;
      frame.style.width = `${rect.w * 100}%`;
      frame.style.height = `${rect.h * 100}%`;
    }
    if (image) image.style.transform = `rotate(${angleRef.current}deg)`;
  }

  function schedulePaint() {
    if (paintRef.current) return;
    paintRef.current = requestAnimationFrame(() => {
      paintRef.current = 0;
      paintEditor();
    });
  }

  function localPoint(event: ReactPointerEvent | PointerEvent): { x: number; y: number } | null {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function angleAt(clientX: number, clientY: number): number {
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame) return 0;
    const cx = frame.left + frame.width / 2;
    const cy = frame.top + frame.height / 2;
    return Math.atan2(clientX - cx, cy - clientY);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (phase !== "edit") return;
    const point = localPoint(event);
    const box = stageRef.current?.getBoundingClientRect();
    if (!point || !box) return;
    const hit = hitTest(event.clientX, event.clientY, rectRef.current, box);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit === "rotate") {
      dragRef.current = {
        kind: "rotate",
        startPointer: angleAt(event.clientX, event.clientY),
        startAngle: angleRef.current,
      };
      return;
    }
    if (hit === "move") {
      dragRef.current = { kind: "move", startX: point.x, startY: point.y, origin: { ...rectRef.current } };
      return;
    }
    dragRef.current = { kind: "resize", handle: hit, startX: point.x, startY: point.y, origin: { ...rectRef.current } };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag) {
      const box = stage?.getBoundingClientRect();
      if (box) {
        const hit = hitTest(event.clientX, event.clientY, rectRef.current, box);
        event.currentTarget.style.cursor = cursorFor(hit);
      }
      return;
    }
    if (drag.kind === "rotate") {
      const current = angleAt(event.clientX, event.clientY);
      angleRef.current = drag.startAngle + ((current - drag.startPointer) * 180) / Math.PI;
      event.currentTarget.style.cursor = "grabbing";
      schedulePaint();
      return;
    }
    const point = localPoint(event);
    if (!point) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    rectRef.current =
      drag.kind === "move"
        ? clampRect({ ...drag.origin, x: drag.origin.x + dx, y: drag.origin.y + dy })
        : clampRect(resizeRect(drag.origin, drag.handle, dx, dy));
    event.currentTarget.style.cursor = cursorFor(drag.kind === "move" ? "move" : drag.handle);
    schedulePaint();
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function applyOk() {
    const image = imageRef.current;
    if (!image || !src || applying || !image.naturalWidth) return;
    setApplying(true);
    setError(null);
    try {
      const blob = await renderCrop(image, angleRef.current, rectRef.current);
      clearPreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      previewBlobRef.current = blob;
      setPreviewUrl(url);
      setPhase("preview");
    } catch {
      setError("Could not prepare the crop preview.");
    } finally {
      setApplying(false);
    }
  }

  async function saveCrop() {
    const blob = previewBlobRef.current;
    if (!student || !blob || saving) return;
    setSaving(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("photo", blob, `${student.photo_id || student.id}.jpg`);
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
          <h2 className="text-lg font-semibold text-[#334155]">Cropping Tool</h2>
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
            <h2 className="text-lg font-semibold text-[#334155]">Cropping Tool</h2>
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
              <label key={field.key} className="text-xs font-semibold text-[#334155]">
                {`${field.label}-wise`}
                <select
                  className="input-field mt-1 min-w-[10rem]"
                  value={filters[field.key] ?? ""}
                  onChange={(event) => {
                    setFilters((current) => ({ ...current, [field.key]: event.target.value }));
                    setIndex(0);
                  }}
                >
                  <option value="">{`Select ${field.label}`}</option>
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
            <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-auto p-4">
              {phase === "preview" && previewUrl ? (
                <img src={previewUrl} alt="Cropped preview" className="max-h-[58vh] max-w-full object-contain" />
              ) : src && student ? (
                <div
                  className="relative touch-none px-3 pt-12"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                >
                  <div ref={stageRef} className="relative inline-block max-h-[52vh] max-w-full">
                  <img
                    ref={imageRef}
                    src={src}
                    alt={student.student_name ?? "Photo"}
                    draggable={false}
                    className="block max-h-[52vh] max-w-full select-none"
                    style={{ transformOrigin: "center center" }}
                    onLoad={paintEditor}
                  />
                  <div className="pointer-events-none absolute inset-0">
                    <div
                      ref={frameRef}
                      className="absolute border-2 border-white"
                      style={{ left: 0, top: 0, width: "100%", height: "100%", boxShadow: "0 0 0 9999px rgba(30, 27, 75, 0.55)" }}
                    >
                      {HANDLES.map((handle) => (
                        <span
                          key={handle}
                          className="pointer-events-none absolute h-3.5 w-3.5 rounded-sm border-2 border-[#6366F1] bg-white"
                          style={handleStyle(handle)}
                        />
                      ))}
                      <span className="pointer-events-none absolute left-1/2 top-0 h-5 w-px -translate-x-1/2 -translate-y-full bg-white" />
                      <span
                        className="pointer-events-none absolute left-1/2 top-0 flex h-8 w-8 -translate-x-1/2 -translate-y-[2.15rem] items-center justify-center rounded-full border-2 border-[#6366F1] bg-white text-[#6366F1] shadow"
                        aria-hidden
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 12a8 8 0 1 1-2.2-5.5" />
                          <path d="M20 4v4h-4" />
                        </svg>
                      </span>
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/80">{student ? "Loading photo…" : "Choose a photo."}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#1E1B4B] px-3 py-2">
              <button type="button" className="btn-secondary" disabled={!student || index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <button type="button" className="btn-secondary" disabled={!student || index >= gallery.length - 1} onClick={() => setIndex((value) => Math.min(gallery.length - 1, value + 1))}>Next</button>
              {phase === "preview" ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setPhase("edit");
                    previewBlobRef.current = null;
                    clearPreview();
                  }}
                >
                  Back
                </button>
              ) : (
                <button type="button" className="btn-secondary" disabled={!src || applying} onClick={() => void applyOk()}>
                  {applying ? "Preparing…" : "OK"}
                </button>
              )}
              <button type="button" className="btn-primary" disabled={phase !== "preview" || saving} onClick={() => void saveCrop()}>
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
  }, [student.id, student.photo_url, student.photo_captured_at, student.updated_at]);
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
      <span className="min-w-0 truncate text-xs font-semibold text-[#334155]">
        {student.photo_id || student.student_name || "Photo"}
      </span>
    </button>
  );
}

function categoryValue(student: Student, field: ConfiguredCategoryField): string {
  const shown = studentFieldDisplay(student, field.key, field.label).trim();
  if (shown && shown !== "—") return shown;
  if (field.kind === "class" && student.class_section?.trim()) return student.class_section.trim();
  return "";
}

function hitTest(
  clientX: number,
  clientY: number,
  rect: Rect,
  box: DOMRect
): Handle | "move" | "rotate" | null {
  const x = box.left + rect.x * box.width;
  const y = box.top + rect.y * box.height;
  const w = rect.w * box.width;
  const handleX = x + w / 2;
  const handleY = y - 34;
  if (Math.hypot(clientX - handleX, clientY - handleY) <= 20) return "rotate";
  const px = clientX - box.left;
  const py = clientY - box.top;
  const local = handleAt(px, py, rect, box.width, box.height);
  return local;
}

function handleStyle(handle: Handle): { left: string | number; top: string | number; transform: string } {
  const pos: Record<Handle, { left: string | number; top: string | number }> = {
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

function clampRect(rect: Rect): Rect {
  const w = Math.min(1, Math.max(MIN_SIZE, rect.w));
  const h = Math.min(1, Math.max(MIN_SIZE, rect.h));
  return {
    x: Math.min(1 - w, Math.max(0, rect.x)),
    y: Math.min(1 - h, Math.max(0, rect.y)),
    w,
    h,
  };
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
    if (Math.hypot(px - hx, py - hy) <= 14) return handle;
  }
  if (px >= x && px <= x + w && py >= y && py <= y + h) return "move";
  return null;
}

function cursorFor(hit: Handle | "move" | "rotate" | null): string {
  if (hit === "rotate") return "grab";
  if (hit === "move") return "move";
  if (hit === "n" || hit === "s") return "ns-resize";
  if (hit === "e" || hit === "w") return "ew-resize";
  if (hit === "nw" || hit === "se") return "nwse-resize";
  if (hit === "ne" || hit === "sw") return "nesw-resize";
  return "default";
}

function renderCrop(image: HTMLImageElement, rotation: number, crop: Rect): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const rotated = document.createElement("canvas");
    rotated.width = width;
    rotated.height = height;
    const ctx = rotated.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas is unavailable"));
      return;
    }
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(image, -width / 2, -height / 2);
    const sx = crop.x * width;
    const sy = crop.y * height;
    const sw = Math.max(1, crop.w * width);
    const sh = Math.max(1, crop.h * height);
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
