import { useEffect, useState } from "react";
import { canvasBlob, renderCard, type Bitmap, type MediaResolver, type RenderIssue } from "../render";
import type { Layout, Row } from "../types";

/**
 * Preview: ONE card at a time, large, so every detail can be checked before generating.
 * Use ‹ › to move to the next person.
 */
export function BatchPreview({ layout, rows, start = 0, templates, resolverFor, nameCol, idCol, showBack, dpi, onClose }: {
  layout: Layout;
  rows: { row: Row; index: number }[];
  start?: number;
  templates: { front: Bitmap | null; back: Bitmap | null };
  resolverFor: (i: number) => MediaResolver;
  nameCol?: string;
  idCol?: string;
  showBack: boolean;
  dpi: number;
  onClose: () => void;
}) {
  const [at, setAt] = useState(Math.min(Math.max(0, start), Math.max(0, rows.length - 1)));
  const [card, setCard] = useState<{ front: string; back: string | null; issues: RenderIssue[] } | null>(null);
  const item = rows[at];

  useEffect(() => {
    if (!item) return;
    let live = true;
    const made: string[] = [];
    setCard(null);
    (async () => {
      const c = document.createElement("canvas");
      const media = resolverFor(item.index);
      const d = Math.min(300, dpi);
      const i1 = await renderCard(c, { layout, side: "front", row: item.row, dpi: d, template: templates.front, media });
      const front = URL.createObjectURL(await canvasBlob(c, "image/png"));
      made.push(front);
      let back: string | null = null;
      let i2: RenderIssue[] = [];
      if (showBack) {
        i2 = await renderCard(c, { layout, side: "back", row: item.row, dpi: d, template: templates.back, media });
        back = URL.createObjectURL(await canvasBlob(c, "image/png"));
        made.push(back);
      }
      if (live) setCard({ front, back, issues: [...i1, ...i2] });
    })();
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [item, layout, templates, resolverFor, showBack, dpi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setAt((a) => Math.min(rows.length - 1, a + 1));
      if (e.key === "ArrowLeft") setAt((a) => Math.max(0, a - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows.length, onClose]);

  return (
    <div className="modal-overlay idg-preview-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Preview ID card">
      <div className="idg-preview-one" onClick={(e) => e.stopPropagation()}>
        <div className="idg-preview-head">
          <div>
            <h3>Preview</h3>
            <p className="idg-muted">
              {item ? `${at + 1} of ${rows.length}` : "No cards"}
              {item && idCol ? ` · ${item.row[idCol] || "—"}` : ""}
              {item && nameCol ? ` · ${item.row[nameCol] || ""}` : ""}
            </p>
          </div>
          <div className="idg-preview-nav">
            <button type="button" className="idg-tool" disabled={at <= 0} onClick={() => setAt((a) => a - 1)} aria-label="Previous card">‹</button>
            <button type="button" className="idg-tool" disabled={at >= rows.length - 1} onClick={() => setAt((a) => a + 1)} aria-label="Next card">›</button>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className={`idg-preview-cards${showBack ? " is-two" : ""}`}>
          {card ? (
            <>
              <figure><img src={card.front} alt="Front side" /><figcaption>Front</figcaption></figure>
              {card.back && <figure><img src={card.back} alt="Back side" /><figcaption>Back</figcaption></figure>}
            </>
          ) : (
            <div className="idg-batch-loading">Rendering the card…</div>
          )}
        </div>
        {card && card.issues.length > 0 && (
          <ul className="idg-issues">{card.issues.slice(0, 6).map((i, k) => <li key={k}>{i.message}</li>)}</ul>
        )}
      </div>
    </div>
  );
}
