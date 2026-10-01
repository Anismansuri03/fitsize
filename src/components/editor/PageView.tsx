import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Annot, BoxAnn, Doc, PageRef, TextAnn, VectorAnn } from '../../lib/editor/types';
import { pageSize } from '../../lib/editor/types';
import { clampToPage, resizeBox } from '../../lib/editor/geometry';
import type { Handle, Pt } from '../../lib/editor/geometry';
import { FONT_STACK, fontCss } from '../../lib/editor/canvasPaint';
import { LINE_HEIGHT } from '../../lib/editor/placement';
import type { Ctl, DragState } from './ctl';
import { Icon } from '../ui';

/* ---------- The picture of the page itself ---------- */

type RenderTask = { promise: Promise<unknown>; cancel: () => void };

export const PageCanvas = memo(function PageCanvas(props: { pdf: PDFDocumentProxy | null; index: number; rotation: number; w: number; h: number; zoom: number; active: boolean }) {
  const { pdf, index, rotation, w, h, zoom, active } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!active || !pdf) {
      canvas.width = 0; // give the memory back while the page is far off screen
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    const timer = setTimeout(async () => {
      try {
        const p = await pdf.getPage(index + 1);
        if (cancelled) return;
        let scale = zoom * Math.min(window.devicePixelRatio || 1, 2);
        while (w * scale * h * scale > 16_000_000) scale *= 0.9;
        const vp = p.getViewport({ scale, rotation });
        const off = document.createElement('canvas'); // draw off-screen so the page never flashes blank
        off.width = Math.ceil(vp.width);
        off.height = Math.ceil(vp.height);
        task = p.render({ canvas: off, viewport: vp, background: '#ffffff' }) as unknown as RenderTask;
        await task.promise;
        if (cancelled) return;
        canvas.width = off.width;
        canvas.height = off.height;
        canvas.getContext('2d')!.drawImage(off, 0, 0);
        off.width = off.height = 0;
        p.cleanup();
      } catch (e) {
        if ((e as { name?: string })?.name !== 'RenderingCancelledException' && !cancelled) console.warn('Page render failed', e);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
    };
  }, [pdf, index, rotation, w, h, zoom, active]);

  return <canvas ref={ref} className="page__canvas" aria-hidden="true" />;
});

function useBlobUrl(bytes: Uint8Array | null, mime: string) {
  const url = useMemo(() => (bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })) : undefined), [bytes, mime]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

/* ---------- One mark on the page ---------- */

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se'];

