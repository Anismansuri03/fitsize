import { openPdf } from '../pdf/pdfjs';
import type { ProgressInfo } from '../worker-rpc';

/** Pull the words out of a PDF, page by page, keeping lines and spaces sensible. */
export async function extractText(file: File, o: { signal?: AbortSignal; onProgress?: (p: ProgressInfo) => void } = {}): Promise<{ text: string; pages: number; empty: boolean }> {
  const { doc, close } = await openPdf(new Uint8Array(await file.arrayBuffer()));
  try {
    const parts: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      o.onProgress?.({ progress: (i - 1) / doc.numPages, note: `Reading page ${i} of ${doc.numPages}…` });
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let out = '';
      let prev: { x: number; y: number; w: number; h: number; str: string } | null = null;
      for (const it of content.items) {
        if (!('str' in it)) continue;
        const cur = { x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || 10, str: it.str };
        if (prev) {
          if (Math.abs(cur.y - prev.y) > prev.h * 0.6) out += '\n';
          else if (cur.x - (prev.x + prev.w) > prev.h * 0.15 && !/\s$/.test(prev.str) && !/^\s/.test(cur.str)) out += ' ';
        }
        out += cur.str;
        if (it.hasEOL) out += '\n';
        prev = cur;
      }
      parts.push(out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
      page.cleanup();
    }
    const text = parts.join('\n\n');
    return { text, pages: doc.numPages, empty: text.replace(/\s/g, '').length === 0 };
  } finally {
    await close();
  }
}
