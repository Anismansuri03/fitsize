import { memo, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** A small picture of one PDF page, drawn only once it is near the screen. */
const PdfThumb = memo(function PdfThumb(props: { pdf: PDFDocumentProxy; index: number; baseRot: number; cssW: number; cssH: number }) {
  const { pdf, index, baseRot, cssW, cssH } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '500px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !near) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    (async () => {
      try {
        const p = await pdf.getPage(index + 1);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const base = p.getViewport({ scale: 1, rotation: baseRot });
        const vp = p.getViewport({ scale: (cssW * dpr) / base.width, rotation: baseRot });
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
  }, [pdf, index, baseRot, near, cssW]);

  return (
    <span ref={holder} style={{ display: 'block', width: cssW, height: cssH }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block', background: '#fff' }} aria-hidden="true" />
    </span>
  );
});

export default PdfThumb;
