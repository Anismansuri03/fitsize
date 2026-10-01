// Last resort for text-heavy PDFs that cannot reach the size any other way:
// turn every page into a picture and rebuild the PDF from those pictures.
// Text is no longer selectable afterwards, so this is always opt-in.
import { fitToSize } from '../fit/fitToSize';
import type { FitEncoder } from '../fit/fitToSize';
import type { ProgressInfo } from '../worker-rpc';
import { openPdf } from './pdfjs';

interface PageImage {
  blob: Blob;
  widthPx: number;
  heightPx: number;
  widthPt: number;
  heightPt: number;
}

const BASE_DPI = 130;

function toJpeg(canvas: HTMLCanvasElement, quality01: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create a picture of a page.'))), 'image/jpeg', quality01),
  );
}

export interface RasterResult {
  bytes: Uint8Array;
  size: number;
  fits: boolean;
  pages: number;
}

export async function rasterizeToSize(
  file: File,
  targetBytes: number,
  o: { signal?: AbortSignal; onProgress?: (p: ProgressInfo) => void },
): Promise<RasterResult> {
  const { PDFDocument } = await import('pdf-lib');
  const { doc: pdf, close } = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const pages: PageImage[] = [];

  // 1) Take one good picture of every page.
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      o.onProgress?.({ progress: (i - 1) / pdf.numPages / 2, note: `Taking a picture of page ${i} of ${pdf.numPages}…` });
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      let scale = BASE_DPI / 72;
      while (base.width * scale * base.height * scale > 12_000_000) scale *= 0.9;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
      pages.push({
        blob: await toJpeg(canvas, 0.9),
        widthPx: canvas.width,
        heightPx: canvas.height,
        widthPt: base.width,
        heightPt: base.height,
      });
      canvas.width = canvas.height = 0; // free memory
      page.cleanup();
    }
  } finally {
    await close();
  }

  // 2) Search for the best quality / size that fits.
  const totalPx = pages.reduce((n, p) => n + p.widthPx * p.heightPx, 0);
  const encoder: FitEncoder = {
    width: Math.round(Math.sqrt(totalPx)),
    height: Math.round(Math.sqrt(totalPx)),
    hasQuality: true,
    async encode(scale, quality) {
      const doc = await PDFDocument.create();
      for (const p of pages) {
        const bmp = await createImageBitmap(p.blob);
        const w = Math.max(1, Math.round(p.widthPx * scale));
        const h = Math.max(1, Math.round(p.heightPx * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        const jpg = new Uint8Array(await (await toJpeg(c, quality / 100)).arrayBuffer());
        const img = await doc.embedJpg(jpg);
        doc.addPage([p.widthPt, p.heightPt]).drawImage(img, { x: 0, y: 0, width: p.widthPt, height: p.heightPt });
        c.width = c.height = 0;
      }
      return doc.save({ useObjectStreams: true });
    },
  };

  const r = await fitToSize(encoder, {
    targetBytes,
    minQuality: 35,
    maxQuality: 85,
    minScale: 0.3,
    signal: o.signal,
    onAttempt: ({ attempt }) =>
      o.onProgress?.({ progress: 0.5 + Math.min(0.45, attempt / 24), note: 'Finding the best quality that fits…' }),
  });
  return { bytes: r.bytes, size: r.size, fits: r.fits, pages: pages.length };
}
