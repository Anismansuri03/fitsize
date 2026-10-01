import { useState } from 'react';
import { addPageNumbers, addWatermark, labelFor, numberPlacement } from '../../lib/pdfops/stamp';
import type { NumberFormat, NumberPosition } from '../../lib/pdfops/stamp';
import { parsePageRange } from '../../lib/pdf/pageRange';
import { FONT_STACK, measureText } from '../../lib/editor/canvasPaint';
import { AdvancedToggle, Segmented } from '../ui';
import { INK_COLORS, Stepper, Swatches } from '../editor/Options';
import FirstPagePreview from './FirstPagePreview';
import Workbench from './Workbench';
import { base, readBytes } from './shared';

/* ---------- Page numbers ---------- */

const POSITIONS: { id: NumberPosition; label: string }[] = [
  { id: 'tl', label: 'Top left' }, { id: 'tc', label: 'Top centre' }, { id: 'tr', label: 'Top right' },
  { id: 'bl', label: 'Bottom left' }, { id: 'bc', label: 'Bottom centre' }, { id: 'br', label: 'Bottom right' },
];
const FORMATS: { id: NumberFormat; label: string }[] = [
  { id: 'n', label: '1, 2, 3' }, { id: 'page-n', label: 'Page 1, Page 2' }, { id: 'n-of-total', label: '1 of 10, 2 of 10' }, { id: 'page-n-of-total', label: 'Page 1 of 10' },
];