function AnnotView({ a, ctl, pageW, pageH, gesture }: { a: Annot; ctl: Ctl; pageW: number; pageH: number; gesture: (e: React.PointerEvent, make: (dx: number, dy: number) => (d: Doc) => Doc) => void }) {
  const z = ctl.zoom;
  const selected = ctl.selectedId === a.id;
  const editing = ctl.editing?.id === a.id;
  const interactive = ctl.tool === 'select';
  const url = useBlobUrl(a.type === 'image' ? a.bytes : null, a.type === 'image' ? a.mime : '');

  const patch = (fn: (m: Annot) => Annot) => (d: Doc): Doc => ({ ...d, annots: d.annots.map((m) => (m.id === a.id ? fn(m) : m)) });

  const onDown = (e: React.PointerEvent) => {
    if (!interactive || editing) return;
    e.stopPropagation();
    ctl.select(a.id);
    const o = { x: a.x, y: a.y, w: a.w, h: a.h };
    gesture(e, (dx, dy) => patch((m) => {
      const c = clampToPage({ ...o, x: o.x + dx, y: o.y + dy }, pageW, pageH);
      return { ...m, x: c.x, y: c.y } as Annot;
    }));
  };

  const onHandle = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const o = { x: a.x, y: a.y, w: a.w, h: a.h };
    gesture(e, (dx, dy) => patch((m) => ({ ...m, ...resizeBox(o, h, dx, dy, a.type === 'image') }) as Annot));
  };

  const style: React.CSSProperties = {
    left: a.x * z,
    top: a.y * z,
    width: a.w * z,
    height: a.h * z,
    pointerEvents: interactive ? 'auto' : 'none',
  };

  let body: React.ReactNode = null;
  if (a.type === 'text') {
    const common: React.CSSProperties = { font: fontCss(a, a.size * z), lineHeight: LINE_HEIGHT, color: a.color, margin: 0, padding: 0, whiteSpace: 'pre' };
    body = editing ? (
      <textarea
        className="ann__editor"
        style={{ ...common, width: (a.w + a.size) * z, height: a.h * z }}
        value={a.text}
        autoFocus
        spellCheck
        aria-label="Type your text"
        onChange={(e) => ctl.setText(a.id, e.target.value)}
        onBlur={() => ctl.finishEdit(a.id)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.currentTarget as HTMLTextAreaElement).blur();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={(e) => { const t = e.currentTarget; t.setSelectionRange(t.value.length, t.value.length); }}
      />
    ) : (
      <div style={common}>{a.text}</div>
    );
  } else if (a.type === 'image') {
    body = <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />;
  } else if (a.type === 'box') {
    const inset = a.stroke ? a.strokeWidth * z : 0;
    body = (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxSizing: 'border-box',
          background: a.fill ?? 'transparent',
          opacity: a.opacity,
          border: a.stroke ? `${inset}px solid ${a.stroke}` : undefined,
          borderRadius: a.variant === 'ellipse' ? '50%' : 0,
          outline: a.variant === 'whiteout' && !selected ? '1px dashed rgba(120,130,150,.35)' : undefined,
        }}
      />
    );
  } else {
    body = <VectorSvg a={a} z={z} />;
  }

  return (
    <div
      className={`ann${selected ? ' ann--sel' : ''}${editing ? ' ann--editing' : ''}`}
      style={style}
      tabIndex={interactive ? 0 : -1}
      onPointerDown={onDown}
      onFocus={() => interactive && !selected && ctl.select(a.id)}
      onDoubleClick={() => a.type === 'text' && interactive && ctl.editText(a.id)}
      data-ann={a.type}
    >
      {body}
      {selected && !editing && a.type !== 'text' && HANDLES.map((h) => <span key={h} className={`handle handle--${h}`} onPointerDown={onHandle(h)} />)}
      {selected && !editing && (
        <button type="button" className="ann__del" aria-label="Delete this item" onPointerDown={(e) => e.stopPropagation()} onClick={() => ctl.remove(a.id)}>
          <Icon name="trash" size={15} />
        </button>
      )}
    </div>
  );
}

function VectorSvg({ a, z }: { a: VectorAnn; z: number }) {
  return (
    <svg width={a.w * z} height={a.h * z} viewBox={`0 0 ${a.w0} ${a.h0}`} preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
      {a.paths.map((p, i) =>
        p.length === 1 ? (
          <circle key={i} cx={p[0][0]} cy={p[0][1]} r={(a.width / 2) * (a.w0 / Math.max(a.w, 1))} fill={a.color} />
        ) : (
          <polyline key={i} points={p.map((q) => q.join(',')).join(' ')} fill="none" stroke={a.color} strokeWidth={a.width * z} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ),
      )}
    </svg>
  );
}

/* ---------- The page: picture + a layer for marks ---------- */

