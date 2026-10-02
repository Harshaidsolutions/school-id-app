import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { Student } from "../types";
import { authenticatedStudentPhotoUrl, authenticatedStudentSignatureUrl } from "../utils/studentPhotoSrc";

const VIEWER_BODY_CLASS = "student-photo-viewer-open";

function formatCaptureStamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(parsed)
    .replace(/\//g, "-");
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(parsed);
  return `${date} ${time}`;
}

/**
 * Full-size student photo viewer with previous/next navigation.
 */
export function StudentPhotoModal({
  student,
  students,
  onNavigate,
  onClose,
  mode = "photo",
}: {
  student: Student;
  students: Student[];
  onNavigate: (student: Student) => void;
  onClose: () => void;
  mode?: "photo" | "signature";
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const isSignature = mode === "signature";

  const gallery = useMemo(
    () => students.filter((s) => Boolean(isSignature ? s.signature_url : s.photo_url)),
    [students, isSignature]
  );

  const currentIndex = gallery.findIndex((s) => s.id === student.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < gallery.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
  }, [student.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        e.stopPropagation();
        onNavigate(gallery[currentIndex - 1]!);
        return;
      }
      if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        e.stopPropagation();
        onNavigate(gallery[currentIndex + 1]!);
      }
    }

    window.addEventListener("keydown", onKey, true);
    document.body.classList.add(VIEWER_BODY_CLASS);
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove(VIEWER_BODY_CLASS);
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [onClose, onNavigate, gallery, currentIndex, hasPrev, hasNext]);

  const assetUrl = isSignature ? student.signature_url : student.photo_url;
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    setSrc("");
    if (!assetUrl) return;
    const load = isSignature
      ? authenticatedStudentSignatureUrl(student.id)
      : authenticatedStudentPhotoUrl(student.id, { version: student.updated_at });
    void load.then((url) => {
      if (!cancelled) setSrc(url || assetUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [student.id, student.updated_at, assetUrl, isSignature]);
  if (!assetUrl) return null;

  function goPrev(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (hasPrev) onNavigate(gallery[currentIndex - 1]!);
  }

  function goNext(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (hasNext) onNavigate(gallery[currentIndex + 1]!);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-blue/55 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={`${student.student_name ?? "Student"} ${isSignature ? "signature" : "photo"}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative w-full max-w-lg outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-2 -top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-text-navy shadow-md ring-1 ring-border hover:bg-content-bg"
          aria-label="Close"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-text-navy shadow-md ring-1 ring-border hover:bg-content-bg sm:-translate-x-full"
          >
            Previous
          </button>
        )}

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-0 top-1/2 z-10 translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-text-navy shadow-md ring-1 ring-border hover:bg-content-bg sm:translate-x-full"
          >
            Next
          </button>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-xl">
          {src ? (
          <img
            src={src}
            alt={isSignature ? `${student.student_name ?? "Student"} signature` : (student.student_name ?? "Student")}
            className="block max-h-[75vh] w-full bg-content-bg object-contain"
          />
          ) : (
            <div className="flex h-64 items-center justify-center bg-content-bg text-sm text-text-muted">
              {isSignature ? "Loading signature…" : "Loading photo…"}
            </div>
          )}
          {!isSignature && student.photo_captured_at ? (
            <div className="border-t border-border px-4 py-2 text-center text-xs text-text-muted">
              Captured: {formatCaptureStamp(student.photo_captured_at)}
            </div>
          ) : null}
          <div className="border-t border-border px-4 py-3 text-center">
            <div className="text-sm font-semibold text-text-navy">
              {student.student_name ?? "—"}
            </div>
            <div className="mt-0.5 text-xs text-text-muted">
              {student.photo_id ? `${isSignature ? "Signature" : "Photo"} ${student.photo_id} · ` : ""}
              {student.roll_no ? `Roll ${student.roll_no} · ` : ""}
              {student.class_section ?? "—"}
              {gallery.length > 1 && currentIndex >= 0 && (
                <span> · {currentIndex + 1} of {gallery.length}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
