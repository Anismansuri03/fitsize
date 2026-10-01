import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageRef } from '../../lib/editor/types';
import { pageSize } from '../../lib/editor/types';
import { Icon } from '../ui';

const THUMB_W = 104;

const Thumb = memo(function Thumb({ pdf, page, root }: { pdf: PDFDocumentProxy | null; page: PageRef; root: HTMLElement | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const size = pageSize(page);
  const height = (THUMB_W * size.h) / size.w;

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root, rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !pdf || !near) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const p = await pdf.getPage(page.index + 1);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = p.getViewport({ scale: (THUMB_W * dpr) / size.w, rotation: (page.baseRot + page.rot) % 360 });
        const off = document.createElement('canvas');
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        task = p.render({ canvas: off, viewport: vp, background: '#ffffff' }) as unknown as typeof task;
        await task!.promise;
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d')!.drawImage(off, 0, 0);
        p.cleanup();
      } catch { /* cancelled */ }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page.index, page.rot, page.baseRot, near, size.w]);

  return (
    <div ref={holder} className="thumb__frame" style={{ width: THUMB_W, height }}>
      {pdf ? <canvas ref={ref} style={{ width: '100%', height: '100%' }} aria-hidden="true" /> : <div className="thumb__blank" />}
    </div>
  );
});

export default function Sidebar(props: {
  pages: PageRef[];
  pdfs: (PDFDocumentProxy | null)[];
  currentId: string | null;
  onGo: (id: string) => void;
  onRotate: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onAddBlank: () => void;
  onAddPdf: () => void;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const close = () => menu.current?.removeAttribute('open');
  const only = props.pages.length === 1;

  return (
    <aside className="ed__side" ref={setRoot} aria-label="Pages">
      <details className="addpages" ref={menu}>
        <summary className="btn btn--secondary btn--small">
          <Icon name="plus" size={16} /> Add pages
        </summary>
        <div className="addpages__list">
          <button type="button" onClick={() => { close(); props.onAddBlank(); }}>Blank page</button>
          <button type="button" onClick={() => { close(); props.onAddPdf(); }}>Pages from another PDF</button>
        </div>
      </details>

      <ol className="thumbs-list">
        {props.pages.map((p, i) => (
          <li key={p.id} className={`thumbitem${props.currentId === p.id ? ' thumbitem--on' : ''}`}>
            <button type="button" className="thumbitem__go" onClick={() => props.onGo(p.id)} aria-label={`Go to page ${i + 1}`} aria-current={props.currentId === p.id ? 'true' : undefined}>
              <Thumb pdf={p.src >= 0 ? props.pdfs[p.src] : null} page={p} root={root} />
              <span className="thumbitem__n">{i + 1}</span>
            </button>
            <div className="thumbitem__acts">
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => props.onMove(p.id, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} up`} title="Move up"><Icon name="up" size={16} /></button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => props.onMove(p.id, 1)} disabled={i === props.pages.length - 1} aria-label={`Move page ${i + 1} down`} title="Move down"><Icon name="down" size={16} /></button>
              <button type="button" className="icon-btn icon-btn--sm" onClick={() => props.onRotate(p.id)} aria-label={`Rotate page ${i + 1}`} title="Rotate"><Icon name="rotate" size={16} /></button>
              <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" onClick={() => props.onDelete(p.id)} disabled={only} aria-label={`Delete page ${i + 1}`} title="Delete page"><Icon name="trash" size={16} /></button>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
