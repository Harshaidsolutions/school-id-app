import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type LightboxPage = { src: string; label?: string };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/**
 * Full-screen viewer shared by record photos, templates, brochures and models:
 * title + "n / N", zoom (buttons, wheel, pinch, drag), previous / next (buttons, arrow keys, swipe),
 * open/download, and front/back pages side by side for templates.
 */
export function MediaLightbox({
  title,
  index,
  total,
  pages,
  pdfUrl,
  openUrl,
  status,
  detail,
  onPrevious,
  onNext,
  onClose,
}: {
  title: string;
  index?: number;
  total?: number;
  pages: LightboxPage[];
  pdfUrl?: string | null;
  openUrl?: string | null;
  status?: "loading" | "error" | null;
  detail?: string;
  onPrevious?: (() => void) | null;
  onNext?: (() => void) | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const swipe = useRef<number | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const key = pages.map((p) => p.src).join("|") + (pdfUrl ?? "");

  useEffect(() => { reset(); }, [key, reset]);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; focused?.focus?.(); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "ArrowLeft" && onPrevious) { e.preventDefault(); onPrevious(); }
      if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); }
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(MAX_ZOOM, z + 0.25));
      if (e.key === "-") setZoom((z) => Math.max(MIN_ZOOM, z - 0.25));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrevious, onNext]);
  useEffect(() => {
    const el = frameRef.current;
    if (!el || pdfUrl) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +(z + (e.deltaY < 0 ? 0.2 : -0.2)).toFixed(2))));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [pdfUrl, key]);

  const canZoom = !pdfUrl && pages.length > 0 && status !== "error";
  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  return createPortal(
    <div className="media-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="media-viewer-top" onClick={(e) => e.stopPropagation()}>
        <h2 className="media-viewer-title">{title}</h2>
        {typeof index === "number" && typeof total === "number" && total > 0 && (
          <span className="media-viewer-count" aria-live="polite">{index + 1} / {total}</span>
        )}
        <div className="media-viewer-tools">
          {canZoom && (
            <>
              <button type="button" className="media-viewer-tool" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.25).toFixed(2)))} aria-label="Zoom out"><Icon d="M5 12h14" /></button>
              <span className="media-viewer-zoom">{Math.round(zoom * 100)}%</span>
              <button type="button" className="media-viewer-tool" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.25).toFixed(2)))} aria-label="Zoom in"><Icon d="M12 5v14M5 12h14" /></button>
              <button type="button" className="media-viewer-tool" onClick={reset} aria-label="Fit to screen"><Icon d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></button>
            </>
          )}
          {openUrl && (
            <a className="media-viewer-tool" href={openUrl} target="_blank" rel="noreferrer" aria-label="Open original">
              <Icon d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1h5" />
            </a>
          )}
          <button ref={closeRef} type="button" className="media-viewer-tool is-close" onClick={onClose} aria-label="Close"><Icon d="M6 6l12 12M18 6L6 18" /></button>
        </div>
      </div>

      <div className="media-viewer-stage" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="media-viewer-nav" disabled={!onPrevious} onClick={() => onPrevious?.()} aria-label="Previous">
          <Icon d="M15 18l-6-6 6-6" />
        </button>
        <div
          ref={frameRef}
          className="media-viewer-frame"
          style={{ cursor: zoom > 1 ? (drag.current ? "grabbing" : "grab") : "default" }}
          onPointerDown={(e) => {
            if (zoom <= 1 || pdfUrl) return;
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drag.current) return;
            setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y });
          }}
          onPointerUp={() => { drag.current = null; }}
          onTouchStart={(e) => {
            if (e.touches.length === 2 && canZoom) pinch.current = { d: dist(e.touches), z: zoom };
            else if (e.touches.length === 1 && zoom <= 1) swipe.current = e.touches[0].clientX;
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2 && pinch.current) {
              const d = dist(e.touches);
              if (d > 0) setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +((pinch.current.z * d) / pinch.current.d).toFixed(2))));
            }
          }}
          onTouchEnd={(e) => {
            pinch.current = null;
            if (swipe.current !== null && e.changedTouches.length) {
              const dx = e.changedTouches[0].clientX - swipe.current;
              if (dx > 60) onPrevious?.();
              if (dx < -60) onNext?.();
            }
            swipe.current = null;
          }}
        >
          {status === "loading" ? (
            <p role="status">Loading…</p>
          ) : status === "error" ? (
            <p role="alert">This file could not be shown.{openUrl ? " Use the open button above." : ""}</p>
          ) : pdfUrl ? (
            <iframe src={pdfUrl} title={title} />
          ) : pages.length === 1 ? (
            <img key={pages[0].src} src={pages[0].src} alt={title} draggable={false} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
          ) : (
            <div className="media-viewer-pages" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
              {pages.map((p) => (
                <figure key={p.src}>
                  <img src={p.src} alt={`${title} ${p.label ?? ""}`} draggable={false} />
                  {p.label && <figcaption>{p.label}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </div>
        <button type="button" className="media-viewer-nav" disabled={!onNext} onClick={() => onNext?.()} aria-label="Next">
          <Icon d="M9 18l6-6-6-6" />
        </button>
      </div>
      {detail && <p className="media-viewer-detail" onClick={(e) => e.stopPropagation()}>{detail}</p>}
    </div>,
    document.body,
  );
}
