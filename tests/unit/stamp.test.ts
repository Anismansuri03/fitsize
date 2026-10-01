import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelFor, numberPlacement, centredOrigin } from '../../src/lib/pdfops/stamp.ts';

test('page number labels', () => {
  assert.equal(labelFor('n', 3, 10), '3');
  assert.equal(labelFor('page-n', 3, 10), 'Page 3');
  assert.equal(labelFor('n-of-total', 3, 10), '3 of 10');
  assert.equal(labelFor('page-n-of-total', 3, 10), 'Page 3 of 10');
});

test('page number positions: left / centre / right and top / bottom, inside the margin', () => {
  const W = 600, H = 800, tw = 50, size = 12, m = 30;
  assert.equal(numberPlacement('bl', W, H, tw, size, m).u, 30);
  assert.equal(numberPlacement('bc', W, H, tw, size, m).u, 275);
  assert.equal(numberPlacement('br', W, H, tw, size, m).u, 520);
  const bottom = numberPlacement('bc', W, H, tw, size, m).v;
  const top = numberPlacement('tc', W, H, tw, size, m).v;
  assert.ok(bottom < H - m && bottom > H - m - size, 'bottom baseline sits just above the bottom margin');
  assert.ok(top > m && top < m + size, 'top baseline sits just below the top margin');
});

test('watermark: a box centred on the page stays centred whatever the angle', () => {
  const W = 600, H = 800, w = 300, h = 60;
  for (const deg of [0, 45, 90, 180]) {
    const o = centredOrigin(W / 2, H / 2, w, h, deg);
    const a = (deg * Math.PI) / 180;
    // the far corner of the box (along the text and up) should mirror the origin about the centre
    const cornerU = o.u + w * Math.cos(a) + h * -Math.sin(a);
    const cornerV = o.v + w * -Math.sin(a) + h * -Math.cos(a);
    assert.ok(Math.abs((o.u + cornerU) / 2 - W / 2) < 1e-9 && Math.abs((o.v + cornerV) / 2 - H / 2) < 1e-9, `angle ${deg}`);
  }
  assert.deepEqual(centredOrigin(300, 400, 200, 40, 0), { u: 200, v: 420 });
});
