export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Handle = 'nw' | 'ne' | 'sw' | 'se';
export type Pt = [number, number];

/** Drag a corner handle. The opposite corner stays put. */
export function resizeBox(o: Rect, handle: Handle, dx: number, dy: number, lockAspect: boolean, min = 6): Rect {
  let w = handle.includes('e') ? o.w + dx : o.w - dx;
  let h = handle.includes('s') ? o.h + dy : o.h - dy;
  if (lockAspect) {
    const sw = w / o.w;
    const sh = h / o.h;
    const s = Math.abs(sw - 1) > Math.abs(sh - 1) ? sw : sh;
    const floor = Math.max(min / o.w, min / o.h);
    const k = Math.max(s, floor);
    w = o.w * k;
    h = o.h * k;
  } else {
    w = Math.max(min, w);
    h = Math.max(min, h);
  }
  return {
    x: handle.includes('w') ? o.x + o.w - w : o.x,
    y: handle.includes('n') ? o.y + o.h - h : o.y,
    w,
    h,
  };
}

/** Keep a box on its page (or as much of it as fits). */
export function clampToPage(r: Rect, pw: number, ph: number): Rect {
  const x = r.w >= pw ? 0 : Math.min(Math.max(0, r.x), pw - r.w);
  const y = r.h >= ph ? 0 : Math.min(Math.max(0, r.y), ph - r.h);
  return { ...r, x, y };
}

export function pointsBBox(paths: Pt[][]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const [x, y] of p) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Drop points that are closer than `minDist` to the previous kept point (keeps the last one). */
export function thin(pts: Pt[], minDist = 0.8): Pt[] {
  if (pts.length < 3) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = out[out.length - 1];
    if (Math.hypot(pts[i][0] - px, pts[i][1] - py) >= minDist) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Shaft plus two short strokes that form the arrow head, all in page coordinates. */
export function arrowPaths(start: Pt, end: Pt, width: number): Pt[][] {
  const a = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const len = 9 + width * 2.5;
  const spread = 0.5;
  const wing = (s: number): Pt => [end[0] - len * Math.cos(a + s), end[1] - len * Math.sin(a + s)];
  return [[start, end], [end, wing(spread)], [end, wing(-spread)]];
}

/** Ticks and crosses, in a 20 x 20 box. */
export const MARK_PATHS: Record<'check' | 'cross', Pt[][]> = {
  check: [[[3, 11], [8, 16], [17, 4]]],
  cross: [[[4, 4], [16, 16]], [[16, 4], [4, 16]]],
};
