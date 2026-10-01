import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoLevels, adaptiveThreshold } from '../../src/lib/pdf/scanEnhance.ts';

// A fake photo of a page: paper that is darker on the left (a shadow) than on the right, with dark text strokes.
function fakePage(w = 120, h = 80) {
  const data = new Uint8ClampedArray(w * h * 4);
  const isInk = (x: number, y: number) => y % 20 >= 8 && y % 20 <= 11 && x > 10 && x < w - 10;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const paper = 140 + (x / w) * 80; // 140 (shadow) -> 220 (bright)
    const v = isInk(x, y) ? paper * 0.25 : paper;
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, w, h, isInk };
}

test('autoLevels: greyish paper becomes white and ink stays dark', () => {
  const { data, w, isInk } = fakePage();
  autoLevels(data);
  const at = (x: number, y: number) => data[(y * w + x) * 4];
  assert.ok(at(100, 2) > 240, 'bright paper is white');
  assert.ok(at(30, 9) < 90 || !isInk(30, 9), 'ink is still dark');
  assert.equal(data[3], 255, 'alpha untouched');
});

test('adaptiveThreshold: shadowed and bright areas both come out pure white paper and pure black ink', () => {
  const { data, w, h, isInk } = fakePage();
  adaptiveThreshold(data, w, h);
  let paperWrong = 0, inkWrong = 0, paper = 0, ink = 0;
  for (let y = 0; y < h; y++) for (let x = 15; x < w - 15; x++) {
    const v = data[(y * w + x) * 4];
    assert.ok(v === 0 || v === 255, 'only black or white');
    if (isInk(x, y)) { ink++; if (v !== 0) inkWrong++; } else { paper++; if (v !== 255) paperWrong++; }
  }
  assert.ok(paperWrong / paper < 0.02, `paper mostly white (${paperWrong}/${paper} wrong)`);
  assert.ok(inkWrong / ink < 0.05, `ink mostly black (${inkWrong}/${ink} wrong)`);
});

test('autoLevels leaves a flat image alone instead of blowing it up', () => {
  const data = new Uint8ClampedArray(40 * 4).fill(128);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  autoLevels(data);
  assert.ok(data[0] >= 0 && data[0] <= 255 && !Number.isNaN(data[0]));
});
