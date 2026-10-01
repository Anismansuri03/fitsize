// Writes the edited document as a new PDF.
//  - Normal pages are copied from their source PDF, then marks are drawn on top as real PDF objects
//    (text stays selectable).
//  - Pages with a redaction are rebuilt from a picture with EVERYTHING burned in, so nothing hidden
//    can be recovered.
//  - Deleted pages are simply never copied, so their content is not in the file.
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PDFDocument, PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import type { Annot, BoxAnn, Doc, ImageAnn, PageRef, TextAnn, VectorAnn } from './types';
import { pageSize } from './types';
import { lineBaselines, normRot, toUser } from './placement';
import type { PageBox, Rot } from './placement';
import { canEncodeWinAnsi, cleanForPdf } from './winAnsi';
import { ensureFontReady, fontFileFor, isGoogleFont } from './googleFonts';
import { decodeImages, fontMetrics, paintAnnotation, textToPng } from './canvasPaint';

export interface ExportSource {
  bytes: Uint8Array;
  pdfjs: PDFDocumentProxy | null;
}
export interface ExportOptions {
  onProgress?: (fraction: number, note: string) => void;
  signal?: AbortSignal;
}

const FLATTEN_DPI = 200;

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c) ?? [];
  return { r: parseInt(m[1] ?? '0', 16) / 255, g: parseInt(m[2] ?? '0', 16) / 255, b: parseInt(m[3] ?? '0', 16) / 255 };
};

// Google Font .woff files are small, so fetch and cache the bytes for the whole export.
const woffCache = new Map<string, Promise<Uint8Array>>();
async function woffBytes(path: string): Promise<Uint8Array> {
  let p = woffCache.get(path);
  if (!p) {
    p = fetch(path).then((r) => {
      if (!r.ok) throw new Error('Could not load a font used in this PDF.');
      return r.arrayBuffer();
    }).then((b) => new Uint8Array(b));
    woffCache.set(path, p);
  }
  return p;
}

const fontName = (a: TextAnn) => {
  const set = a.font === 'serif'
    ? ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic']
    : a.font === 'mono'
      ? ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique']
      : ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'];
  return set[(a.bold ? 1 : 0) + (a.italic ? 2 : 0)];
};

function abortIf(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
}

async function renderFlat(page: PageRef, src: ExportSource | undefined, annots: Annot[]): Promise<{ jpeg: Uint8Array; w: number; h: number }> {
  const { w, h } = pageSize(page);
  let scale = FLATTEN_DPI / 72;
  while (w * scale * h * scale > 16_000_000) scale *= 0.9;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (page.src >= 0 && src?.pdfjs) {
    const p = await src.pdfjs.getPage(page.index + 1);
    const vp = p.getViewport({ scale, rotation: (page.baseRot + page.rot) % 360 });
    await p.render({ canvas, viewport: vp, background: '#ffffff' }).promise;
    p.cleanup();
  }
  const images = await decodeImages(annots);
  ctx.save();
  ctx.scale(canvas.width / w, canvas.height / h);
  // Redaction boxes go last so they cover everything, including things added by the user.
  for (const a of annots) if (!(a.type === 'box' && a.variant === 'redact')) paintAnnotation(ctx, a, images);
  for (const a of annots) if (a.type === 'box' && a.variant === 'redact') paintAnnotation(ctx, a, images);
  ctx.restore();
  images.forEach((b) => b.close());
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('This page is too large to save on this device.'))), 'image/jpeg', 0.92));
  canvas.width = canvas.height = 0;
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), w, h };
}

