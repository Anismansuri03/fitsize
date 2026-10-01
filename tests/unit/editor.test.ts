import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toUser, toDisplay, displaySize, normRot, lineBaselines } from '../../src/lib/editor/placement.ts';
import type { PageBox, Rot } from '../../src/lib/editor/placement.ts';
import { canEncodeWinAnsi, cleanForPdf } from '../../src/lib/editor/winAnsi.ts';
import { emptyHistory, historyReducer, MAX_STEPS } from '../../src/lib/editor/history.ts';
import type { History } from '../../src/lib/editor/history.ts';
import type { Doc } from '../../src/lib/editor/types.ts';

const A4: PageBox = { x0: 0, y0: 0, w0: 595, h0: 842 };
const OFFSET: PageBox = { x0: 12, y0: 30, w0: 300, h0: 500 }; // page whose box does not start at 0,0
const ROTS: Rot[] = [0, 90, 180, 270];

test('placement: the four corners of the DISPLAYED page land on the right corners of the page', () => {
  // With no rotation the top-left of the screen is the top-left of the PDF page: (0, h0).
  assert.deepEqual(toUser(A4, 0, 0, 0), { x: 0, y: 842 });
  assert.deepEqual(toUser(A4, 0, 595, 842), { x: 595, y: 0 });
  // Rotated 90 clockwise: what you see at top-left is the PDF's bottom-left corner.
  assert.deepEqual(toUser(A4, 90, 0, 0), { x: 0, y: 0 });
  // Rotated 180: top-left on screen is the PDF's bottom-right.
  assert.deepEqual(toUser(A4, 180, 0, 0), { x: 595, y: 0 });
  // Rotated 270: top-left on screen is the PDF's top-right.
  assert.deepEqual(toUser(A4, 270, 0, 0), { x: 595, y: 842 });
});

test('placement: toUser and toDisplay are exact inverses for every rotation and box origin', () => {
  for (const box of [A4, OFFSET]) {
    for (const rot of ROTS) {
      const { w, h } = displaySize(box, rot);
      for (const [u, v] of [[0, 0], [w, h], [w / 3, h / 7], [w - 1, 1], [12.5, 99.25]]) {
        const p = toUser(box, rot, u, v);
        const back = toDisplay(box, rot, p.x, p.y);
        assert.ok(Math.abs(back.u - u) < 1e-9 && Math.abs(back.v - v) < 1e-9, `rot ${rot} (${u},${v})`);
        // and it stays inside the page box
        assert.ok(p.x >= box.x0 - 1e-9 && p.x <= box.x0 + box.w0 + 1e-9);
        assert.ok(p.y >= box.y0 - 1e-9 && p.y <= box.y0 + box.h0 + 1e-9);
      }
    }
  }
});

test('placement: moving RIGHT on screen always moves along the direction pdf-lib rotates its text baseline', () => {
  // pdf-lib rotates content counter-clockwise by `rot` degrees. A step to the right on screen must equal
  // the vector (cos rot, sin rot) in PDF space.
  for (const rot of ROTS) {
    const a = toUser(A4, rot, 100, 100);
    const b = toUser(A4, rot, 101, 100);
    const rad = (rot * Math.PI) / 180;
    assert.ok(Math.abs(b.x - a.x - Math.round(Math.cos(rad))) < 1e-9, `x for ${rot}`);
    assert.ok(Math.abs(b.y - a.y - Math.round(Math.sin(rad))) < 1e-9, `y for ${rot}`);
  }
});

test('placement: normRot wraps any multiple of 90', () => {
  assert.equal(normRot(-90), 270);
  assert.equal(normRot(450), 90);
  assert.equal(normRot(0), 0);
  assert.equal(normRot(360), 0);
});

