import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import api from "../api/client";
import { studentFieldDisplay } from "../constants/formFields";
import type { Student } from "../types";
import type { ConfiguredCategoryField } from "../utils/formFieldHelpers";
import { authenticatedStudentPhotoUrl, invalidateStudentPhotoCache } from "../utils/studentPhotoSrc";

type Crop = { cx: number; cy: number; w: number; h: number; angle: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type Hit = Handle | "move" | "rotate";
type Drag =
  | { kind: "move"; startX: number; startY: number; origin: Crop }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; origin: Crop }
  | { kind: "rotate"; startPointer: number; origin: Crop };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 0.04;
const FULL: Crop = { cx: 0.5, cy: 0.5, w: 1, h: 1, angle: 0 };

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
  const field = useMemo(() => primaryCategory(categories), [categories]);
  const photos = useMemo(
    () => students.filter((student) => Boolean(student.photo_url)),
    [students]
  );
  const [selected, setSelected] = useState("");
  const gallery = useMemo(() => {
    if (!field || !selected) return photos;
    return photos.filter((student) => categoryValue(student, field) === selected);
  }, [photos, field, selected]);
  const options = useMemo(() => {
    if (!field) return [];
    const values = new Set<string>();
    for (const student of photos) {
      const value = categoryValue(student, field);
      if (value) values.add(value);
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [photos, field]);

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
  const cropRef = useRef<Crop>({ ...FULL });
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
    cropRef.current = { ...FULL };
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
    paintFrame();
  }, [src, phase, student?.id]);

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }

  function paintFrame() {
    const frame = frameRef.current;
    const crop = cropRef.current;
    if (!frame) return;
    frame.style.left = `${(crop.cx - crop.w / 2) * 100}%`;
    frame.style.top = `${(crop.cy - crop.h / 2) * 100}%`;
    frame.style.width = `${crop.w * 100}%`;
    frame.style.height = `${crop.h * 100}%`;
    frame.style.transform = `rotate(${crop.angle}deg)`;
  }

  function schedulePaint() {
    if (paintRef.current) return;
    paintRef.current = requestAnimationFrame(() => {
      paintRef.current = 0;
      paintFrame();
    });
  }

  function pointOf(event: ReactPointerEvent): { x: number; y: number } | null {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (phase !== "edit") return;
    const box = stageRef.current?.getBoundingClientRect();
    const point = pointOf(event);
    if (!box || !point) return;
    const hit = hitTest(event.clientX, event.clientY, cropRef.current, box);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit === "rotate") {
      dragRef.current = {
        kind: "rotate",
        startPointer: pointerAngle(event.clientX, event.clientY, cropRef.current, box),
        origin: { ...cropRef.current },
      };
      return;
    }
    if (hit === "move") {
      dragRef.current = { kind: "move", startX: point.x, startY: point.y, origin: { ...cropRef.current } };
      return;
    }
    dragRef.current = { kind: "resize", handle: hit, startX: point.x, startY: point.y, origin: { ...cropRef.current } };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const box = stageRef.current?.getBoundingClientRect();
    const drag = dragRef.current;
    if (!box) return;
    if (!drag) {
      event.currentTarget.style.cursor = cursorFor(hitTest(event.clientX, event.clientY, cropRef.current, box));
      return;
    }
    if (drag.kind === "rotate") {
      const current = pointerAngle(event.clientX, event.clientY, drag.origin, box);
      cropRef.current = {
        ...drag.origin,
        angle: drag.origin.angle + (angleDelta(current, drag.startPointer) * 180) / Math.PI,
      };
      event.currentTarget.style.cursor = "grabbing";
      schedulePaint();
      return;
    }
    const point = pointOf(event);
    if (!point) return;
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    cropRef.current =
      drag.kind === "move"
        ? clampCrop({ ...drag.origin, cx: drag.origin.cx + dx, cy: drag.origin.cy + dy })
        : clampCrop(resizeCrop(drag.origin, drag.handle, dx, dy));
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
      const blob = await renderCrop(image, cropRef.current);
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
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="border-b border-[#E2E8F0] bg-[#F7FAFF] p-4 lg:border-b-0 lg:border-r">
            {field ? (
              <label className="block text-sm font-semibold text-[#334155]">
                {field.label}
                <select
                  className="input-field mt-2"
                  value={selected}
                  onChange={(event) => {
                    setSelected(event.target.value);
                    setIndex(0);
                  }}
                >
                  <option value="">{`Select ${field.label}`}</option>
                  {options.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs text-[#64748B]">No class, group, or designation is configured for this organization.</p>
            )}
          </aside>
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex gap-2 overflow-x-auto border-b border-[#E2E8F0] bg-white px-3 py-2">
              {gallery.map((item, itemIndex) => (
                <GalleryThumb
                  key={item.id}
                  student={item}
                  active={itemIndex === index}
                  onClick={() => setIndex(itemIndex)}
                />
              ))}
              {gallery.length === 0 ? (
                <p className="px-1 py-3 text-xs text-[#64748B]">No photos match this {field?.label.toLowerCase() ?? "filter"}.</p>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col bg-[#EEF2FF]">
              <div className="flex min-h-[280px] flex-1 items-center justify-center overflow-auto p-4">
                {phase === "preview" && previewUrl ? (
                  <img src={previewUrl} alt="Cropped preview" className="max-h-[54vh] max-w-full object-contain" />
                ) : src && student ? (
                  <div
                    className="relative touch-none px-4 pt-12"
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
                        onLoad={paintFrame}
                      />
                      <div className="pointer-events-none absolute inset-0">
                        <div
                          ref={frameRef}
                          className="absolute"
                          style={{
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: "100%",
                            transformOrigin: "center center",
                            border: "1px solid #ffffff",
                            boxShadow: "0 0 0 1px rgba(30, 27, 75, 0.55), 0 0 0 9999px rgba(49, 46, 129, 0.28)",
                          }}
                        >
                          {HANDLES.map((handle) => (
                            <span
                              key={handle}
                              className="pointer-events-none absolute h-2 w-2 border border-[#6366F1] bg-white"
                              style={handleStyle(handle)}
                            />
                          ))}
                          <span className="pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 -translate-y-full bg-white" />
                          <span className="pointer-events-none absolute left-1/2 top-0 flex h-6 w-6 -translate-x-1/2 -translate-y-[1.7rem] items-center justify-center rounded-full border border-[#6366F1] bg-white text-[#6366F1] shadow-sm">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M20 12a8 8 0 1 1-2.2-5.5" />
                              <path d="M20 4v4h-4" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[#64748B]">{student ? "Loading photo…" : "Choose a photo."}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E8F0] bg-white px-3 py-2">
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
              {error ? <p className="bg-white px-3 pb-2 text-sm text-[#DC2626]">{error}</p> : null}
            </div>
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
      { root: node.parentElement, rootMargin: "80px" }
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
      className={`flex w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-lg border px-1 py-1 ${
        active ? "border-[#8B5CF6] bg-[#F5F3FF]" : "border-[#E2E8F0] bg-white"
      }`}
    >
      {src ? (
        <img src={src} alt="" className="h-10 w-10 rounded object-cover" />
      ) : (
        <span className="block h-10 w-10 animate-pulse rounded bg-[#EEF2FF]" />
      )}
      <span className="w-full truncate text-center text-[10px] font-semibold text-[#334155]">
        {student.photo_id || student.student_name || "Photo"}
      </span>
    </button>
  );
}

function primaryCategory(categories: ConfiguredCategoryField[]): ConfiguredCategoryField | null {
  return (
    categories.find((field) => field.kind === "class") ??
    categories.find((field) => field.kind === "group") ??
    categories.find((field) => field.kind === "designation") ??
    null
  );
}

function categoryValue(student: Student, field: ConfiguredCategoryField): string {
  const shown = studentFieldDisplay(student, field.key, field.label).trim();
  if (shown && shown !== "—") return shown;
  if (field.kind === "class" && student.class_section?.trim()) return student.class_section.trim();
  return "";
}

function hitTest(clientX: number, clientY: number, crop: Crop, box: DOMRect): Hit | null {
  const px = clientX - box.left;
  const py = clientY - box.top;
  const cx = crop.cx * box.width;
  const cy = crop.cy * box.height;
  const hw = (crop.w * box.width) / 2;
  const hh = (crop.h * box.height) / 2;
  const spots: Array<[Hit, number, number]> = [
    ["rotate", 0, -hh - 28],
    ["nw", -hw, -hh],
    ["n", 0, -hh],
    ["ne", hw, -hh],
    ["e", hw, 0],
    ["se", hw, hh],
    ["s", 0, hh],
    ["sw", -hw, hh],
    ["w", -hw, 0],
  ];
  for (const [hit, ox, oy] of spots) {
    const world = rotatePoint(ox, oy, crop.angle);
    const reach = hit === "rotate" ? 16 : 12;
    if (Math.hypot(px - (cx + world.x), py - (cy + world.y)) <= reach) return hit;
  }
  const local = unrotatePoint(px - cx, py - cy, crop.angle);
  if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hh) return "move";
  return null;
}

function pointerAngle(clientX: number, clientY: number, crop: Crop, box: DOMRect): number {
  const cx = box.left + crop.cx * box.width;
  const cy = box.top + crop.cy * box.height;
  return Math.atan2(clientX - cx, cy - clientY);
}

function angleDelta(next: number, start: number): number {
  let delta = next - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function rotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c - y * s, y: x * s + y * c };
}

function unrotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  return rotatePoint(x, y, -degrees);
}

function resizeCrop(origin: Crop, handle: Handle, dx: number, dy: number): Crop {
  const local = unrotatePoint(dx, dy, origin.angle);
  const east = handle === "e" || handle === "ne" || handle === "se";
  const west = handle === "w" || handle === "nw" || handle === "sw";
  const north = handle === "n" || handle === "ne" || handle === "nw";
  const south = handle === "s" || handle === "se" || handle === "sw";
  let dw = 0;
  let dh = 0;
  let sx = 0;
  let sy = 0;
  if (east) {
    dw += local.x;
    sx += local.x / 2;
  }
  if (west) {
    dw -= local.x;
    sx += local.x / 2;
  }
  if (south) {
    dh += local.y;
    sy += local.y / 2;
  }
  if (north) {
    dh -= local.y;
    sy += local.y / 2;
  }
  const shift = rotatePoint(sx, sy, origin.angle);
  return {
    ...origin,
    cx: origin.cx + shift.x,
    cy: origin.cy + shift.y,
    w: origin.w + dw,
    h: origin.h + dh,
  };
}

function clampCrop(crop: Crop): Crop {
  const w = Math.min(1, Math.max(MIN_SIZE, crop.w));
  const h = Math.min(1, Math.max(MIN_SIZE, crop.h));
  return {
    ...crop,
    w,
    h,
    cx: Math.min(1 - w / 2, Math.max(w / 2, crop.cx)),
    cy: Math.min(1 - h / 2, Math.max(h / 2, crop.cy)),
  };
}

function handleStyle(handle: Handle): { left: string; top: string; transform: string } {
  const pos: Record<Handle, { left: string; top: string }> = {
    nw: { left: "0%", top: "0%" },
    n: { left: "50%", top: "0%" },
    ne: { left: "100%", top: "0%" },
    e: { left: "100%", top: "50%" },
    se: { left: "100%", top: "100%" },
    s: { left: "50%", top: "100%" },
    sw: { left: "0%", top: "100%" },
    w: { left: "0%", top: "50%" },
  };
  return { ...pos[handle], transform: "translate(-50%, -50%)" };
}

function cursorFor(hit: Hit | null): string {
  if (hit === "rotate") return "grab";
  if (hit === "move") return "move";
  if (hit === "n" || hit === "s") return "ns-resize";
  if (hit === "e" || hit === "w") return "ew-resize";
  if (hit === "nw" || hit === "se") return "nwse-resize";
  if (hit === "ne" || hit === "sw") return "nesw-resize";
  return "default";
}

function renderCrop(image: HTMLImageElement, crop: Crop): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(crop.w * width));
    output.height = Math.max(1, Math.round(crop.h * height));
    const ctx = output.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas is unavailable"));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.translate(output.width / 2, output.height / 2);
    ctx.rotate((-crop.angle * Math.PI) / 180);
    ctx.translate(-crop.cx * width, -crop.cy * height);
    ctx.drawImage(image, 0, 0);
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the photo"));
    }, "image/jpeg", 0.95);
  });
}