export async function exportPdf(doc: Doc, sources: ExportSource[], opts: ExportOptions = {}): Promise<Uint8Array> {
  // Make sure every Google Font actually used is ready in the browser before anything is drawn or
  // flattened to a picture (a redacted page draws text straight onto a <canvas>, so the real
  // letterforms need to be loaded by then, not just fetched later for embedding).
  const wanted = new Set<string>();
  for (const a of doc.annots) if (a.type === 'text' && isGoogleFont(a.font)) wanted.add(`${a.font}|${a.bold}|${a.italic}`);
  await Promise.all([...wanted].map((k) => { const [font, bold, italic] = k.split('|'); return ensureFontReady(font, bold === 'true', italic === 'true'); }));

  const lib = await import('pdf-lib');
  const { PDFDocument, StandardFonts, degrees, rgb, LineCapStyle } = lib;
  const out = await PDFDocument.create();
  out.setProducer('Fitsize');
  out.setCreator('Fitsize');

  const byPage = new Map<string, Annot[]>();
  for (const a of doc.annots) byPage.set(a.pageId, [...(byPage.get(a.pageId) ?? []), a]);
  const flatten = (p: PageRef) => (byPage.get(p.id) ?? []).some((a) => a.type === 'box' && a.variant === 'redact');

  // 1) Copy every normal page from its source in one go per source.
  const srcDocs = new Map<number, PDFDocument>();
  const want = new Map<number, PageRef[]>();
  for (const p of doc.pages) if (p.src >= 0 && !flatten(p)) want.set(p.src, [...(want.get(p.src) ?? []), p]);
  const copied = new Map<string, PDFPage>();
  let step = 0;
  for (const [srcIdx, refs] of want) {
    abortIf(opts.signal);
    opts.onProgress?.(0.05, 'Reading the original…');
    let sd = srcDocs.get(srcIdx);
    if (!sd) {
      try {
        sd = await PDFDocument.load(sources[srcIdx].bytes, { updateMetadata: false });
      } catch {
        throw new Error('We couldn’t save this PDF. It may be damaged or protected.');
      }
      srcDocs.set(srcIdx, sd);
    }
    const pages = await out.copyPages(sd, refs.map((r) => r.index));
    refs.forEach((r, i) => copied.set(r.id, pages[i]));
  }

  // 2) Build the pages in order and draw the marks.
  const fonts = new Map<string, PDFFont>();
  let fontkitReady = false;
  const getFont = async (a: TextAnn) => {
    if (isGoogleFont(a.font)) {
      const path = fontFileFor(a.font, a.bold, a.italic);
      let font = fonts.get(path);
      if (!font) {
        if (!fontkitReady) {
          const fontkit = (await import('@pdf-lib/fontkit')).default;
          out.registerFontkit(fontkit);
          fontkitReady = true;
        }
        font = await out.embedFont(await woffBytes(path), { subset: true });
        fonts.set(path, font);
      }
      return font;
    }
    const n = fontName(a);
    if (!fonts.has(n)) fonts.set(n, await out.embedFont((StandardFonts as Record<string, string>)[n] as never));
    return fonts.get(n)!;
  };
  const imgCache = new Map<Uint8Array, PDFImage>();
  const getImage = async (bytes: Uint8Array, mime: string) => {
    let img = imgCache.get(bytes);
    if (!img) {
      img = mime === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
      imgCache.set(bytes, img);
    }
    return img;
  };

  for (const p of doc.pages) {
    abortIf(opts.signal);
    step++;
    opts.onProgress?.(0.1 + 0.85 * (step / doc.pages.length), `Saving page ${step} of ${doc.pages.length}…`);
    const marks = byPage.get(p.id) ?? [];
    let page: PDFPage;
    let box: PageBox;
    let rot: Rot;

    if (flatten(p)) {
      const flat = await renderFlat(p, sources[p.src], marks);
      page = out.addPage([flat.w, flat.h]);
      const img = await out.embedJpg(flat.jpeg);
      page.drawImage(img, { x: 0, y: 0, width: flat.w, height: flat.h });
      continue; // everything is already burned into the picture
    } else if (p.src < 0) {
      page = out.addPage([p.w, p.h]);
      rot = normRot(p.rot);
      page.setRotation(degrees(rot));
      box = { x0: 0, y0: 0, w0: p.w, h0: p.h };
    } else {
      page = copied.get(p.id)!;
      out.addPage(page);
      rot = normRot(page.getRotation().angle + p.rot);
      page.setRotation(degrees(rot));
      const cb = page.getCropBox();
      box = { x0: cb.x, y0: cb.y, w0: cb.width, h0: cb.height };
    }

    const U = (u: number, v: number) => toUser(box, rot, u, v);
    const spin = degrees(rot);

    for (const a of marks) {
      if (a.type === 'box') drawBox(page, a, U, spin, rgb);
      else if (a.type === 'vector') drawVector(page, a, U, rgb, LineCapStyle.Round);
      else if (a.type === 'image') {
        const o = U(a.x, a.y + a.h);
        page.drawImage(await getImage(a.bytes, a.mime), { x: o.x, y: o.y, width: a.w, height: a.h, rotate: spin });
      } else if (a.type === 'text' && a.text.trim()) {
        const text = cleanForPdf(a.text);
        if (canEncodeWinAnsi(text)) {
          const font = await getFont(a);
          const { ascent, descent } = fontMetrics(a);
          const base = lineBaselines(text.split('\n').length, a.size, ascent, descent);
          const c = hex(a.color);
          text.split('\n').forEach((line, i) => {
            if (!line) return;
            const o = U(a.x, a.y + base[i]);
            page.drawText(line, { x: o.x, y: o.y, size: a.size, font, color: rgb(c.r, c.g, c.b), rotate: spin });
          });
        } else {
          const { bytes, pad } = await textToPng({ ...a, text }, 4);
          const o = U(a.x - pad, a.y + a.h + pad);
          page.drawImage(await getImage(bytes, 'image/png'), { x: o.x, y: o.y, width: a.w + pad * 2, height: a.h + pad * 2, rotate: spin });
        }
      }
    }
  }

  opts.onProgress?.(0.97, 'Finishing…');
  return out.save({ useObjectStreams: true });
}

