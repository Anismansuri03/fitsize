// Page numbers and watermarks: text or pictures drawn on top of every (or some) pages.
// Positions are worked out on the page AS DISPLAYED, then mapped to PDF space, so rotated pages come out right.
import type { PDFDocument, PDFPage } from 'pdf-lib';
import { displaySize, normRot, toUser } from '../editor/placement.ts';
import type { PageBox, Rot } from '../editor/placement.ts';
import { canEncodeWinAnsi } from '../editor/winAnsi.ts';

export type NumberPosition = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';
export type NumberFormat = 'n' | 'page-n' | 'n-of-total' | 'page-n-of-total';

export function labelFor(format: NumberFormat, n: number, total: number): string {
  switch (format) {
    case 'n': return `${n}`;
    case 'page-n': return `Page ${n}`;
    case 'n-of-total': return `${n} of ${total}`;
    case 'page-n-of-total': return `Page ${n} of ${total}`;
  }
}

/** Baseline-left corner of a line of text, measured on the displayed page (u right, v down). */
export function numberPlacement(pos: NumberPosition, W: number, H: number, textW: number, size: number, margin: number) {
  const u = pos.endsWith('l') ? margin : pos.endsWith('r') ? W - margin - textW : (W - textW) / 2;
  const v = pos.startsWith('t') ? margin + size * 0.8 : H - margin - size * 0.22;
  return { u, v };
}

/** Bottom-left corner of a w x h box that is centred on (cx, cy) and turned `deg` degrees anticlockwise. */
export function centredOrigin(cx: number, cy: number, w: number, h: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  const d = [Math.cos(a), -Math.sin(a)]; // along the text, on screen (v points down)
  const up = [-Math.sin(a), -Math.cos(a)];
  return { u: cx - d[0] * (w / 2) - up[0] * (h / 2), v: cy - d[1] * (w / 2) - up[1] * (h / 2) };
}

const hexToRgb = (c: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c) ?? [];
  return { r: parseInt(m[1] ?? '0', 16) / 255, g: parseInt(m[2] ?? '0', 16) / 255, b: parseInt(m[3] ?? '0', 16) / 255 };
};

async function openForEditing(bytes: Uint8Array): Promise<PDFDocument> {
  const { PDFDocument } = await import('pdf-lib');
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (/encrypted/i.test(String((e as Error)?.message))) throw new Error('This PDF is protected with a password. Use “Unlock PDF” first, then try again.');
    throw new Error('We couldn’t read this PDF. It may be damaged. Try “Repair PDF” first.');
  }
}

function geometry(page: PDFPage) {
  const rot = normRot(page.getRotation().angle) as Rot;
  const cb = page.getCropBox();
  const box: PageBox = { x0: cb.x, y0: cb.y, w0: cb.width, h0: cb.height };
  return { rot, box, ...displaySize(box, rot) };
}

export interface NumberOptions {
  position: NumberPosition;
  format: NumberFormat;
  start: number;
  /** First page (1-based) that gets a number; earlier pages are skipped (e.g. a cover). */
  from: number;
  size: number;
  color: string;
  margin: number;
}

export async function addPageNumbers(bytes: Uint8Array, o: NumberOptions, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const { StandardFonts, degrees, rgb } = await import('pdf-lib');
  const doc = await openForEditing(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const c = hexToRgb(o.color);
  const pages = doc.getPages();
  const numbered = Math.max(0, pages.length - (o.from - 1));
  const total = o.start + numbered - 1;
  pages.forEach((page, i) => {
    onProgress?.(i / pages.length);
    if (i + 1 < o.from) return;
    const label = labelFor(o.format, o.start + (i + 1 - o.from), total);
    const g = geometry(page);
    const tw = font.widthOfTextAtSize(label, o.size);
    const at = numberPlacement(o.position, g.w, g.h, tw, o.size, o.margin);
    const p = toUser(g.box, g.rot, at.u, at.v);
    page.drawText(label, { x: p.x, y: p.y, size: o.size, font, color: rgb(c.r, c.g, c.b), rotate: degrees(g.rot) });
  });
  return doc.save({ useObjectStreams: true });
}

export interface WatermarkOptions {
  text?: string;
  image?: { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; ratio: number };
  /** How big, as a share of the page (0.2 - 0.9). */
  scale: number;
  opacity: number;
  diagonal: boolean;
  color: string;
  /** 1-based pages to mark; empty or undefined = all. */
  pages?: number[];
}

export async function addWatermark(bytes: Uint8Array, o: WatermarkOptions, onProgress?: (f: number) => void): Promise<Uint8Array> {
  const { StandardFonts, degrees, rgb } = await import('pdf-lib');
  const doc = await openForEditing(bytes);
  const c = hexToRgb(o.color);
  const only = o.pages?.length ? new Set(o.pages) : null;
  const angle = o.diagonal ? 45 : 0;

  // Prepare what we draw once.
  let textFont: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;
  let img: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  let ratio = 1;
  const text = (o.text ?? '').trim();

  if (o.image) {
    img = o.image.mime === 'image/png' ? await doc.embedPng(o.image.bytes) : await doc.embedJpg(o.image.bytes);
    ratio = o.image.ratio;
  } else if (text) {
    if (canEncodeWinAnsi(text)) textFont = await doc.embedFont(StandardFonts.HelveticaBold);
    else {
      const { measureText, textToPng } = await import('../editor/canvasPaint.ts');
      const t = { id: 't', pageId: 'p', type: 'text' as const, x: 0, y: 0, text, size: 100, color: o.color, font: 'sans' as const, bold: true, italic: false, ...measureText({ text, size: 100, font: 'sans', bold: true, italic: false }) };
      const png = await textToPng(t, 2);
      img = await doc.embedPng(png.bytes);
      ratio = (t.h + png.pad * 2) / (t.w + png.pad * 2);
    }
  } else {
    throw new Error('Type the watermark text, or choose a picture.');
  }

  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    onProgress?.(i / pages.length);
    if (only && !only.has(i + 1)) continue;
    const page = pages[i];
    const g = geometry(page);
    const target = o.scale * (o.diagonal ? Math.hypot(g.w, g.h) * 0.75 : g.w);
    const spin = g.rot + angle; // pdf-lib turns content anticlockwise, like `angle`
    if (img) {
      const w = Math.min(target, g.w * 0.95);
      const h = w * ratio;
      const at = centredOrigin(g.w / 2, g.h / 2, w, h, angle);
      const p = toUser(g.box, g.rot, at.u, at.v);
      page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(spin), opacity: o.opacity });
    } else if (textFont) {
      const size = Math.max(10, Math.min(300, target / textFont.widthOfTextAtSize(text, 1)));
      const w = textFont.widthOfTextAtSize(text, size);
      const cap = size * 0.72;
      const at = centredOrigin(g.w / 2, g.h / 2, w, cap, angle);
      const p = toUser(g.box, g.rot, at.u, at.v);
      page.drawText(text, { x: p.x, y: p.y, size, font: textFont, color: rgb(c.r, c.g, c.b), rotate: degrees(spin), opacity: o.opacity });
    }
  }
  return doc.save({ useObjectStreams: true });
}
