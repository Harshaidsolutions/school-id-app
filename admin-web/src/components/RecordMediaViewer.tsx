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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-text-navy/70 p-3 sm:p-6" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="min-w-0 truncate font-semibold text-text-navy">{item.title}</h2>
          <button ref={closeRef} type="button" className="btn-secondary shrink-0" onClick={onClose} aria-label="Close preview">Close</button>
        </div>
        <div className="flex min-h-[160px] min-w-0 items-center justify-center overflow-auto bg-content-bg p-3" aria-busy={!src && !error}>
          {error ? <p role="alert" className="p-8 text-center text-danger">Unable to load this image. You can continue to the next record.</p> : src ? <img src={src} alt={item.title} className="max-h-[62dvh] max-w-full object-contain" onError={() => setError(true)} /> : <p role="status" className="p-8 text-text-muted">Loading image…</p>}
        </div>
        {item.detail && <p className="px-4 py-2 text-center text-sm text-text-muted">{item.detail}</p>}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button type="button" className="btn-secondary" disabled={!previous} onClick={() => previous && onNavigate(items[index - 1].id)}>Previous</button>
          <span className="text-sm text-text-muted" aria-live="polite">{index + 1} of {items.length}</span>
          <button type="button" className="btn-primary" disabled={!next} onClick={() => next && onNavigate(items[index + 1].id)}>Next</button>
        </div>
      </div>
    </div>, document.body
  );
}