type UserFn = (u: number, v: number) => { x: number; y: number };

function drawBox(page: PDFPage, a: BoxAnn, U: UserFn, spin: ReturnType<typeof import('pdf-lib').degrees>, rgb: typeof import('pdf-lib').rgb) {
  const inset = a.stroke ? a.strokeWidth / 2 : 0; // the outline sits INSIDE the box, like on screen
  const x = a.x + inset, y = a.y + inset, w = Math.max(1, a.w - inset * 2), h = Math.max(1, a.h - inset * 2);
  const opts: Record<string, unknown> = { rotate: spin, opacity: a.opacity };
  if (a.fill) {
    const c = hex(a.fill);
    opts.color = rgb(c.r, c.g, c.b);
  }
  if (a.stroke && a.strokeWidth > 0) {
    const c = hex(a.stroke);
    opts.borderColor = rgb(c.r, c.g, c.b);
    opts.borderWidth = a.strokeWidth;
    opts.borderOpacity = a.opacity;
  }
  if (!opts.color && !opts.borderColor) return;
  if (a.variant === 'ellipse') {
    const o = U(x + w / 2, y + h / 2);
    page.drawEllipse({ x: o.x, y: o.y, xScale: w / 2, yScale: h / 2, ...opts } as never);
  } else {
    const o = U(x, y + h);
    page.drawRectangle({ x: o.x, y: o.y, width: w, height: h, ...opts } as never);
  }
}

function drawVector(page: PDFPage, a: VectorAnn, U: UserFn, rgb: typeof import('pdf-lib').rgb, cap: import('pdf-lib').LineCapStyle) {
  const c = hex(a.color);
  const color = rgb(c.r, c.g, c.b);
  const sx = a.w / a.w0, sy = a.h / a.h0;
  for (const path of a.paths) {
    const pts = path.map(([px, py]) => U(a.x + px * sx, a.y + py * sy));
    if (pts.length === 1) {
      page.drawEllipse({ x: pts[0].x, y: pts[0].y, xScale: a.width / 2, yScale: a.width / 2, color });
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      page.drawLine({ start: pts[i - 1], end: pts[i], thickness: a.width, color, lineCap: cap });
    }
  }
}
