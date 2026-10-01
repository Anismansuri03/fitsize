import { useEffect, useRef, useState } from 'react';
import '@fontsource-variable/caveat';
import { Icon, Segmented } from '../ui';

export interface Signature {
  id: string;
  bytes: Uint8Array;
  /** Height / width. */
  ratio: number;
  url: string;
}

const INKS = ['#111827', '#1c4fd8', '#b91c1c'];
type Tab = 'draw' | 'type' | 'upload';

/** Crop a canvas to the ink it contains and return it as a PNG. */
async function trimToPng(src: HTMLCanvasElement): Promise<{ bytes: Uint8Array; ratio: number } | null> {
  const ctx = src.getContext('2d')!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 12) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d')!.drawImage(src, minX, minY, w, h, 0, 0, w, h);
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error('No picture'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ratio: h / w };
}

export default function SignModal(props: { saved: Signature[]; onUse: (s: Omit<Signature, 'id' | 'url'>, fresh: boolean, existing?: Signature) => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(props.saved.length ? 'draw' : 'draw');
  const [ink, setInk] = useState(INKS[0]);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removeBg, setRemoveBg] = useState(true);
  const [upload, setUpload] = useState<HTMLImageElement | null>(null);
  const pad = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    dialog.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Draw pad: a 2x canvas so the signature stays sharp.
  const point = (e: React.PointerEvent) => {
    const c = pad.current!;
    const r = c.getBoundingClientRect();
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height] as const;
  };
  const down = (e: React.PointerEvent) => {
    const c = pad.current!;
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const [x, y] = point(e);
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y);
    setHasInk(true);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = pad.current!.getContext('2d')!;
    const [x, y] = point(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const up = () => { drawing.current = false; };
  const clear = () => {
    const c = pad.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  // Typed signature preview
  useEffect(() => {
    if (tab !== 'type') return;
    const c = preview.current!;
    const ctx = c.getContext('2d')!;
    let live = true;
    (async () => {
      try { await document.fonts.load('96px "Caveat Variable"'); } catch { /* falls back to cursive */ }
      if (!live) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = ink;
      ctx.font = '96px "Caveat Variable", "Segoe Script", "Bradley Hand", cursive';
      ctx.textBaseline = 'middle';
      let size = 96;
      while (ctx.measureText(typed).width > c.width - 40 && size > 20) { size -= 4; ctx.font = `${size}px "Caveat Variable", "Segoe Script", "Bradley Hand", cursive`; }
      ctx.fillText(typed, 20, c.height / 2);
    })();
    return () => { live = false; };
  }, [tab, typed, ink]);

  const onFile = async (f: File | undefined) => {
    setError('');
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      const img = document.createElement('canvas');
      img.width = bmp.width; img.height = bmp.height;
      img.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close();
      const el = new Image();
      el.src = img.toDataURL();
      await el.decode();
      setUpload(el);
    } catch {
      setError('We couldn’t open that picture. Try a JPG or PNG.');
    }
  };

  const use = async () => {
    setBusy(true); setError('');
    try {
      let src: HTMLCanvasElement;
      if (tab === 'draw') src = pad.current!;
      else if (tab === 'type') src = preview.current!;
      else {
        if (!upload) return;
        const scale = Math.min(1, 900 / upload.width);
        src = document.createElement('canvas');
        src.width = Math.round(upload.width * scale); src.height = Math.round(upload.height * scale);
        const ctx = src.getContext('2d')!;
        ctx.drawImage(upload, 0, 0, src.width, src.height);
        if (removeBg) {
          const im = ctx.getImageData(0, 0, src.width, src.height);
          for (let i = 0; i < im.data.length; i += 4) {
            const lum = 0.299 * im.data[i] + 0.587 * im.data[i + 1] + 0.114 * im.data[i + 2];
            im.data[i + 3] = Math.max(0, Math.min(255, ((225 - lum) / 90) * 255));
          }
          ctx.putImageData(im, 0, 0);
        }
      }
      const r = await trimToPng(src);
      if (!r) { setError('Draw or type your signature first.'); return; }
      props.onUse(r, true);
    } finally { setBusy(false); }
  };

  const ready = tab === 'draw' ? hasInk : tab === 'type' ? typed.trim().length > 0 : !!upload;

  return (
    <div className="modal" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-label="Add your signature" tabIndex={-1} ref={dialog}>
        <div className="modal__head">
          <h2>Add your signature</h2>
          <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>

        {props.saved.length > 0 && (
          <div className="sigs">
            <span className="field__label">Use one you already made</span>
            <div className="sigs__list">
              {props.saved.map((s) => (
                <button type="button" key={s.id} className="sigs__item" onClick={() => props.onUse(s, false, s)} aria-label="Use this signature">
                  <img src={s.url} alt="Saved signature" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Segmented<Tab> label="How to sign" wide value={tab} onChange={setTab} options={[{ value: 'draw', label: 'Draw' }, { value: 'type', label: 'Type' }, { value: 'upload', label: 'Upload' }]} />

        {tab === 'draw' && (
          <div className="stack">
            <canvas ref={pad} className="sigpad" width={1200} height={400} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Signature drawing area" />
            <p className="field__help">Draw your signature above with your mouse, finger or pen.</p>
          </div>
        )}
        {tab === 'type' && (
          <div className="stack">
            <input className="input" type="text" placeholder="Type your name" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Your name" />
            <canvas ref={preview} className="sigpad sigpad--static" width={1200} height={300} aria-label="Signature preview" />
          </div>
        )}
        {tab === 'upload' && (
          <div className="stack">
            <input className="input" type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} aria-label="Choose a picture of your signature" />
            <label className="check check--plain"><input type="checkbox" checked={removeBg} onChange={(e) => setRemoveBg(e.target.checked)} />Remove the white background</label>
            <p className="field__help">Sign on white paper, take a clear photo, and upload it.</p>
          </div>
        )}

        {tab !== 'upload' && (
          <div className="inks" role="radiogroup" aria-label="Ink colour">
            {INKS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={ink === c} aria-label={`Ink ${c}`} className={`swatch${ink === c ? ' swatch--on' : ''}`} style={{ background: c }} onClick={() => setInk(c)} />
            ))}
            {tab === 'draw' && <button type="button" className="btn btn--ghost btn--small" onClick={clear} disabled={!hasInk}>Clear</button>}
          </div>
        )}

        {error && <p className="field__error" role="alert">{error}</p>}
        <div className="modal__foot">
          <button type="button" className="btn btn--secondary" onClick={props.onClose}>Cancel</button>
          <button type="button" className="btn btn--primary" disabled={!ready || busy} onClick={use}>Add to page</button>
        </div>
      </div>
    </div>
  );
}
