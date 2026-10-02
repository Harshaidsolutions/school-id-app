import { useEffect, useMemo, useState } from "react";
import api from "../api/client";
import type { Student } from "../types";
import { authenticatedStudentPhotoUrl, invalidateStudentPhotoCache } from "../utils/studentPhotoSrc";

type CropEdges = { top: number; right: number; bottom: number; left: number };

const EMPTY_CROP: CropEdges = { top: 0, right: 0, bottom: 0, left: 0 };

export function CropToolModal({
  students,
  onClose,
  onSaved,
}: {
  students: Student[];
  onClose: () => void;
  onSaved: (student: Student) => void;
}) {
  const gallery = useMemo(
    () => students.filter((student) => Boolean(student.photo_url)),
    [students]
  );
  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState("");
  const [rotation, setRotation] = useState(0);
  const [crop, setCrop] = useState<CropEdges>(EMPTY_CROP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const student = gallery[index] ?? null;

  useEffect(() => {
    if (index > gallery.length - 1) setIndex(0);
  }, [gallery.length, index]);

  useEffect(() => {
    let cancelled = false;
    setSrc("");
    setRotation(0);
    setCrop(EMPTY_CROP);
    setError(null);
    if (!student?.photo_url) return;
    void authenticatedStudentPhotoUrl(student.id).then((url) => {
      if (!cancelled) setSrc(url || student.photo_url || "");
    });
    return () => {
      cancelled = true;
    };
  }, [student?.id, student?.photo_url, student?.photo_captured_at]);

  function setEdge(edge: keyof CropEdges, value: number) {
    setCrop((current) => {
      const next = { ...current, [edge]: value };
      if (edge === "top" || edge === "bottom") {
        if (next.top + next.bottom > 80) next[edge] = Math.max(0, 80 - (edge === "top" ? next.bottom : next.top));
      }
      if (edge === "left" || edge === "right") {
        if (next.left + next.right > 80) next[edge] = Math.max(0, 80 - (edge === "left" ? next.right : next.left));
      }
      return next;
    });
  }

  async function saveCrop() {
    if (!student || !src || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await renderCrop(src, rotation, crop);
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

  if (!student) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2563EB]/30 px-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center shadow-[0_18px_48px_rgba(99,102,241,0.16)]">
          <h2 className="text-lg font-semibold text-[#1E293B]">Cropping Tool</h2>
          <p className="mt-2 text-sm text-[#64748B]">No captured photos for this school or institute yet.</p>
          <button type="button" className="btn-primary mt-4" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2563EB]/30 px-3 py-4" role="dialog" aria-modal="true" aria-label="Cropping Tool">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_18px_48px_rgba(99,102,241,0.16)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-[#1E293B]">Cropping Tool</h2>
            <p className="text-xs text-[#64748B]">
              {student.student_name ?? "Student"}
              {student.photo_id ? ` · Photo ${student.photo_id}` : ""}
              {` · ${index + 1} of ${gallery.length}`}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[9rem_minmax(0,1fr)_16rem]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-y-auto">
            {gallery.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                className={`shrink-0 rounded-xl border px-2 py-2 text-left text-xs font-semibold ${
                  itemIndex === index
                    ? "border-[#8B5CF6] bg-[#F5F3FF] text-[#1E293B]"
                    : "border-[#E2E8F0] bg-white text-[#64748B]"
                }`}
              >
                <span className="block truncate">{item.photo_id || item.student_name || "Photo"}</span>
              </button>
            ))}
          </div>
          <div className="flex min-h-[240px] items-center justify-center overflow-hidden rounded-2xl bg-[#F7FAFF]">
            {src ? (
              <div className="relative max-h-[58vh] max-w-full" style={{ transform: `rotate(${rotation}deg)` }}>
                <img
                  src={src}
                  alt={student.student_name ?? "Photo"}
                  className="max-h-[58vh] max-w-full object-contain"
                />
                <div
                  className="pointer-events-none absolute border-2 border-white"
                  style={{
                    top: `${crop.top}%`,
                    right: `${crop.right}%`,
                    bottom: `${crop.bottom}%`,
                    left: `${crop.left}%`,
                    boxShadow: "0 0 0 999px rgba(37, 99, 235, 0.28)",
                  }}
                />
              </div>
            ) : (
              <p className="text-sm text-[#64748B]">Loading photo…</p>
            )}
          </div>
          <div className="space-y-3 overflow-y-auto">
            <EdgeSlider label="Top" value={crop.top} onChange={(value) => setEdge("top", value)} />
            <EdgeSlider label="Bottom" value={crop.bottom} onChange={(value) => setEdge("bottom", value)} />
            <EdgeSlider label="Left" value={crop.left} onChange={(value) => setEdge("left", value)} />
            <EdgeSlider label="Right" value={crop.right} onChange={(value) => setEdge("right", value)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRotation((value) => (value + 270) % 360)}>Rotate left</button>
              <button type="button" className="btn-secondary" onClick={() => setRotation((value) => (value + 90) % 360)}>Rotate right</button>
              <button type="button" className="btn-secondary col-span-2" onClick={() => { setRotation(0); setCrop(EMPTY_CROP); }}>Reset / straighten</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <button type="button" className="btn-secondary" disabled={index >= gallery.length - 1} onClick={() => setIndex((value) => Math.min(gallery.length - 1, value + 1))}>Next</button>
            </div>
            {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
            <button type="button" className="btn-primary w-full" disabled={saving || !src} onClick={() => void saveCrop()}>
              {saving ? "Saving…" : "Save crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EdgeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block text-xs font-semibold text-[#1E293B]">
      {label}
      <input
        type="range"
        min={0}
        max={40}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-[#2563EB]"
      />
    </label>
  );
}

function renderCrop(src: string, rotation: number, crop: CropEdges): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      const turned = rotation % 180 !== 0;
      const rotated = document.createElement("canvas");
      rotated.width = turned ? height : width;
      rotated.height = turned ? width : height;
      const ctx = rotated.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas is unavailable"));
        return;
      }
      ctx.translate(rotated.width / 2, rotated.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(image, -width / 2, -height / 2);
      const sx = (rotated.width * crop.left) / 100;
      const sy = (rotated.height * crop.top) / 100;
      const sw = rotated.width * (1 - (crop.left + crop.right) / 100);
      const sh = rotated.height * (1 - (crop.top + crop.bottom) / 100);
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
      }, "image/jpeg", 0.92);
    };
    image.onerror = () => reject(new Error("Could not load the photo"));
    image.src = src;
  });
}
