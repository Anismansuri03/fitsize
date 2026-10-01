import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../../lib/pdf/pdfjs';
import { qpdf } from '../../lib/pdfops/qpdf';
import { keepPagesArgs, rotateArgs } from '../../lib/pdfops/qpdfArgs';
import { keepAllExcept } from '../../lib/pdfops/ranges';
import { formatBytes } from '../../lib/fit/units';
import { friendlyError, isAbort } from '../../lib/worker-rpc';
import { ACCEPT_PDF, Dropzone, FileCard, Icon, Notice, PrivacyNote, ProgressBar } from '../ui';
import PdfThumb from './PdfThumb';
import { ResultView } from './Workbench';
import type { OutFile } from './Workbench';
import { base, plural, readBytes } from './shared';

export type PageMode = 'rotate' | 'remove' | 'extract';
interface PageInfo { w: number; h: number; baseRot: number }

const FRAME_W = 136;
const FRAME_H = 176;

const COPY: Record<PageMode, { title: string; hint: string; action: string; next: { href: string; label: string }[] }> = {
  rotate: { title: 'Drop your PDF here', hint: 'Then turn any page the right way up.', action: 'Save rotated PDF', next: [{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/edit-pdf/', label: 'Edit it' }] },
  remove: { title: 'Drop your PDF here', hint: 'Then click the pages you want to remove.', action: 'Remove pages', next: [{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/merge-pdf/', label: 'Merge PDFs' }] },
  extract: { title: 'Drop your PDF here', hint: 'Then click the pages you want to keep.', action: 'Extract pages', next: [{ href: '/split-pdf/', label: 'Split a PDF' }, { href: '/merge-pdf/', label: 'Merge PDFs' }] },
};

export default function PageTool({ mode }: { mode: PageMode }) {
  const copy = COPY[mode];
  const [file, setFile] = useState<File | null>(null);
  const [pdf, setPdf] = useState<{ doc: PDFDocumentProxy; close: () => Promise<void> } | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [turn, setTurn] = useState<number[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ note?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [outs, setOuts] = useState<OutFile[] | null>(null);
  const cur = useRef<{ close: () => Promise<void> } | null>(null);

  const reset = () => {
    cur.current?.close().catch(() => {});
    cur.current = null;
    setFile(null); setPdf(null); setPages([]); setTurn([]); setPicked(new Set()); setOuts(null); setError(null);
  };
  useEffect(() => () => { cur.current?.close().catch(() => {}); }, []);

  const open = async (f: File) => {
    reset();
    setRejected([]);
    setLoading(true);
    try {
      const { doc, close } = await openPdf(await readBytes(f));
      cur.current = { close };
      const infos: PageInfo[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const p = await doc.getPage(i);
        const baseRot = ((p.rotate % 360) + 360) % 360;
        const vp = p.getViewport({ scale: 1, rotation: baseRot });
        infos.push({ w: vp.width, h: vp.height, baseRot });
        p.cleanup();
      }
      setFile(f); setPdf({ doc, close }); setPages(infos); setTurn(new Array(infos.length).fill(0));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => { setOuts(null); setPicked((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; }); };
  const spin = (i: number, by: number) => { setOuts(null); setTurn((t) => t.map((v, k) => (k === i ? (v + by + 360) % 360 : v))); };
  const spinAll = (by: number) => { setOuts(null); setTurn((t) => t.map((v) => (v + by + 360) % 360)); };

  const total = pages.length;
  const turned = turn.filter(Boolean).length;
  const problem =
    mode === 'rotate' ? (turned === 0 ? 'Turn at least one page first.' : null)
    : mode === 'remove' ? (picked.size === 0 ? 'Click the pages you want to remove.' : picked.size >= total ? 'You can’t remove every page.' : null)
    : (picked.size === 0 ? 'Click the pages you want to keep.' : null);

  const run = async () => {
    if (!file) return;
    const c = new AbortController();
    setBusy(true); setError(null); setOuts(null); setProgress({ note: 'Working on it…' });
    try {
      await qpdf.load([await readBytes(file)], { signal: c.signal });
      let args: string[];
      let name: string;
      if (mode === 'rotate') {
        args = rotateArgs(new Map(turn.map((t, i) => [i + 1, t] as [number, number]).filter(([, t]) => t)));
        name = `${base(file)}-rotated.pdf`;
      } else if (mode === 'remove') {
        args = keepPagesArgs(keepAllExcept(total, new Set([...picked].map((i) => i + 1))));
        name = `${base(file)}-pages-removed.pdf`;
      } else {
        args = keepPagesArgs([...picked].sort((a, b) => a - b).map((i) => i + 1));
        name = `${base(file)}-extracted.pdf`;
      }
      const r = await qpdf.run(args, { signal: c.signal });
      setOuts([{ name, bytes: r.files[0].bytes }]);
    } catch (e) {
      if (!isAbort(e)) setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!file || !pdf) {
    return (
      <div className="panel stack">
        <Dropzone accept={ACCEPT_PDF} onFiles={(f) => void open(f[0])} onReject={setRejected} title={copy.title} hint={copy.hint} buttonLabel="Choose PDF" disabled={loading} />
        {loading && <ProgressBar note="Opening your PDF…" />}
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  const label =
    mode === 'rotate' ? (turned ? `${plural(turned, 'page')} turned` : 'Use the arrow on a page to turn it')
    : mode === 'remove' ? `${plural(picked.size, 'page')} to remove, ${total - picked.size} kept`
    : `${plural(picked.size, 'page')} selected`;

  return (
    <div className="panel stack">
      <FileCard name={file.name} thumb={<span className="file__thumb">PDF</span>} sub={`${formatBytes(file.size)}  ·  ${plural(total, 'page')}`} onRemove={reset} removeDisabled={busy} />

      <div className="pagebar">
        <span className="pagebar__label" role="status">{label}</span>
        <div className="pagebar__acts">
          {mode === 'rotate' ? (
            <>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => spinAll(-90)} disabled={busy}><Icon name="rotate" size={16} /> All left</button>
              <button type="button" className="btn btn--secondary btn--small" onClick={() => spinAll(90)} disabled={busy}><Icon name="rotate" size={16} /> All right</button>
              {turned > 0 && <button type="button" className="btn btn--ghost btn--small" onClick={() => setTurn(new Array(total).fill(0))}>Reset</button>}
            </>
          ) : (
            <>
              {mode === 'extract' && <button type="button" className="btn btn--secondary btn--small" onClick={() => setPicked(new Set(pages.map((_, i) => i)))} disabled={busy}>Select all</button>}
              {picked.size > 0 && <button type="button" className="btn btn--ghost btn--small" onClick={() => setPicked(new Set())}>Clear</button>}
            </>
          )}
        </div>
      </div>

      <div className="pagegrid">
        {pages.map((p, i) => {
          const rot = turn[i];
          const dw = rot % 180 ? p.h : p.w, dh = rot % 180 ? p.w : p.h;
          const s = Math.min(FRAME_W / dw, FRAME_H / dh);
          const cw = p.w * s, ch = p.h * s;
          const on = picked.has(i);
          const inner = (
            <span className="pg__frame" style={{ width: FRAME_W, height: FRAME_H }}>
              <span className="pg__rot" style={{ width: cw, height: ch, transform: `translate(-50%,-50%) rotate(${rot}deg)` }}>
                <PdfThumb pdf={pdf.doc} index={i} baseRot={p.baseRot} cssW={cw} cssH={ch} />
              </span>
              {mode === 'remove' && on && <span className="pg__mark pg__mark--remove"><Icon name="trash" size={22} /></span>}
              {mode === 'extract' && on && <span className="pg__mark pg__mark--keep"><Icon name="check" size={22} /></span>}
            </span>
          );
          return (
            <div key={i} className={`pg${on ? ' pg--on' : ''}${mode === 'remove' && on ? ' pg--remove' : ''}`}>
              {mode === 'rotate' ? (
                <>
                  {inner}
                  <span className="pg__row">
                    <span className="pg__n">{i + 1}</span>
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => spin(i, -90)} aria-label={`Turn page ${i + 1} left`} disabled={busy}><Icon name="rotate" size={16} /></button>
                    <button type="button" className="icon-btn icon-btn--sm pg__flip" onClick={() => spin(i, 90)} aria-label={`Turn page ${i + 1} right`} disabled={busy}><Icon name="rotate" size={16} /></button>
                  </span>
                </>
              ) : (
                <button type="button" className="pg__btn" aria-pressed={on} aria-label={`Page ${i + 1}`} onClick={() => toggle(i)} disabled={busy}>
                  {inner}
                  <span className="pg__row"><span className="pg__n">{i + 1}</span></span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {busy && <ProgressBar note={progress.note} />}
      {error && <Notice tone="error">{error}</Notice>}
      {problem && !busy && !outs && <p className="field__help" role="status">{problem}</p>}
      {outs && !busy && <ResultView outs={outs} zipName="pages.zip" next={copy.next} />}

      <div className="stack">
        {busy ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={() => qpdf.terminate()}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={run} disabled={!!problem}>{outs ? 'Do it again' : copy.action}</button>
        )}
        <button type="button" className="btn btn--ghost" onClick={reset} disabled={busy}>Start over</button>
      </div>
      <PrivacyNote />
    </div>
  );
}
