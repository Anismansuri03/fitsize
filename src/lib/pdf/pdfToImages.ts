import type { ProgressInfo } from '../worker-rpc';
import { openPdf } from './pdfjs';

export interface RenderedPage {
  pageNumber: number;
  blob: Blob;
  width: number;
  height: number;
}

export async function countPages(file: File): Promise<number> {
  const { doc, close } = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const n = doc.numPages;
  await close();
  return n;
}

/** Render the chosen pages of a PDF as PNG or JPG pictures. */
export async function renderPdfPages(
  file: File,
  o: {
    pages: number[];
    dpi: number;
    format: 'png' | 'jpeg';
    quality: number;
    signal?: AbortSignal;
    onProgress?: (p: ProgressInfo) => void;
    onPage?: (page: RenderedPage) => void;
  },
): Promise<RenderedPage[]> {
  const { doc: pdf, close } = await openPdf(new Uint8Array(await file.arrayBuffer()));
  const out: RenderedPage[] = [];
  try {
    for (let n = 0; n < o.pages.length; n++) {
      if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const pageNumber = o.pages[n];
      o.onProgress?.({ progress: n / o.pages.length, note: `Page ${pageNumber} (${n + 1} of ${o.pages.length})…` });
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      let scale = o.dpi / 72;
      // Browsers cap canvas size (~16 million pixels on phones); stay under it.
      while (base.width * scale * base.height * scale > 16_000_000) scale *= 0.9;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      await page.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error(`Page ${pageNumber} is too large to turn into a picture on this device.`))),
          o.format === 'png' ? 'image/png' : 'image/jpeg',
          o.quality / 100,
        ),
      );
      const rendered = { pageNumber, blob, width: canvas.width, height: canvas.height };
      out.push(rendered);
      o.onPage?.(rendered);
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await close();
  }
  return out;
}
