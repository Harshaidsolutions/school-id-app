import { MediaLightbox, type LightboxPage } from "./MediaLightbox";

export function isPdfUrl(url: string): boolean {
  return url.toLowerCase().split("?")[0].endsWith(".pdf") || url.toLowerCase().includes(".pdf");
}

/**
 * Large viewer for templates, brochures, models and organisation files.
 * Images: zoom / drag / pinch. PDFs: shown inline where the browser can, plus an "open" button,
 * or as rendered page images when `pages` is given (template front & back).
 */
export function ImagePreviewModal({
  open,
  title,
  imageUrl,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  index,
  total,
  pages,
  loading = false,
}: {
  open: boolean;
  title: string;
  imageUrl: string | null | undefined;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  index?: number;
  total?: number;
  pages?: LightboxPage[];
  loading?: boolean;
}) {
  if (!open || (!imageUrl && !pages?.length)) return null;
  const pdf = imageUrl ? isPdfUrl(imageUrl) : false;
  const usePages = Boolean(pages?.length);
  return (
    <MediaLightbox
      title={title}
      index={index}
      total={total}
      pages={usePages ? pages! : pdf || !imageUrl ? [] : [{ src: imageUrl }]}
      pdfUrl={!usePages && pdf ? imageUrl : null}
      openUrl={imageUrl ?? null}
      status={loading ? "loading" : null}
      onPrevious={hasPrevious && onPrevious ? onPrevious : null}
      onNext={hasNext && onNext ? onNext : null}
      onClose={onClose}
    />
  );
}

export function CatalogPreviewThumb({
  imageUrl,
  alt,
  className = "",
  onClick,
  thumbUrl,
}: {
  imageUrl: string | null | undefined;
  alt: string;
  className?: string;
  onClick?: () => void;
  /** Rendered preview for PDFs (e.g. template page 1) */
  thumbUrl?: string | null;
}) {
  if (!imageUrl) {
    return (
      <button type="button" disabled className="media-thumb is-empty">
        <span className="media-pdf-thumb"><span>—</span>No image</span>
      </button>
    );
  }
  const pdf = isPdfUrl(imageUrl);
  return (
    <button type="button" onClick={onClick} className="media-thumb" title="Click to view">
      {pdf && !thumbUrl ? (
        <span className="media-pdf-thumb"><span>PDF</span>Click to view</span>
      ) : (
        <img src={thumbUrl ?? imageUrl} alt={alt} className={className} loading="lazy" />
      )}
    </button>
  );
}
