import { useEffect, useState } from "react";
import { MediaLightbox } from "./MediaLightbox";

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
  if (!item) return null;
  return (
    <MediaLightbox
      title={item.title}
      index={index}
      total={items.length}
      pages={src ? [{ src }] : []}
      status={error ? "error" : src ? null : "loading"}
      detail={item.detail}
      onPrevious={index > 0 ? () => onNavigate(items[index - 1].id) : null}
      onNext={index >= 0 && index < items.length - 1 ? () => onNavigate(items[index + 1].id) : null}
      onClose={onClose}
    />
  );
}
