import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeBox, clampToPage, pointsBBox, thin, arrowPaths } from '../../src/lib/editor/geometry.ts';

const R = { x: 100, y: 100, w: 200, h: 100 };

test('resize: the corner opposite the handle never moves', () => {
  const se = resizeBox(R, 'se', 40, 10, false);
  assert.deepEqual(se, { x: 100, y: 100, w: 240, h: 110 });
  const nw = resizeBox(R, 'nw', -30, -20, false);
  assert.deepEqual(nw, { x: 70, y: 80, w: 230, h: 120 });
  assert.equal(nw.x + nw.w, 300); // right edge fixed
  assert.equal(nw.y + nw.h, 200); // bottom edge fixed
});

test('resize: aspect lock keeps the shape and anchors the far corner', () => {
  for (const h of ['nw', 'ne', 'sw', 'se'] as const) {
    const r = resizeBox(R, h, h.includes('e') ? 60 : -60, h.includes('s') ? 5 : -5, true);
    assert.ok(Math.abs(r.w / r.h - 2) < 1e-9, h);
    if (h.includes('w')) assert.ok(Math.abs(r.x + r.w - 300) < 1e-9);
    else assert.equal(r.x, 100);
    if (h.includes('n')) assert.ok(Math.abs(r.y + r.h - 200) < 1e-9);
    else assert.equal(r.y, 100);
  }
});

test('resize: never collapses below the minimum size, even when dragged past the opposite corner', () => {
  const r = resizeBox(R, 'se', -500, -500, false);
  assert.ok(r.w >= 6 && r.h >= 6);
  const l = resizeBox(R, 'se', -500, -500, true);
  assert.ok(l.w >= 6 && l.h >= 6 && Math.abs(l.w / l.h - 2) < 1e-9);
});

test('clamp: boxes stay on the page; oversize boxes pin to the top-left', () => {
  assert.deepEqual(clampToPage({ x: -20, y: 900, w: 100, h: 50 }, 595, 842), { x: 0, y: 792, w: 100, h: 50 });
  assert.deepEqual(clampToPage({ x: 50, y: 50, w: 700, h: 50 }, 595, 842), { x: 0, y: 50, w: 700, h: 50 });
});

test('freehand: bbox and thinning keep the first and last point', () => {
  const pts: [number, number][] = [[0, 0], [0.1, 0.1], [0.2, 0.2], [5, 5], [5.1, 5.1], [10, 10]];
  const t = thin(pts, 1);
  assert.deepEqual(t[0], [0, 0]);
  assert.deepEqual(t[t.length - 1], [10, 10]);
  assert.ok(t.length < pts.length);
  assert.deepEqual(pointsBBox([t]), { x: 0, y: 0, w: 10, h: 10 });
});

test('arrow: shaft ends where the head starts, and the head points back along the shaft', () => {
  const [shaft, a, b] = arrowPaths([0, 0], [100, 0], 3);
  assert.deepEqual(shaft, [[0, 0], [100, 0]]);
  assert.deepEqual(a[0], [100, 0]);
  assert.deepEqual(b[0], [100, 0]);
  assert.ok(a[1][0] < 100 && b[1][0] < 100, 'head strokes lie behind the tip');
  assert.ok(a[1][1] * b[1][1] < 0, 'one stroke each side of the shaft');
});
