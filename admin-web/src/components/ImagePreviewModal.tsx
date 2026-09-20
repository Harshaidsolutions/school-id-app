import { useCallback, useEffect, useRef, useState } from "react";

function isPdfUrl(url: string): boolean {
  return url.toLowerCase().includes(".pdf");
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.2;

export function ImagePreviewModal({
  open,
  title,
  imageUrl,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: {
  open: boolean;
  title: string;
  imageUrl: string | null | undefined;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number }>({
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
  });
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    pinchRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    resetView();
  }, [open, imageUrl, resetView]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && hasPrevious && onPrevious) onPrevious();
      if (event.key === "ArrowRight" && hasNext && onNext) onNext();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onPrevious, onNext, hasPrevious, hasNext]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!open || !viewport || !imageUrl || isPdfUrl(imageUrl)) return;

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      setZoom((current) =>
        Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((current + delta).toFixed(2))))
      );
    }

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [open, imageUrl]);

  function zoomIn() {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
  }

  function zoomOut() {
    setZoom((z) => Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))));
  }

  function onPointerDown(event: React.PointerEvent) {
    if (!imageUrl || isPdfUrl(imageUrl) || zoom <= 1) return;
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!isDragging) return;
    setPan({
      x: dragRef.current.panX + (event.clientX - dragRef.current.startX),
      y: dragRef.current.panY + (event.clientY - dragRef.current.startY),
    });
  }

  function onPointerUp(event: React.PointerEvent) {
    setIsDragging(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }

  function touchDistance(touches: React.TouchList): number {
    if (touches.length < 2) return 0;
    const [a, b] = [touches[0], touches[1]];
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  }

  function onTouchStart(event: React.TouchEvent) {
    if (!imageUrl || isPdfUrl(imageUrl) || event.touches.length < 2) return;
    pinchRef.current = {
      distance: touchDistance(event.touches),
      zoom,
    };
  }

  function onTouchMove(event: React.TouchEvent) {
    if (!imageUrl || isPdfUrl(imageUrl) || event.touches.length < 2 || !pinchRef.current) {
      return;
    }
    event.preventDefault();
    const distance = touchDistance(event.touches);
    if (distance <= 0 || pinchRef.current.distance <= 0) return;
    const ratio = distance / pinchRef.current.distance;
    const nextZoom = pinchRef.current.zoom * ratio;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2)))));
  }

  function onTouchEnd() {
    pinchRef.current = null;
  }

  if (!open || !imageUrl) return null;

  const pdf = isPdfUrl(imageUrl);
  const showNav = Boolean(onPrevious || onNext);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-text-navy/75 p-4 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <h2 className="truncate text-base font-semibold text-text-navy sm:text-lg">{title}</h2>
          <div className="flex items-center gap-2">
            {!pdf && (
              <>
                <button
                  type="button"
                  onClick={zoomOut}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-navy hover:bg-content-bg"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span className="min-w-[3rem] text-center text-xs text-text-muted">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={zoomIn}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-navy hover:bg-content-bg"
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={resetView}
                  className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-navy hover:bg-content-bg"
                >
                  Reset
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-text-muted hover:bg-content-bg hover:text-text-navy"
              aria-label="Close preview"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div
          ref={viewportRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-content-bg p-4 sm:p-6"
        >
          {showNav && onPrevious && (
            <button
              type="button"
              onClick={onPrevious}
              disabled={!hasPrevious}
              className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-white p-2.5 text-text-navy shadow-md hover:bg-content-bg disabled:cursor-not-allowed disabled:opacity-30 sm:left-4"
              aria-label="Previous"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          )}

          {pdf ? (
            <iframe
              src={imageUrl}
              title={title}
              className="h-[75vh] w-full rounded-lg border border-border bg-white"
            />
          ) : (
            <div
              className="flex max-h-[78vh] max-w-full touch-none items-center justify-center"
              style={{ cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
              <img
                src={imageUrl}
                alt={title}
                draggable={false}
                className="max-h-[78vh] max-w-full select-none rounded-lg object-contain shadow-md"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                }}
              />
            </div>
          )}

          {showNav && onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-white p-2.5 text-text-navy shadow-md hover:bg-content-bg disabled:cursor-not-allowed disabled:opacity-30 sm:right-4"
              aria-label="Next"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CatalogPreviewThumb({
  imageUrl,
  alt,
  className = "h-64 w-full object-contain bg-content-bg p-2",
  onClick,
}: {
  imageUrl: string | null | undefined;
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const pdf = imageUrl ? isPdfUrl(imageUrl) : false;

  if (!imageUrl) {
    return (
      <div className="flex h-64 items-center justify-center bg-content-bg text-sm text-text-muted">
        No image
      </div>
    );
  }

  if (pdf) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-64 w-full flex-col items-center justify-center gap-2 bg-content-bg text-sm font-medium text-text-muted transition hover:bg-orange-soft/40"
      >
        <span className="rounded-lg border border-border bg-white px-4 py-2">PDF Preview</span>
        <span className="text-xs text-button-blue">Click to open</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-64 w-full items-center justify-center overflow-hidden bg-content-bg text-left transition hover:opacity-95"
      title="Click to enlarge"
    >
      <img src={imageUrl} alt={alt} className={className} />
    </button>
  );
}
