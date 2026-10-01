// Maps a point on the page as the person SEES it (u right, v down, in points) to PDF page space
// (x right, y up, from the page's bottom-left), for a page with a given total /Rotate.
// This is the piece that keeps a saved PDF identical to the screen on rotated pages.

export interface PageBox {
  x0: number;
  y0: number;
  /** Width and height of the page box BEFORE rotation. */
  w0: number;
  h0: number;
}

export type Rot = 0 | 90 | 180 | 270;

export function normRot(deg: number): Rot {
  return ((((Math.round(deg / 90) * 90) % 360) + 360) % 360) as Rot;
}

export function displaySize(box: PageBox, rot: Rot) {
  return rot % 180 === 0 ? { w: box.w0, h: box.h0 } : { w: box.h0, h: box.w0 };
}

export function toUser(box: PageBox, rot: Rot, u: number, v: number): { x: number; y: number } {
  switch (rot) {
    case 0:
      return { x: box.x0 + u, y: box.y0 + box.h0 - v };
    case 90:
      return { x: box.x0 + v, y: box.y0 + u };
    case 180:
      return { x: box.x0 + box.w0 - u, y: box.y0 + v };
    case 270:
      return { x: box.x0 + box.w0 - v, y: box.y0 + box.h0 - u };
  }
}

/** The inverse of toUser (used by tests). */
export function toDisplay(box: PageBox, rot: Rot, x: number, y: number): { u: number; v: number } {
  const X = x - box.x0;
  const Y = y - box.y0;
  switch (rot) {
    case 0:
      return { u: X, v: box.h0 - Y };
    case 90:
      return { u: Y, v: X };
    case 180:
      return { u: box.w0 - X, v: Y };
    case 270:
      return { u: box.h0 - Y, v: box.w0 - X };
  }
}

/** Where the baseline of each text line sits, measured down from the top of the text box. */
export function lineBaselines(lineCount: number, size: number, ascentEm: number, descentEm: number) {
  const lineHeight = size * 1.2;
  const content = (ascentEm + descentEm) * size;
  const first = (lineHeight - content) / 2 + ascentEm * size;
  return Array.from({ length: lineCount }, (_, i) => i * lineHeight + first);
}

export const LINE_HEIGHT = 1.2;