test('placement: text baselines are evenly spaced by 1.2 x size and start inside the first line', () => {
  const b = lineBaselines(3, 20, 0.905, 0.212);
  assert.equal(b.length, 3);
  assert.ok(Math.abs(b[1] - b[0] - 24) < 1e-9 && Math.abs(b[2] - b[1] - 24) < 1e-9);
  assert.ok(b[0] > 0 && b[0] < 24, 'first baseline sits within the first 24pt line');
});

test('winAnsi: normal Western text is real text, other scripts fall back to a picture', () => {
  assert.equal(canEncodeWinAnsi('Hello, World! 123 (John Smith)'), true);
  assert.equal(canEncodeWinAnsi('Café déjà vu – “quoted” €50 ©'), true);
  assert.equal(canEncodeWinAnsi('Line one\nLine two'), true);
  assert.equal(canEncodeWinAnsi('₹ 500'), false);
  assert.equal(canEncodeWinAnsi('नमस्ते'), false);
  assert.equal(canEncodeWinAnsi('Total: 5 ✓'), false);
  assert.equal(canEncodeWinAnsi('😀'), false);
  assert.equal(cleanForPdf('a\tb\r\nc'), 'a    b\nc');
});

const doc = (n: number): Doc => ({ pages: [], annots: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, pageId: 'p', type: 'box', variant: 'rect', x: 0, y: 0, w: 1, h: 1, stroke: '#000', fill: null, strokeWidth: 1, opacity: 1 }) as const) });
const run = (h: History, ...a: Parameters<typeof historyReducer>[1][]) => a.reduce(historyReducer, h);

test('history: do / undo / redo, and a new change clears the redo stack', () => {
  let h = emptyHistory(doc(0));
  h = run(h, { type: 'do', fn: () => doc(1) }, { type: 'do', fn: () => doc(2) });
  assert.equal(h.present.annots.length, 2);
  h = run(h, { type: 'undo' });
  assert.equal(h.present.annots.length, 1);
  h = run(h, { type: 'redo' });
  assert.equal(h.present.annots.length, 2);
  h = run(h, { type: 'undo' }, { type: 'do', fn: () => doc(5) });
  assert.equal(h.future.length, 0, 'redo cleared');
  assert.equal(h.past.length, 2);
});

test('history: a whole drag is ONE undo step, and a no-op change adds nothing', () => {
  let h = emptyHistory(doc(1));
  h = run(h, { type: 'gestureStart' });
  for (let i = 0; i < 50; i++) h = run(h, { type: 'live', fn: (d) => ({ ...d, annots: d.annots.map((a) => ({ ...a, x: i })) }) });
  h = run(h, { type: 'gestureEnd' });
  assert.equal(h.past.length, 1, 'one step for 50 moves');
  assert.equal(h.present.annots[0].x, 49);
  h = run(h, { type: 'undo' });
  assert.equal(h.present.annots[0].x, 0, 'undo puts it back where it started');
  const same = run(h, { type: 'do', fn: (d) => d });
  assert.equal(same, h, 'unchanged document creates no step');
  const untouched = run(h, { type: 'gestureStart' }, { type: 'gestureEnd' });
  assert.equal(untouched.past.length, h.past.length, 'gesture with no change adds no step');
});

test('history: cancelling a gesture restores the document with no trace (e.g. an empty text box)', () => {
  let h = emptyHistory(doc(1));
  h = run(h, { type: 'gestureStart' }, { type: 'live', fn: () => doc(2) }, { type: 'gestureCancel' });
  assert.equal(h.present.annots.length, 1);
  assert.equal(h.past.length, 0);
  assert.equal(h.gesture, null);
});

test('history: keeps at most MAX_STEPS undo steps', () => {
  let h = emptyHistory(doc(0));
  for (let i = 1; i <= MAX_STEPS + 40; i++) h = run(h, { type: 'do', fn: () => doc(i) });
  assert.equal(h.past.length, MAX_STEPS);
  for (let i = 0; i < MAX_STEPS + 10; i++) h = run(h, { type: 'undo' });
  assert.equal(h.past.length, 0);
});
