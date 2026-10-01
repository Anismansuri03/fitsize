import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { openPdf } from '../../lib/pdf/pdfjs';

const WIDTH = 280;

/** Draws page 1 of a PDF and lets the caller lay things over it (sizes given in PDF points). */
export default function FirstPagePreview(props: { file: File; children: (g: { W: number; H: number; scale: number }) => ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = useState<{ W: number; H: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let close: (() => Promise<void>) | null = null;
    setGeo(null);
    setFailed(false);
    (async () => {
      try {
        const opened = await openPdf(new Uint8Array(await props.file.arrayBuffer()));
        close = opened.close;
        const p = await opened.doc.getPage(1);
        const base = p.getViewport({ scale: 1 });
        if (!live) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = p.getViewport({ scale: (WIDTH * dpr) / base.width });
        const c = ref.current!;
        c.width = Math.ceil(vp.width);
        c.height = Math.ceil(vp.height);
        await p.render({ canvas: c, viewport: vp, background: '#ffffff' }).promise;
        if (live) setGeo({ W: base.width, H: base.height });
      } catch {
        if (live) setFailed(true);
      } finally {
        await close?.().catch(() => {});
      }
    })();
    return () => { live = false; };
  }, [props.file]);

  if (failed) return null;
  const scale = geo ? WIDTH / geo.W : 1;
  return (
    <figure className="preview1">
      <div className="preview1__page" style={{ width: WIDTH, height: geo ? geo.H * scale : WIDTH * 1.41 }}>
        <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true" />
        {geo && <div className="preview1__overlay">{props.children({ W: geo.W, H: geo.H, scale })}</div>}
      </div>
      <figcaption className="field__help">Preview of the first page</figcaption>
    </figure>
  );
}