export function PageNumbersTool() {
  const [position, setPosition] = useState<NumberPosition>('bc');
  const [format, setFormat] = useState<NumberFormat>('n');
  const [advanced, setAdvanced] = useState(false);
  const [start, setStart] = useState(1);
  const [from, setFrom] = useState(1);
  const [size, setSize] = useState(11);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState('#111827');

  return (
    <Workbench
      dropTitle="Drop your PDF here"
      dropHint="Then choose where the numbers go."
      action={() => 'Add page numbers'}
      zipName="numbered.zip"
      next={[{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/merge-pdf/', label: 'Merge PDFs' }]}
      problem={(items) => (items[0]?.pages && from > items[0].pages ? `This PDF only has ${items[0].pages} pages.` : null)}
      options={(items) => (
        <div className="stack">
          <FirstPagePreview file={items[0].file}>
            {({ W, H, scale }) => {
              const label = labelFor(format, start, start + (items[0].pages ?? 10) - from);
              const w = measureText({ text: label, size, font: 'sans', bold: false, italic: false }).w;
              const at = numberPlacement(position, W, H, w, size, margin);
              return <span className="preview1__num" style={{ left: at.u * scale, top: (at.v - size * 0.8465) * scale, fontSize: size * scale, color, fontFamily: FONT_STACK.sans }}>{from === 1 ? label : labelFor(format, start, start + (items[0].pages ?? 10) - from)}</span>;
            }}
          </FirstPagePreview>
          <div className="field">
            <span className="field__label">Position</span>
            <div className="posgrid" role="radiogroup" aria-label="Position">
              {POSITIONS.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={position === p.id} aria-label={p.label} className={`posgrid__cell${position === p.id ? ' posgrid__cell--on' : ''}`} onClick={() => setPosition(p.id)}>
                  <span className={`posgrid__dot posgrid__dot--${p.id}`} />
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="numfmt">Style</label>
            <select id="numfmt" className="select" value={format} onChange={(e) => setFormat(e.target.value as NumberFormat)}>
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <AdvancedToggle checked={advanced} onChange={setAdvanced}>
            <Stepper label="Size" value={size} min={7} max={28} onChange={setSize} />
            <Stepper label="Distance from edge" value={margin} min={8} max={100} step={4} onChange={setMargin} />
            <div className="field">
              <label className="field__label" htmlFor="startn">First number</label>
              <input id="startn" className="input" type="number" inputMode="numeric" min="0" value={start} onChange={(e) => setStart(Math.max(0, Math.floor(Number(e.target.value)) || 0))} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="fromp">Start numbering on page</label>
              <input id="fromp" className="input" type="number" inputMode="numeric" min="1" value={from} onChange={(e) => setFrom(Math.max(1, Math.floor(Number(e.target.value)) || 1))} />
              <p className="field__help">Use 2 to leave the cover page without a number.</p>
            </div>
            <Swatches colors={INK_COLORS.slice(0, 5)} value={color} label="Colour" onChange={setColor} />
          </AdvancedToggle>
        </div>
      )}
      process={async (items, { report }) => {
        report({ note: 'Adding page numbers…' });
        const out = await addPageNumbers(await readBytes(items[0].file), { position, format, start, from, size, margin, color }, (f) => report({ progress: f }));
        return [{ name: `${base(items[0].file)}-numbered.pdf`, bytes: out }];
      }}
    />
  );
}

/* ---------- Watermark ---------- */

type Kind = 'text' | 'picture';
const SIZES = { small: 0.4, medium: 0.6, large: 0.85 } as const;
type SizeKey = keyof typeof SIZES;
const WM_COLORS = ['#6b7280', '#dc2626', '#1c4fd8', '#111827'];

async function preparePicture(file: File) {
  const bmp = await createImageBitmap(file);
  const bw = bmp.width, bh = bmp.height;
  const k = Math.min(1, 1600 / Math.max(bw, bh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bw * k));
  c.height = Math.max(1, Math.round(bh * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('picture'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/png' as const, ratio: c.height / c.width, url: URL.createObjectURL(blob) };
}

export function WatermarkTool() {
  const [kind, setKind] = useState<Kind>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [size, setSize] = useState<SizeKey>('medium');
  const [opacity, setOpacity] = useState(25);
  const [diagonal, setDiagonal] = useState(true);
  const [color, setColor] = useState(WM_COLORS[0]);
  const [pic, setPic] = useState<Awaited<ReturnType<typeof preparePicture>> | null>(null);
  const [picError, setPicError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [range, setRange] = useState('');

  return (
    <Workbench
      dropTitle="Drop your PDF here"
      dropHint="Then type your watermark, or use a picture such as a logo."
      action={() => 'Add watermark'}
      zipName="watermarked.zip"
      next={[{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/protect-pdf/', label: 'Protect it' }]}
      problem={(items) => {
        if (kind === 'text' && !text.trim()) return 'Type the watermark text.';
        if (kind === 'picture' && !pic) return 'Choose a picture to use as the watermark.';
        if (advanced && range.trim() && items[0]?.pages) { const r = parsePageRange(range, items[0].pages); if (!r.ok) return r.message; }
        return null;
      }}
      options={(items) => (
        <div className="stack">
          <FirstPagePreview file={items[0].file}>
            {({ W, H, scale }) => {
              const target = SIZES[size] * (diagonal ? Math.hypot(W, H) * 0.75 : W);
              if (kind === 'picture') {
                return pic ? <img src={pic.url} alt="" style={{ position: 'absolute', left: '50%', top: '50%', width: Math.min(target, W * 0.95) * scale, transform: `translate(-50%,-50%) rotate(${diagonal ? -45 : 0}deg)`, opacity: opacity / 100 }} /> : null;
              }
              const perPt = measureText({ text: text || ' ', size: 1000, font: 'sans', bold: true, italic: false }).w / 1000;
              const fs = Math.max(10, Math.min(300, target / perPt));
              return <span className="preview1__wm" style={{ fontSize: fs * scale, color, opacity: opacity / 100, fontFamily: FONT_STACK.sans, transform: `translate(-50%,-50%) rotate(${diagonal ? -45 : 0}deg)` }}>{text}</span>;
            }}
          </FirstPagePreview>

          <Segmented<Kind> label="Watermark type" wide value={kind} onChange={setKind} options={[{ value: 'text', label: 'Text' }, { value: 'picture', label: 'Picture' }]} />
          {kind === 'text' ? (
            <div className="field">
              <label className="field__label" htmlFor="wmtext">Text</label>
              <input id="wmtext" className="input" type="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} />
              <Swatches colors={WM_COLORS} value={color} label="Colour" onChange={setColor} />
            </div>
          ) : (
            <div className="field">
              <label className="field__label" htmlFor="wmpic">Picture</label>
              <input id="wmpic" className="input" type="file" accept="image/*" onChange={async (e) => {
                setPicError('');
                const f = e.target.files?.[0];
                if (!f) return;
                try { setPic(await preparePicture(f)); } catch { setPic(null); setPicError('We couldn’t open that picture. Try a JPG or PNG.'); }
              }} />
              {picError && <p className="field__error" role="alert">{picError}</p>}
            </div>
          )}
          <div className="field">
            <span className="field__label">Size</span>
            <Segmented<SizeKey> label="Size" wide value={size} onChange={setSize} options={[{ value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }]} />
          </div>
          <div className="field">
            <span className="field__label">Direction</span>
            <Segmented<'diag' | 'flat'> label="Direction" wide value={diagonal ? 'diag' : 'flat'} onChange={(v) => setDiagonal(v === 'diag')} options={[{ value: 'diag', label: 'Diagonal' }, { value: 'flat', label: 'Straight' }]} />
          </div>
          <div className="range">
            <div className="range__top"><label className="field__label" htmlFor="wmop">See-through</label><span className="range__value">{100 - opacity}%</span></div>
            <input id="wmop" type="range" min={5} max={90} step={5} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            <div className="range__ends"><span>Faint</span><span>Bold</span></div>
          </div>
          <AdvancedToggle checked={advanced} onChange={setAdvanced}>
            <div className="field">
              <label className="field__label" htmlFor="wmrange">Only these pages (optional)</label>
              <input id="wmrange" className="input" type="text" value={range} onChange={(e) => setRange(e.target.value)} placeholder="All pages, or for example 1-3, 5" />
            </div>
          </AdvancedToggle>
        </div>
      )}
      process={async (items, { report }) => {
        report({ note: 'Adding the watermark…' });
        let pages: number[] | undefined;
        if (advanced && range.trim()) {
          const r = parsePageRange(range, items[0].pages ?? 100000);
          if (!r.ok) throw new Error(r.message);
          pages = r.pages;
        }
        const out = await addWatermark(await readBytes(items[0].file), {
          text: kind === 'text' ? text : undefined,
          image: kind === 'picture' && pic ? { bytes: pic.bytes, mime: pic.mime, ratio: pic.ratio } : undefined,
          scale: SIZES[size], opacity: opacity / 100, diagonal, color, pages,
        }, (f) => report({ progress: f }));
        return [{ name: `${base(items[0].file)}-watermarked.pdf`, bytes: out }];
      }}
    />
  );
}
