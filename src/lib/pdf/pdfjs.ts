// Loads pdf.js on demand (it's only needed for PDF -> image and the "pages become
// pictures" fallback), with its fonts and decoders served from /pdfjs/.
import type * as PdfJs from 'pdfjs-dist';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

let cached: Promise<typeof PdfJs> | null = null;

export function loadPdfjs(): Promise<typeof PdfJs> {
  cached ??= (async () => {
    // The "legacy" build carries polyfills, so it also works in browsers a few
    // versions old (the standard build needs very recent JavaScript features).
    const lib = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as typeof PdfJs;
    const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
    lib.GlobalWorkerOptions.workerSrc = worker;
    return lib;
  })();
  return cached;
}

export const pdfjsAssets = {
  cMapUrl: `${BASE}pdfjs/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
  wasmUrl: `${BASE}pdfjs/wasm/`,
  iccUrl: `${BASE}pdfjs/iccs/`,
};

export async function openPdf(bytes: Uint8Array) {
  const lib = await loadPdfjs();
  const task = lib.getDocument({ data: bytes.slice(), ...pdfjsAssets });
  try {
    const doc = await task.promise;
    return { doc, close: () => task.destroy() };
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === 'PasswordException')
      throw new Error('This PDF is protected with a password. Remove the password first, then try again.');
    throw new Error('We couldn’t read this PDF. The file may be damaged.');
  }
}
