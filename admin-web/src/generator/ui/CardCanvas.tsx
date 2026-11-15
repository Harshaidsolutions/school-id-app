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

const snap = (v: number) => Math.round(v * 10) / 10; // 0.1 mm steps

/** Corner handles change width and height; side handles only the width; top / bottom only the height. */
type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type Mode = "move" | Handle;
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HANDLE_POS: Record<Handle, { left: string; top: string; cursor: string }> = {
  nw: { left: "0%", top: "0%", cursor: "nwse-resize" },
  n: { left: "50%", top: "0%", cursor: "ns-resize" },
  ne: { left: "100%", top: "0%", cursor: "nesw-resize" },
  e: { left: "100%", top: "50%", cursor: "ew-resize" },
  se: { left: "100%", top: "100%", cursor: "nwse-resize" },
  s: { left: "50%", top: "100%", cursor: "ns-resize" },
  sw: { left: "0%", top: "100%", cursor: "nesw-resize" },
  w: { left: "0%", top: "50%", cursor: "ew-resize" },
};

type Guide = { axis: "x" | "y"; at: number };

/**
 * Alignment guides: while a field is moved, its left / centre / right (and top / middle / bottom)
 * snap to the same lines of the other fields and of the card, and a guide line is shown.
 */
function snapToGuides(el: CardElement, others: CardElement[], card: { w: number; h: number }, x: number, y: number, tol: number): { x: number; y: number; guides: Guide[] } {
  const xs = [0, card.w / 2, card.w];
  const ys = [0, card.h / 2, card.h];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const best = (pos: number, size: number, lines: number[]) => {
    let hit: { delta: number; at: number } | null = null;
    for (const edge of [0, size / 2, size]) {
      for (const l of lines) {
        const d = l - (pos + edge);
        if (Math.abs(d) <= tol && (!hit || Math.abs(d) < Math.abs(hit.delta))) hit = { delta: d, at: l };
      }
    }
    return hit;
  };
  const guides: Guide[] = [];
  const hx = best(x, el.w, xs);
  const hy = best(y, el.h, ys);
  if (hx) { x += hx.delta; guides.push({ axis: "x", at: hx.at }); }
  if (hy) { y += hy.delta; guides.push({ axis: "y", at: hy.at }); }
  return { x, y, guides };
}

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
  const [guides, setGuides] = useState<Guide[]>([]);
  const drag = useRef<{ id: string; mode: Mode; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // Fit the card into the space the playground actually has (no scrolling at 100%).
    // On phones / narrow screens the page stacks and the stage height follows the card,
    // so only the width is measured there (measuring height made the card resize itself
    // in a loop, which looked like flickering in the admin app). Tiny changes are ignored.
    const measure = () => {
      const narrow = window.innerWidth <= 1100;
      const w = Math.max(120, Math.round(el.clientWidth - 24));
      const h = narrow
        ? Math.round(Math.max(260, Math.min(window.innerHeight * 0.6, 640)))
        : Math.round(el.clientHeight > 160 ? el.clientHeight - 28 : Math.max(260, Math.min(window.innerHeight * 0.66, 760)));
      setAvail((prev) => (Math.abs(prev.w - w) < 3 && Math.abs(prev.h - h) < 3 ? prev : { w, h }));
    };
    const ro = new ResizeObserver(() => measure());
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

  const onPointerDown = (e: React.PointerEvent, el: CardElement, mode: Mode) => {
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
      const el = p.layout.elements.find((x) => x.id === d.id);
      let nx = snap(Math.min(card.w - 1, Math.max(-d.ow + 1, d.ox + dx)));
      let ny = snap(Math.min(card.h - 1, Math.max(-d.oh + 1, d.oy + dy)));
      if (el && !e.altKey) {
        const others = p.layout.elements.filter((x) => x.side === p.side && x.id !== d.id);
        const s = snapToGuides(el, others, card, nx, ny, 6 / scale); // 6 screen px
        nx = +s.x.toFixed(2); ny = +s.y.toFixed(2);
        setGuides(s.guides);
      } else setGuides([]);
      p.onChange(d.id, { x: nx, y: ny });
    } else {
      const h = d.mode;
      const MIN = 1;
      let x = d.ox, y = d.oy, w = d.ow, hh = d.oh;
      if (h.includes("e")) w = Math.max(MIN, d.ow + dx);
      if (h.includes("w")) { w = Math.max(MIN, d.ow - dx); x = d.ox + (d.ow - w); }
      if (h.includes("s")) hh = Math.max(MIN, d.oh + dy);
      if (h.includes("n")) { hh = Math.max(MIN, d.oh - dy); y = d.oy + (d.oh - hh); }
      p.onChange(d.id, { x: snap(x), y: snap(y), w: snap(w), h: snap(hh) });
    }
  };
  const onPointerUp = () => { drag.current = null; setGuides([]); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = p.layout.elements.find((x) => x.id === p.selectedId);
    if (!el || (e.target as HTMLElement).tagName === "INPUT") return;
    const step = e.shiftKey ? 1 : 0.1;
    const moves: Record<string, Partial<CardElement>> = {
      ArrowLeft: { x: +(el.x - step).toFixed(2) }, ArrowRight: { x: +(el.x + step).toFixed(2) }, ArrowUp: { y: +(el.y - step).toFixed(2) }, ArrowDown: { y: +(el.y + step).toFixed(2) },
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
        {guides.map((g, i) => (
          <span
            key={i}
            className={`idg-guide is-${g.axis}`}
            style={g.axis === "x" ? { left: g.at * scale, top: 0, height: cssH } : { top: g.at * scale, left: 0, width: cssW }}
            aria-hidden
          />
        ))}
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
              title={issues.filter((i) => i.elementId === el.id).map((i) => i.message).join("\n") || undefined}
              aria-label={label(el)}
            >
              {sel &&
                HANDLES.map((hd) => (
                  <span
                    key={hd}
                    className={`idg-handle is-${hd}`}
                    style={{ left: HANDLE_POS[hd].left, top: HANDLE_POS[hd].top, cursor: HANDLE_POS[hd].cursor }}
                    onPointerDown={(e) => onPointerDown(e, el, hd)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    aria-label={`Resize ${hd}`}
                  />
                ))}
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
