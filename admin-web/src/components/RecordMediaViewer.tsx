import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type RecordMediaItem = {
  id: string;
  title: string;
  detail?: string;
  load: () => Promise<{ url: string; release?: () => void }>;
};

/** One gallery for record photos and signature fields across all client types. */
export function RecordMediaViewer({ items, activeId, onNavigate, onClose }: {
  items: RecordMediaItem[]; activeId: string;
  onNavigate: (id: string) => void; onClose: () => void;
}) {
  const index = items.findIndex(item => item.id === activeId);
  const item = items[index];
  const [src, setSrc] = useState("");
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previous = index > 0;
  const next = index >= 0 && index < items.length - 1;
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    setSrc(""); setError(false);
    if (item) void item.load().then(asset => {
      if (cancelled) { asset.release?.(); return; }
      release = asset.release; setSrc(asset.url);
      if (!asset.url) setError(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; release?.(); };
  }, [item]);
  useEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; focused?.focus(); };
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "ArrowLeft" && previous) { event.preventDefault(); onNavigate(items[index - 1].id); }
      if (event.key === "ArrowRight" && next) { event.preventDefault(); onNavigate(items[index + 1].id); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [items, index, previous, next, onNavigate, onClose]);
  if (!item) return null;
  return createPortal(
    <div className="media-viewer" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="media-viewer-top" onClick={event => event.stopPropagation()}>
        <h2 className="media-viewer-title">{item.title}</h2>
        <span className="media-viewer-count" aria-live="polite">{index + 1} / {items.length}</span>
        <button ref={closeRef} type="button" className="media-viewer-nav" style={{ width: 44, height: 44 }} onClick={onClose} aria-label="Close preview">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="media-viewer-stage" aria-busy={!src && !error}>
        <button type="button" className="media-viewer-nav" disabled={!previous} onClick={event => { event.stopPropagation(); if (previous) onNavigate(items[index - 1].id); }} aria-label="Previous">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="media-viewer-frame" onClick={event => event.stopPropagation()}>
          {error ? <p role="alert" className="p-8 text-center">Unable to load this image. You can continue to the next record.</p> : src ? <img key={src} src={src} alt={item.title} onError={() => setError(true)} /> : <p role="status" className="p-8">Loading image…</p>}
        </div>
        <button type="button" className="media-viewer-nav" disabled={!next} onClick={event => { event.stopPropagation(); if (next) onNavigate(items[index + 1].id); }} aria-label="Next">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      {item.detail && <p className="media-viewer-detail">{item.detail}</p>}
    </div>, document.body
  );
}
