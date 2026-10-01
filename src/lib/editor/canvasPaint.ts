// Draws annotations onto a canvas (1 unit = 1 point, origin = top-left of the displayed page).
// Used to burn redactions into a page, and to turn text the built-in PDF fonts cannot draw into a picture.
import type { Annot, FontKey, TextAnn } from './types';
import { LINE_HEIGHT, lineBaselines } from './placement';

export const FONT_STACK: Record<FontKey, string> = {
  sans: 'Helvetica, Arial, "Liberation Sans", "Noto Sans", "Noto Sans Devanagari", sans-serif',
  serif: '"Times New Roman", Times, "Liberation Serif", "Noto Serif", "Noto Serif Devanagari", serif',
  mono: '"Courier New", Courier, "Liberation Mono", "Noto Sans Mono", monospace',
  inter: '"Fitsize Inter", sans-serif',
  roboto: '"Fitsize Roboto", sans-serif',
  poppins: '"Fitsize Poppins", sans-serif',
  playfair: '"Fitsize Playfair", serif',
  merriweather: '"Fitsize Merriweather", serif',
  caveat: '"Fitsize Caveat", cursive',
};

type FontProps = Pick<TextAnn, 'font' | 'bold' | 'italic'>;

export const fontCss = (a: FontProps, size: number) => `${a.italic ? 'italic ' : ''}${a.bold ? '700' : '400'} ${size}px ${FONT_STACK[a.font]}`;

let scratch: CanvasRenderingContext2D | null = null;
const scratchCtx = () => (scratch ??= document.createElement('canvas').getContext('2d')!);

/** Ascent and descent of the font as browsers lay it out, as fractions of the font size. */
export function fontMetrics(a: FontProps): { ascent: number; descent: number } {
  const ctx = scratchCtx();
  ctx.font = fontCss(a, 100);
  const m = ctx.measureText('Hg');
  const asc = (m as TextMetrics).fontBoundingBoxAscent;
  const desc = (m as TextMetrics).fontBoundingBoxDescent;
  if (typeof asc === 'number' && typeof desc === 'number' && asc + desc > 0) return { ascent: asc / 100, descent: desc / 100 };
  return { ascent: 0.905, descent: 0.212 };
}

export function measureText(a: FontProps & { text: string; size: number }): { w: number; h: number } {
  const ctx = scratchCtx();
  ctx.font = fontCss(a, a.size);
  const lines = a.text.split('\n');
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
  return { w: Math.max(w, a.size * 0.5), h: lines.length * a.size * LINE_HEIGHT };
}

export function paintText(ctx: CanvasRenderingContext2D, a: TextAnn) {
  const { ascent, descent } = fontMetrics(a);
  const lines = a.text.split('\n');
  const base = lineBaselines(lines.length, a.size, ascent, descent);
  ctx.save();
  ctx.font = fontCss(a, a.size);
  ctx.fillStyle = a.color;
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => ctx.fillText(line, a.x, a.y + base[i]));
  ctx.restore();
}

export type ImageMap = Map<string, ImageBitmap>;

export async function decodeImages(annots: Annot[]): Promise<ImageMap> {
  const map: ImageMap = new Map();
  for (const a of annots) {
    if (a.type === 'image') map.set(a.id, await createImageBitmap(new Blob([a.bytes as BlobPart], { type: a.mime })));
  }
  return map;
}

export function paintAnnotation(ctx: CanvasRenderingContext2D, a: Annot, images: ImageMap) {
  ctx.save();
  switch (a.type) {
    case 'text':
      paintText(ctx, a);
      break;
    case 'image': {
      const bmp = images.get(a.id);
      if (bmp) ctx.drawImage(bmp, a.x, a.y, a.w, a.h);
      break;
    }
    case 'box': {
      ctx.globalAlpha = a.opacity;
      const inset = a.stroke ? a.strokeWidth / 2 : 0;
      const x = a.x + inset, y = a.y + inset, w = a.w - inset * 2, h = a.h - inset * 2;
      ctx.beginPath();
      if (a.variant === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      else ctx.rect(x, y, w, h);
      if (a.fill) {
        ctx.fillStyle = a.fill;
        ctx.fill();
      }
      if (a.stroke && a.strokeWidth > 0) {
        ctx.strokeStyle = a.stroke;
        ctx.lineWidth = a.strokeWidth;
        ctx.stroke();
      }
      break;
    }
    case 'vector': {
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = a.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const sx = a.w / a.w0, sy = a.h / a.h0;
      for (const path of a.paths) {
        if (path.length === 1) {
          ctx.beginPath();
          ctx.arc(a.x + path[0][0] * sx, a.y + path[0][1] * sy, a.width / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.beginPath();
        path.forEach(([px, py], i) => (i ? ctx.lineTo(a.x + px * sx, a.y + py * sy) : ctx.moveTo(a.x + px * sx, a.y + py * sy)));
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

/** Text as a transparent PNG (for scripts the built-in PDF fonts cannot draw). */
export async function textToPng(a: TextAnn, pxPerPoint = 4): Promise<{ bytes: Uint8Array; pad: number }> {
  const pad = Math.ceil(a.size * 0.25);
  const c = document.createElement('canvas');
  c.width = Math.ceil((a.w + pad * 2) * pxPerPoint);
  c.height = Math.ceil((a.h + pad * 2) * pxPerPoint);
  const ctx = c.getContext('2d')!;
  ctx.scale(pxPerPoint, pxPerPoint);
  ctx.translate(pad - a.x, pad - a.y);
  paintText(ctx, a);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the text.'))), 'image/png'));
  c.width = c.height = 0;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), pad };
}
