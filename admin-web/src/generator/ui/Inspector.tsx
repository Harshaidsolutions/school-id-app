import { useState } from "react";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";
import { GOOGLE_FONTS, SYSTEM_FONTS, addCustomFont, loadGoogleFont } from "../fonts";
import type { BarcodeElement, CardElement, ImageElement, PhotoShape, QrElement, TextElement } from "../types";

type Patch = (patch: Partial<CardElement>) => void;

export function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`idg-field${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Num({ value, onChange, step = 0.5, min, max, suffix }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string }) {
  return (
    <span className="idg-num">
      <input
        type="number"
        className="input-field"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(min !== undefined || max !== undefined ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)) : v);
        }}
      />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

export function Colour({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return <input type="color" className="idg-colour" aria-label={label} value={safe} onChange={(e) => onChange(e.target.value)} />;
}

export const SHAPES: { key: PhotoShape; label: string; d: string }[] = [
  { key: "rect", label: "Rectangle", d: "M4 5h16v14H4z" },
  { key: "rounded", label: "Rounded", d: "M8 5h8a4 4 0 014 4v6a4 4 0 01-4 4H8a4 4 0 01-4-4V9a4 4 0 014-4z" },
  { key: "square", label: "Square", d: "M5 5h14v14H5z" },
  { key: "circle", label: "Circle", d: "M12 4a8 8 0 110 16 8 8 0 010-16z" },
  { key: "oval", label: "Oval", d: "M12 3c4 0 6 4 6 9s-2 9-6 9-6-4-6-9 2-9 6-9z" },
  { key: "arch", label: "Arch", d: "M5 20V11a7 7 0 0114 0v9z" },
  { key: "hexagon", label: "Hexagon", d: "M7 4h10l5 8-5 8H7l-5-8z" },
  { key: "octagon", label: "Octagon", d: "M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z" },
  { key: "pentagon", label: "Pentagon", d: "M12 3l9 7-3.5 10h-11L3 10z" },
  { key: "diamond", label: "Diamond", d: "M12 3l9 9-9 9-9-9z" },
  { key: "shield", label: "Shield", d: "M4 5c5-2 11-2 16 0v7c0 5-4 8-8 9-4-1-8-4-8-9z" },
  { key: "star", label: "Star", d: "M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" },
];

/** Formatting toolbar above the card (text elements), like a word processor. */
export function TextToolbar({ el, patch }: { el: TextElement | null; patch: Patch }) {
  const [fontQuery, setFontQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const disabled = !el;
  const t = el ?? ({} as TextElement);
  const pickFont = async (family: string) => {
    if (!family) return;
    setBusy(true);
    await loadGoogleFont(family);
    setBusy(false);
    patch({ font: family } as Partial<TextElement>);
  };
  return (
    <div className={`idg-toolbar${disabled ? " is-disabled" : ""}`} aria-label="Text formatting">
      <select className="input-field idg-font" disabled={disabled} value={t.font ?? ""} onChange={(e) => void pickFont(e.target.value)} aria-label="Font">
        {t.font && !SYSTEM_FONTS.includes(t.font) && !GOOGLE_FONTS.includes(t.font) && <option value={t.font}>{t.font}</option>}
        <optgroup label="Google Fonts">{GOOGLE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>
        <optgroup label="System">{SYSTEM_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}</optgroup>
      </select>
      <input
        className="input-field idg-font-search"
        placeholder="Any Google font…"
        value={fontQuery}
        disabled={disabled}
        onChange={(e) => setFontQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { void pickFont(fontQuery.trim()); setFontQuery(""); } }}
        aria-label="Type any Google font name and press Enter"
      />
      <label className={`idg-tool${disabled ? " is-disabled" : ""}`} title="Upload your own font (.ttf / .otf)">
        <input type="file" accept=".ttf,.otf,.woff,.woff2" hidden disabled={disabled} onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try { const family = await addCustomFont(f); patch({ font: family } as Partial<TextElement>); }
          catch (err) { alert(err instanceof Error ? err.message : "Font could not be loaded"); }
        }} />
        <svg viewBox="0 0 24 24" aria-hidden><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
        <span className="sr-only">Upload font</span>
      </label>
      {busy && <span className="idg-muted">Loading font…</span>}
      <span className="idg-sep" />
      <Num value={t.size ?? 9} step={0.5} min={4} max={72} suffix="pt" onChange={(v) => patch({ size: v } as Partial<TextElement>)} />
      <button type="button" className={`idg-tool${t.weight >= 700 ? " is-on" : ""}`} disabled={disabled} onClick={() => patch({ weight: t.weight >= 700 ? 400 : 700 } as Partial<TextElement>)} aria-label="Bold"><b>B</b></button>
      <button type="button" className={`idg-tool${t.italic ? " is-on" : ""}`} disabled={disabled} onClick={() => patch({ italic: !t.italic } as Partial<TextElement>)} aria-label="Italic"><i>I</i></button>
      <button type="button" className={`idg-tool${t.underline ? " is-on" : ""}`} disabled={disabled} onClick={() => patch({ underline: !t.underline } as Partial<TextElement>)} aria-label="Underline"><u>U</u></button>
      <Colour label="Text colour" value={t.color ?? "#17462e"} onChange={(v) => patch({ color: v } as Partial<TextElement>)} />
      <span className="idg-sep" />
      {(["left", "center", "right"] as const).map((a) => (
        <button key={a} type="button" className={`idg-tool${t.align === a ? " is-on" : ""}`} disabled={disabled} onClick={() => patch({ align: a } as Partial<TextElement>)} aria-label={`Align ${a}`}>
          <svg viewBox="0 0 24 24" aria-hidden>{a === "left" ? <path d="M4 6h16M4 10h10M4 14h16M4 18h10" /> : a === "center" ? <path d="M4 6h16M7 10h10M4 14h16M7 18h10" /> : <path d="M4 6h16M10 10h10M4 14h16M10 18h10" />}</svg>
        </button>
      ))}
      <select className="input-field idg-case" disabled={disabled} value={t.textCase ?? "none"} onChange={(e) => patch({ textCase: e.target.value as TextElement["textCase"] } as Partial<TextElement>)} aria-label="Text case">
        <option value="none">As in Excel</option>
        <option value="upper">ALL CAPS</option>
        <option value="title">Title Case</option>
        <option value="sentence">Sentence case</option>
        <option value="lower">lower case</option>
      </select>
    </div>
  );
}

/** Rotation control shared by every element: 360° dial buttons + manual angle + horizontal/vertical. */
function Rotation({ el, patch }: { el: CardElement; patch: Patch }) {
  return (
    <div className="idg-rotate">
      <button type="button" className="idg-tool" onClick={() => patch({ rotation: (el.rotation - 90 + 360) % 360 })} aria-label="Rotate left 90°">⟲</button>
      <Num value={el.rotation} step={1} min={0} max={359} suffix="°" onChange={(v) => patch({ rotation: ((v % 360) + 360) % 360 })} />
      <button type="button" className="idg-tool" onClick={() => patch({ rotation: (el.rotation + 90) % 360 })} aria-label="Rotate right 90°">⟳</button>
      <div className="idg-seg">
        <button type="button" className={el.rotation % 180 === 0 ? "is-on" : ""} onClick={() => patch({ rotation: 0 })}>Horizontal</button>
        <button type="button" className={el.rotation === 90 || el.rotation === 270 ? "is-on" : ""} onClick={() => patch({ rotation: 270, w: el.h, h: el.w, x: el.x + (el.w - el.h) / 2, y: el.y + (el.h - el.w) / 2 })}>Vertical</button>
      </div>
    </div>
  );
}

function Geometry({ el, patch }: { el: CardElement; patch: Patch }) {
  return (
    <div className="idg-grid4">
      <Field label="X"><Num value={el.x} suffix="mm" onChange={(v) => patch({ x: v })} /></Field>
      <Field label="Y"><Num value={el.y} suffix="mm" onChange={(v) => patch({ y: v })} /></Field>
      <Field label="Width"><Num value={el.w} min={1} suffix="mm" onChange={(v) => patch({ w: v })} /></Field>
      <Field label="Height"><Num value={el.h} min={1} suffix="mm" onChange={(v) => patch({ h: v })} /></Field>
    </div>
  );
}

function ColumnSelect({ value, columns, onChange, allowNone }: { value: string; columns: string[]; onChange: (v: string) => void; allowNone?: string }) {
  return (
    <select className="input-field" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone !== undefined && <option value="">{allowNone}</option>}
      {!columns.includes(value) && value && <option value={value}>{value} (not in this file)</option>}
      {columns.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

function TextProps({ el, patch, columns }: { el: TextElement; patch: Patch; columns: string[] }) {
  const p = patch as (x: Partial<TextElement>) => void;
  return (
    <>
      <Field label="Excel column" wide><ColumnSelect value={el.column} columns={columns} allowNone="— Static text —" onChange={(v) => p({ column: v, required: Boolean(v) })} /></Field>
      {el.column ? (
        <div className="idg-grid2">
          <Field label="Before value"><input className="input-field" value={el.prefix} placeholder="e.g. Class : " onChange={(e) => p({ prefix: e.target.value })} /></Field>
          <Field label="After value"><input className="input-field" value={el.suffix} onChange={(e) => p({ suffix: e.target.value })} /></Field>
        </div>
      ) : (
        <Field label="Text" wide><textarea className="input-field" rows={2} value={el.staticText} onChange={(e) => p({ staticText: e.target.value })} /></Field>
      )}
      <div className="idg-grid2">
        <Field label="Weight">
          <select className="input-field" value={el.weight} onChange={(e) => p({ weight: Number(e.target.value) as TextElement["weight"] })}>
            <option value={400}>Regular</option><option value={500}>Medium</option><option value={600}>Semi-bold</option><option value={700}>Bold</option><option value={800}>Extra bold</option>
          </select>
        </Field>
        <Field label="Vertical align">
          <select className="input-field" value={el.vAlign} onChange={(e) => p({ vAlign: e.target.value as TextElement["vAlign"] })}>
            <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
          </select>
        </Field>
        <Field label="Letter spacing"><Num value={el.letterSpacing} step={10} min={-100} max={600} suffix="‰" onChange={(v) => p({ letterSpacing: v })} /></Field>
        <Field label="Line height"><Num value={el.lineHeight} step={0.05} min={0.7} max={3} suffix="×" onChange={(v) => p({ lineHeight: v })} /></Field>
      </div>
      <div className="idg-switches">
        <span><ToggleSwitch checked={el.autoShrink} onChange={() => p({ autoShrink: !el.autoShrink })} label="Auto-shrink long text" /> Auto-shrink long text</span>
        {el.autoShrink && <Field label="Smallest size"><Num value={el.minSize} step={0.5} min={3} max={el.size} suffix="pt" onChange={(v) => p({ minSize: v })} /></Field>}
        <span><ToggleSwitch checked={el.multiline} onChange={() => p({ multiline: !el.multiline })} label="Wrap to more lines" /> Wrap to more lines</span>
        <span><ToggleSwitch checked={el.required} onChange={() => p({ required: !el.required })} label="Required" /> Required (pre-flight)</span>
      </div>
      <div className="idg-grid2">
        <Field label="Outline (stroke)"><Num value={el.stroke.width} step={0.1} min={0} max={4} suffix="pt" onChange={(v) => p({ stroke: { ...el.stroke, width: v } })} /></Field>
        <Field label="Outline colour"><Colour label="Outline colour" value={el.stroke.color} onChange={(v) => p({ stroke: { ...el.stroke, color: v } })} /></Field>
      </div>
      <div className="idg-switches">
        <span><ToggleSwitch checked={el.gradient.on} onChange={() => p({ gradient: { ...el.gradient, on: !el.gradient.on } })} label="Two-colour gradient" /> Two-colour gradient</span>
        {el.gradient.on && (
          <div className="idg-grid2">
            <Field label="Second colour"><Colour label="Gradient colour" value={el.gradient.color2} onChange={(v) => p({ gradient: { ...el.gradient, color2: v } })} /></Field>
            <Field label="Angle"><Num value={el.gradient.angle} step={15} min={0} max={360} suffix="°" onChange={(v) => p({ gradient: { ...el.gradient, angle: v } })} /></Field>
          </div>
        )}
      </div>
    </>
  );
}

function ImageProps({ el, patch }: { el: ImageElement; patch: Patch }) {
  const p = patch as (x: Partial<ImageElement>) => void;
  return (
    <>
      <Field label="Shows" wide>
        <select className="input-field" value={el.media} onChange={(e) => p({ media: e.target.value as ImageElement["media"], cleanSignature: e.target.value !== "photo" && e.target.value !== "logo" })}>
          <option value="photo">Student photo</option><option value="parentSign">Parent signature</option><option value="principalSign">Principal signature (same on all)</option><option value="thumb">Thumb impression</option><option value="logo">School logo (same on all)</option>
        </select>
      </Field>
      <div className="idg-shapes" role="radiogroup" aria-label="Photo shape">
        {SHAPES.map((s) => (
          <button key={s.key} type="button" role="radio" aria-checked={el.shape === s.key} className={el.shape === s.key ? "is-on" : ""} onClick={() => p({ shape: s.key })} title={s.label}>
            <svg viewBox="0 0 24 24" aria-hidden><path d={s.d} /></svg>
          </button>
        ))}
      </div>
      <div className="idg-grid2">
        {el.shape === "rounded" && <Field label="Corner radius"><Num value={el.radius} step={0.5} min={0} max={20} suffix="mm" onChange={(v) => p({ radius: v })} /></Field>}
        <Field label="Fit">
          <select className="input-field" value={el.fit} onChange={(e) => p({ fit: e.target.value as ImageElement["fit"] })}>
            <option value="cover">Fill the shape</option><option value="contain">Show whole image</option>
          </select>
        </Field>
        <Field label="Border"><Num value={el.border.width} step={0.1} min={0} max={5} suffix="mm" onChange={(v) => p({ border: { ...el.border, width: v } })} /></Field>
        <Field label="Border colour"><Colour label="Border colour" value={el.border.color} onChange={(v) => p({ border: { ...el.border, color: v } })} /></Field>
      </div>
      <div className="idg-switches">
        <span><ToggleSwitch checked={el.shadow.on} onChange={() => p({ shadow: { ...el.shadow, on: !el.shadow.on } })} label="Drop shadow" /> Drop shadow</span>
        {el.shadow.on && <Field label="Shadow size"><Num value={el.shadow.blur} step={0.5} min={0.5} max={8} suffix="mm" onChange={(v) => p({ shadow: { ...el.shadow, blur: v } })} /></Field>}
        <span><ToggleSwitch checked={el.cleanSignature} onChange={() => p({ cleanSignature: !el.cleanSignature })} label="Remove paper background" /> Remove paper background (signatures)</span>
        <span><ToggleSwitch checked={el.required} onChange={() => p({ required: !el.required })} label="Required" /> Required (pre-flight)</span>
      </div>
    </>
  );
}

function QrProps({ el, patch, columns }: { el: QrElement; patch: Patch; columns: string[] }) {
  const p = patch as (x: Partial<QrElement>) => void;
  return (
    <>
      <Field label="QR contains" wide>
        <select className="input-field" value={el.content} onChange={(e) => p({ content: e.target.value as QrElement["content"] })}>
          <option value="column">One column (e.g. Admission No)</option>
          <option value="biodata">Full biodata (choose columns)</option>
          <option value="vcard">Contact card – name, emergency number, blood group</option>
          <option value="tel">Emergency number – scan to call</option>
          <option value="url">Verification web link</option>
        </select>
      </Field>
      {(el.content === "column" || el.content === "tel") && <Field label="Column" wide><ColumnSelect value={el.column} columns={columns} onChange={(v) => p({ column: v })} /></Field>}
      {el.content === "url" && (
        <Field label="Link (use {Column} placeholders)" wide>
          <input className="input-field" value={el.urlTemplate} onChange={(e) => p({ urlTemplate: e.target.value })} />
        </Field>
      )}
      {el.content === "biodata" && (
        <div className="idg-checks">
          {columns.map((c) => (
            <label key={c}><input type="checkbox" checked={el.columns.includes(c)} onChange={() => p({ columns: el.columns.includes(c) ? el.columns.filter((x) => x !== c) : [...el.columns, c] })} /> {c}</label>
          ))}
        </div>
      )}
      <div className="idg-grid2">
        <Field label="Error correction">
          <select className="input-field" value={el.logo ? "H" : el.ecc} disabled={el.logo} onChange={(e) => p({ ecc: e.target.value as QrElement["ecc"] })}>
            <option value="L">Low (7%)</option><option value="M">Medium (15%)</option><option value="Q">Quartile (25%)</option><option value="H">High (30%)</option>
          </select>
        </Field>
        <Field label="Colour"><Colour label="QR colour" value={el.color} onChange={(v) => p({ color: v })} /></Field>
      </div>
      <div className="idg-switches">
        <span><ToggleSwitch checked={el.logo} onChange={() => p({ logo: !el.logo })} label="School logo in the centre" /> School logo in the centre</span>
        <span><ToggleSwitch checked={el.required} onChange={() => p({ required: !el.required })} label="Required" /> Required (pre-flight)</span>
      </div>
    </>
  );
}

function BarcodeProps({ el, patch, columns }: { el: BarcodeElement; patch: Patch; columns: string[] }) {
  const p = patch as (x: Partial<BarcodeElement>) => void;
  return (
    <>
      <div className="idg-grid2">
        <Field label="Format">
          <select className="input-field" value={el.format} onChange={(e) => p({ format: e.target.value as BarcodeElement["format"] })}>
            <option value="code128">Code 128 (letters + numbers)</option><option value="code39">Code 39</option><option value="ean13">EAN-13 (12–13 digits)</option>
          </select>
        </Field>
        <Field label="Column"><ColumnSelect value={el.column} columns={columns} onChange={(v) => p({ column: v })} /></Field>
        <Field label="Colour"><Colour label="Barcode colour" value={el.color} onChange={(v) => p({ color: v })} /></Field>
      </div>
      <div className="idg-switches">
        <span><ToggleSwitch checked={el.showText} onChange={() => p({ showText: !el.showText })} label="Print number under bars" /> Print number under bars</span>
        <span><ToggleSwitch checked={el.required} onChange={() => p({ required: !el.required })} label="Required" /> Required (pre-flight)</span>
      </div>
    </>
  );
}

export function Properties({ el, patch, columns, onDelete, onDuplicate, onLayer }: {
  el: CardElement; patch: Patch; columns: string[]; onDelete: () => void; onDuplicate: () => void; onLayer: (dir: -1 | 1) => void;
}) {
  return (
    <div className="idg-props">
      <Geometry el={el} patch={patch} />
      <Rotation el={el} patch={patch} />
      {el.kind === "text" && <TextProps el={el} patch={patch} columns={columns} />}
      {el.kind === "image" && <ImageProps el={el} patch={patch} />}
      {el.kind === "qr" && <QrProps el={el} patch={patch} columns={columns} />}
      {el.kind === "barcode" && <BarcodeProps el={el} patch={patch} columns={columns} />}
      <div className="idg-row-actions">
        <button type="button" className="btn-secondary" onClick={() => onLayer(-1)}>Send back</button>
        <button type="button" className="btn-secondary" onClick={() => onLayer(1)}>Bring front</button>
        <button type="button" className="btn-secondary" onClick={onDuplicate}>Duplicate</button>
        <button type="button" className="btn-secondary idg-danger" onClick={onDelete}>Remove</button>
      </div>
    </div>
  );
}
