import { useEffect, useState } from "react";
import { MediaLightbox } from "../../components/MediaLightbox";
import { canvasBlob, renderCard, type Bitmap, type MediaResolver } from "../render";
import type { Layout, Row } from "../types";

/** Gallery of the real cards (front + back) before printing; click any card for the large viewer. */
export function BatchPreview({ layout, rows, templates, resolverFor, nameCol, onClose }: {
  layout: Layout;
  rows: { row: Row; index: number }[];
  templates: { front: Bitmap | null; back: Bitmap | null };
  resolverFor: (i: number) => MediaResolver;
  nameCol?: string;
  onClose: () => void;
}) {
  const per = 12;
  const [page, setPage] = useState(0);
  const [cards, setCards] = useState<{ index: number; front: string; back: string | null; issues: number }[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const hasBack = Boolean(templates.back) || layout.elements.some((e) => e.side === "back");
  useEffect(() => {
    let live = true;
    const made: string[] = [];
    setCards([]);
    (async () => {
      const c = document.createElement("canvas");
      const out: { index: number; front: string; back: string | null; issues: number }[] = [];
      for (const item of rows.slice(page * per, (page + 1) * per)) {
        const media = resolverFor(item.index);
        const i1 = await renderCard(c, { layout, side: "front", row: item.row, dpi: 150, template: templates.front, media });
        const front = URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.88));
        made.push(front);
        let back: string | null = null;
        let i2: unknown[] = [];
        if (hasBack) {
          i2 = await renderCard(c, { layout, side: "back", row: item.row, dpi: 150, template: templates.back, media });
          back = URL.createObjectURL(await canvasBlob(c, "image/jpeg", 0.88));
          made.push(back);
        }
        if (!live) return;
        out.push({ index: item.index, front, back, issues: i1.length + i2.length });
        setCards([...out]);
      }
    })();
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [page, rows, layout, templates, resolverFor, hasBack]);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const current = open !== null ? cards[open] : null;
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Preview batch">
      <div className="card idg-batch" onClick={(e) => e.stopPropagation()}>
        <div className="idg-batch-head">
          <div>
            <h3>Preview batch</h3>
            <p className="idg-muted">{rows.length} cards · showing {page * per + 1}–{Math.min(rows.length, (page + 1) * per)}. Click a card to see it large.</p>
          </div>
          <div className="idg-preview-nav">
            <button type="button" className="idg-tool" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">‹</button>
            <span>{page + 1} / {pages}</span>
            <button type="button" className="idg-tool" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">›</button>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
        <div className="idg-batch-grid">
          {cards.map((c, k) => (
            <button key={c.index} type="button" className={`idg-batch-card${c.issues ? " has-issue" : ""}`} onClick={() => setOpen(k)}>
              <span className="idg-batch-sides">
                <img src={c.front} alt="Front" />
                {c.back && <img src={c.back} alt="Back" />}
              </span>
              <span className="idg-batch-name">{c.index + 1}. {nameCol ? rows.find((r) => r.index === c.index)?.row[nameCol] : ""}</span>
              {c.issues > 0 && <span className="idg-batch-flag">{c.issues} issue{c.issues > 1 ? "s" : ""}</span>}
            </button>
          ))}
          {cards.length < Math.min(per, rows.length - page * per) && <div className="idg-batch-loading">Rendering cards…</div>}
        </div>
      {current && (
        <MediaLightbox
          title={`Card ${current.index + 1}${nameCol ? " · " + (rows.find((r) => r.index === current.index)?.row[nameCol] ?? "") : ""}`}
          index={open ?? 0}
          total={cards.length}
          pages={[{ src: current.front, label: "Front" }, ...(current.back ? [{ src: current.back, label: "Back" }] : [])]}
          onPrevious={open! > 0 ? () => setOpen((o) => (o ?? 1) - 1) : null}
          onNext={open! < cards.length - 1 ? () => setOpen((o) => (o ?? 0) + 1) : null}
          onClose={() => setOpen(null)}
        />
      )}
      </div>
    </div>
  );
}