export default function PageView({ page, pdf, annots, ctl }: { page: PageRef; pdf: PDFDocumentProxy | null; annots: Annot[]; ctl: Ctl }) {
  const size = pageSize(page);
  const z = ctl.zoom;
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { root: ctl.scrollEl, rootMargin: '1400px 0px' });
    io.observe(el);
    ctl.registerEl(page.id, el);
    return () => {
      io.disconnect();
      ctl.registerEl(page.id, null);
    };
  }, [ctl.scrollEl, page.id]);

  const toPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = overlayRef.current!.getBoundingClientRect();
    const x = Math.min(size.w, Math.max(0, (e.clientX - r.left) / z));
    const y = Math.min(size.h, Math.max(0, (e.clientY - r.top) / z));
    return [x, y];
  };

  const gesture = (e: React.PointerEvent, make: (dx: number, dy: number) => (d: Doc) => Doc) => {
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return; // a click, not a drag
        started = true;
        ctl.dispatch({ type: 'gestureStart' });
      }
      ctl.dispatch({ type: 'live', fn: make((ev.clientX - sx) / z, (ev.clientY - sy) / z) });
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (started) ctl.dispatch({ type: 'gestureEnd' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const dragTool = ctl.tool === 'draw' || ctl.tool === 'highlight' || ctl.tool === 'shape' || ctl.tool === 'whiteout' || ctl.tool === 'redact';

  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = toPt(e);
    if (ctl.tool === 'select') return void ctl.select(null);
    if (ctl.tool === 'stamp') return void ctl.placeStamp(page.id, p);
    if (!dragTool) return;
    e.preventDefault();
    overlayRef.current!.setPointerCapture(e.pointerId);
    const d: DragState = { start: p, cur: p, pts: [p] };
    dragRef.current = d;
    setDrag(d);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = toPt(e);
    if (ctl.tool === 'draw') d.pts.push(p);
    const next = { ...d, cur: p };
    dragRef.current = next;
    setDrag(next);
  };
  const onUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d) ctl.finishDrag(page.id, d);
  };

  const preview = drag && renderPreview(drag, ctl, z);

  return (
    <div className="page" ref={wrapRef} style={{ width: size.w * z, height: size.h * z }} data-page-id={page.id}>
      {pdf ? <PageCanvas pdf={pdf} index={page.index} rotation={(page.baseRot + page.rot) % 360} w={size.w} h={size.h} zoom={z} active={near} /> : <div className="page__blank" />}
      <div
        ref={overlayRef}
        className={`page__overlay${dragTool ? ' page__overlay--draw' : ''}${ctl.tool === 'text' ? ' page__overlay--text' : ''}${ctl.tool === 'stamp' ? ' page__overlay--stamp' : ''}`}
        onPointerDown={onDown}
        onClick={(e) => {
          // Text starts on the click (mouse-up), not on mouse-down: the browser moves keyboard focus
          // during mouse-down, which would immediately close a text box opened any earlier.
          if (ctl.tool === 'text') {
            const p = toPt(e);
            ctl.beginText(page.id, p[0], p[1]);
          }
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
      >
        {annots.map((a) => (
          <AnnotView key={a.id} a={a} ctl={ctl} pageW={size.w} pageH={size.h} gesture={gesture} />
        ))}
        {preview}
      </div>
    </div>
  );
}

function renderPreview(d: DragState, ctl: Ctl, z: number) {
  const x = Math.min(d.start[0], d.cur[0]) * z, y = Math.min(d.start[1], d.cur[1]) * z;
  const w = Math.abs(d.cur[0] - d.start[0]) * z, h = Math.abs(d.cur[1] - d.start[1]) * z;
  if (ctl.tool === 'draw') {
    return (
      <svg className="preview" width="100%" height="100%">
        <polyline points={d.pts.map((p) => `${p[0] * z},${p[1] * z}`).join(' ')} fill="none" stroke={ctl.pen.color} strokeWidth={ctl.pen.width * z} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (ctl.tool === 'shape' && (ctl.shape === 'line' || ctl.shape === 'arrow')) {
    return (
      <svg className="preview" width="100%" height="100%">
        <line x1={d.start[0] * z} y1={d.start[1] * z} x2={d.cur[0] * z} y2={d.cur[1] * z} stroke={ctl.shapeStyle.color} strokeWidth={ctl.shapeStyle.width * z} strokeLinecap="round" />
      </svg>
    );
  }
  const st: React.CSSProperties = { position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', pointerEvents: 'none' };
  if (ctl.tool === 'highlight') Object.assign(st, { background: ctl.hl, opacity: 0.4 });
  else if (ctl.tool === 'whiteout') Object.assign(st, { background: '#fff', border: '1px dashed #8791a5' });
  else if (ctl.tool === 'redact') Object.assign(st, { background: '#000' });
  else if (ctl.tool === 'shape') Object.assign(st, { border: `${ctl.shapeStyle.width * z}px solid ${ctl.shapeStyle.color}`, background: ctl.shapeStyle.fill ? ctl.shapeStyle.color : 'transparent', borderRadius: ctl.shape === 'ellipse' ? '50%' : 0 });
  return <div style={st} />;
}

export type { BoxAnn, TextAnn };
export { FONT_STACK };
