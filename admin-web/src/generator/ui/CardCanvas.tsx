import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { renderCard, type Bitmap, type MediaResolver, type RenderIssue } from "../render";
import type { CardElement, Layout, Row, Side } from "../types";

type Props = {
  layout: Layout;
  side: Side;
  row: Row;
  template: Bitmap | null;
  media: MediaResolver;
  selectedId: string | null;
  zoom: number;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<CardElement>) => void;
  onDelete: (id: string) => void;
  onDropColumn: (column: string, xMm: number, yMm: number) => void;
};

const snap = (v: number) => Math.round(v * 2) / 2; // 0.5 mm grid

function label(el: CardElement): string {
  if (el.kind === "text") return el.column || "Text";
  if (el.kind === "image") return { photo: "Photo", parentSign: "Signature", principalSign: "Principal sign", thumb: "Thumb", logo: "Logo", static: "Image" }[el.media];
  if (el.kind === "qr") return "QR";
  return "Barcode";
}

export function CardCanvas(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [avail, setAvail] = useState({ w: 360, h: 520 });
  const [issues, setIssues] = useState<RenderIssue[]>([]);
  const drag = useRef<{ id: string; mode: "move" | "resize"; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth - 32, h: Math.max(260, Math.min(window.innerHeight * 0.66, 760)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { card } = p.layout;
  const scale = Math.max(1, Math.min(avail.w / card.w, avail.h / card.h) * p.zoom); // css px per mm
  const cssW = card.w * scale, cssH = card.h * scale;

  // Re-render the WYSIWYG preview (debounced; stale renders are dropped)
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const off = document.createElement("canvas");
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const dpi = Math.min(300, scale * 25.4 * dpr);
      const found = await renderCard(off, { layout: p.layout, side: p.side, row: p.row, dpi, template: p.template, media: p.media });
      if (n !== seq.current || !canvasRef.current) return;
      const c = canvasRef.current;
      c.width = off.width;
      c.height = off.height;
      c.getContext("2d")!.drawImage(off, 0, 0);
      setIssues(found);
    }, 90);
    return () => clearTimeout(t);
  }, [p.layout, p.side, p.row, p.template, p.media, scale]);

  const onPointerDown = (e: React.PointerEvent, el: CardElement, mode: "move" | "resize") => {
    e.stopPropagation();
    e.preventDefault();
    p.onSelect(el.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: el.id, mode, sx: e.clientX, sy: e.clientY, ox: el.x, oy: el.y, ow: el.w, oh: el.h };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.sx) / scale, dy = (e.clientY - d.sy) / scale;
    if (d.mode === "move") {
      p.onChange(d.id, { x: snap(Math.min(card.w - 1, Math.max(-d.ow + 1, d.ox + dx))), y: snap(Math.min(card.h - 1, Math.max(-d.oh + 1, d.oy + dy))) });
    } else {
      p.onChange(d.id, { w: snap(Math.max(2, d.ow + dx)), h: snap(Math.max(2, d.oh + dy)) });
    }
  };
  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = p.layout.elements.find((x) => x.id === p.selectedId);
    if (!el || (e.target as HTMLElement).tagName === "INPUT") return;
    const step = e.shiftKey ? 2 : 0.5;
    const moves: Record<string, Partial<CardElement>> = {
      ArrowLeft: { x: el.x - step }, ArrowRight: { x: el.x + step }, ArrowUp: { y: el.y - step }, ArrowDown: { y: el.y + step },
    };
    if (moves[e.key]) { e.preventDefault(); p.onChange(el.id, moves[e.key]); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); p.onDelete(el.id); }
    if (e.key === "Escape") p.onSelect(null);
  };

  const issueIds = new Set(issues.map((i) => i.elementId));
  return (
    <div
      ref={wrapRef}
      className="idg-stage"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={() => p.onSelect(null)}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-idg-column")) e.preventDefault(); }}
      onDrop={(e) => {
        const col = e.dataTransfer.getData("text/x-idg-column");
        const box = canvasRef.current?.getBoundingClientRect();
        if (!col || !box) return;
        e.preventDefault();
        p.onDropColumn(col, snap((e.clientX - box.left) / scale), snap((e.clientY - box.top) / scale));
      }}
    >
      <div className="idg-card" style={{ width: cssW, height: cssH }}>
        <canvas ref={canvasRef} style={{ width: cssW, height: cssH }} aria-label="Card preview" />
        {p.layout.elements.filter((el) => el.side === p.side).map((el) => {
          const sel = el.id === p.selectedId;
          return (
            <div
              key={el.id}
              className={`idg-box${sel ? " is-selected" : ""}${issueIds.has(el.id) ? " has-issue" : ""}`}
              style={{ left: el.x * scale, top: el.y * scale, width: el.w * scale, height: el.h * scale, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              onPointerDown={(e) => onPointerDown(e, el, "move")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              title={issues.filter((i) => i.elementId === el.id).map((i) => i.message).join("\n") || label(el)}
            >
              {sel && <span className="idg-box-tag">{label(el)}</span>}
              {sel && (
                <span
                  className="idg-handle"
                  onPointerDown={(e) => onPointerDown(e, el, "resize")}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  aria-label="Resize"
                />
              )}
            </div>
          );
        })}
      </div>
      {issues.length > 0 && (
        <ul className="idg-issues" aria-live="polite">
          {issues.slice(0, 4).map((i, k) => <li key={k}>{i.message}</li>)}
        </ul>
      )}
    </div>
  );
}
