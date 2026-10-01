import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitToSize } from '../../src/lib/fit/fitToSize.ts';
import type { FitEncoder } from '../../src/lib/fit/fitToSize.ts';
import { fitPdf, settingsForStrength, qualityLabel } from '../../src/lib/fit/fitPdf.ts';
import { toBytes, effectiveTarget, formatBytes, parseSizeValue, percentSmaller } from '../../src/lib/fit/units.ts';

// A fake encoder whose output size behaves like a real JPEG: grows with the
// number of pixels and exponentially with quality.
function fakeJpeg(width: number, height: number, noise = 0): FitEncoder & { calls: number } {
  const enc = {
    width,
    height,
    hasQuality: true,
    calls: 0,
    async encode(scale: number, quality: number) {
      enc.calls++;
      const px = width * height * scale * scale;
      const bpp = 0.12 * Math.exp(quality / 19);
      const jitter = 1 + noise * Math.sin(quality * 12.9898 + scale * 78.233);
      return new Uint8Array(Math.max(200, Math.round((px * bpp * jitter) / 8)));
    },
  };
  return enc;
}

function fakePng(width: number, height: number): FitEncoder & { calls: number } {
  const enc = {
    width,
    height,
    hasQuality: false,
    calls: 0,
    async encode(scale: number) {
      enc.calls++;
      return new Uint8Array(Math.round(width * height * scale * scale * 1.6));
    },
  };
  return enc;
}

const opts = (targetBytes: number) => ({
  targetBytes,
  minQuality: 45,
  maxQuality: 92,
  minScale: 0.06,
});

test('units: KB is 1000 bytes and we aim 2% under', () => {
  assert.equal(toBytes(200, 'KB'), 200_000);
  assert.equal(toBytes(1.5, 'MB'), 1_500_000);
  assert.equal(effectiveTarget(200_000), 196_000);
  // 196,000 bytes is under 200 KB whether a site counts 1000 or 1024.
  assert.ok(effectiveTarget(200_000) < 200 * 1000);
});

test('units: formatting and parsing', () => {
  assert.equal(formatBytes(198_400), '198 KB');
  assert.equal(formatBytes(24_600), '24.6 KB');
  assert.equal(formatBytes(1_420_000), '1.42 MB');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(parseSizeValue('200'), 200);
  assert.equal(parseSizeValue('1,5'), 1.5);
  assert.equal(parseSizeValue('0'), null);
  assert.equal(parseSizeValue('abc'), null);
  assert.equal(percentSmaller(1000, 70), '93% smaller');
  assert.equal(percentSmaller(100, 200), '');
});

test('image: already-small target is met at top quality in one or two tries', async () => {
  const enc = fakeJpeg(1000, 800);
  const r = await fitToSize(enc, opts(5_000_000));
  assert.ok(r.fits);
  assert.equal(r.scale, 1);
  assert.equal(r.quality, 92);
  assert.ok(enc.calls <= 2, `used ${enc.calls} encodes`);
});

test('image: result is under the limit and close to it (quality is not wasted)', async () => {
  const enc = fakeJpeg(4000, 3000);
  const target = effectiveTarget(toBytes(200, 'KB'));
  const r = await fitToSize(enc, opts(target));
  assert.ok(r.fits, 'should fit');
  assert.ok(r.size <= target, `${r.size} > ${target}`);
  assert.ok(r.size >= 0.8 * target, `only used ${Math.round((r.size / target) * 100)}% of the allowance`);
  assert.ok(enc.calls <= 14, `used ${enc.calls} encodes`);
});

test('image: prefers keeping full size when quality alone can do it', async () => {
  const enc = fakeJpeg(1200, 900);
  // At minimum quality this image is ~173 KB, so 250 KB is reachable by quality alone.
  const target = 250_000;
  const r = await fitToSize(enc, opts(target));
  assert.ok(r.fits);
  assert.equal(r.scale, 1, 'should not shrink pixels when quality can absorb it');
  assert.ok(r.quality > 45 && r.quality < 92, `quality ${r.quality}`);
  assert.ok(r.size <= target && r.size >= 0.9 * target);
});

test('image: impossible target reports fits=false with the smallest it could do', async () => {
  const enc = fakeJpeg(3000, 2000);
  const r = await fitToSize(enc, opts(10));
  assert.equal(r.fits, false);
  assert.ok(r.size > 10);
});

test('png (no quality dial): shrinks pixels to fit and never exceeds limit', async () => {
  const enc = fakePng(3000, 2000);
  const target = 300_000;
  const r = await fitToSize(enc, opts(target));
  assert.ok(r.fits);
  assert.ok(r.size <= target);
  assert.ok(r.scale < 1);
  assert.ok(r.size >= 0.6 * target, 'should not undershoot wildly');
});

test('image: cancel via AbortSignal', async () => {
  const ctrl = new AbortController();
  const enc = fakeJpeg(4000, 3000);
  const orig = enc.encode.bind(enc);
  enc.encode = async (s: number, q: number) => {
    ctrl.abort();
    return orig(s, q);
  };
  await assert.rejects(() => fitToSize(enc, { ...opts(100_000), signal: ctrl.signal }), { name: 'AbortError' });
});

test('image PROPERTY: whenever fits=true the size is under the limit; fits=false only if truly impossible', async () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let fitted = 0;
  let impossible = 0;
  for (let i = 0; i < 400; i++) {
    const w = Math.round(200 + rnd() * 5800);
    const h = Math.round(200 + rnd() * 4200);
    const targetKb = Math.round(5 + rnd() * 2500);
    const target = effectiveTarget(toBytes(targetKb, 'KB'));
    const enc = fakeJpeg(w, h, 0.03); // slightly noisy, non-smooth
    const r = await fitToSize(enc, opts(target));
    if (r.fits) {
      fitted++;
      assert.ok(r.size <= target, `case ${i}: ${w}x${h} target ${targetKb}KB got ${r.size} > ${target}`);
    } else {
      impossible++;
      // Must be genuinely impossible: even the floor (min scale, min quality) is too big.
      const floor = (await fakeJpeg(w, h, 0.03).encode(0.06, 45)).byteLength;
      assert.ok(floor > target * 0.9, `case ${i}: claimed impossible but floor ${floor} vs target ${target}`);
    }
  }
  assert.ok(fitted > 250, `only ${fitted} cases fitted`);
  console.log(`  property: ${fitted} fitted, ${impossible} genuinely impossible`);
});

test('image PROPERTY (tiny targets): impossible cases are reported honestly, never a fake "fits"', async () => {
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  let impossible = 0;
  for (let i = 0; i < 200; i++) {
    const w = Math.round(300 + rnd() * 5000);
    const h = Math.round(300 + rnd() * 4000);
    const target = Math.round(300 + rnd() * 6000);
    const r = await fitToSize(fakeJpeg(w, h), opts(target));
    if (r.fits) assert.ok(r.size <= target, `case ${i}: fits but ${r.size} > ${target}`);
    else {
      impossible++;
      assert.ok(r.size > target, `case ${i}: not fitting but size ${r.size} <= ${target}`);
    }
  }
  assert.ok(impossible > 20, 'test should exercise the impossible branch');
  console.log(`  tiny-target property: ${impossible}/200 genuinely impossible`);
});

test('pdf: strength maps to sensible settings', () => {
  assert.deepEqual(settingsForStrength(0), { dpi: 300, quality: 90 });
  const end = settingsForStrength(1);
  assert.equal(end.dpi, 50);
  assert.equal(end.quality, 32);
  assert.ok(settingsForStrength(0.5).dpi < 300 && settingsForStrength(0.5).dpi > 50);
  assert.equal(qualityLabel(0.1), 'Excellent');
  assert.equal(qualityLabel(0.4), 'Good');
  assert.equal(qualityLabel(0.7), 'Fair');
  assert.equal(qualityLabel(0.95), 'Low');
});

// Fake PDF engine: size shrinks smoothly as strength rises.
const fakePdf = (orig: number, floor: number) => async (t: number) => {
  const k = (Math.exp(-5 * t) - Math.exp(-5)) / (1 - Math.exp(-5)); // 1 at t=0, 0 at t=1
  return new Uint8Array(Math.round(floor + (orig - floor) * k));
};

test('pdf: best quality wins when it already fits', async () => {
  const r = await fitPdf(fakePdf(3_000_000, 100_000), { targetBytes: 5_000_000 });
  assert.ok(r.fits);
  assert.equal(r.strength, 0);
  assert.equal(r.attempts, 2);
});

test('pdf: impossible target is detected after ONE run and reports the floor', async () => {
  const r = await fitPdf(fakePdf(3_000_000, 400_000), { targetBytes: 100_000 });
  assert.equal(r.fits, false);
  assert.equal(r.attempts, 1);
  assert.equal(r.size, 400_000);
});

test('pdf PROPERTY: fits => under the limit, uses at most 8 runs, stays close to the limit', async () => {
  let seed = 999;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 300; i++) {
    const orig = Math.round(500_000 + rnd() * 60_000_000);
    const floor = Math.round(orig * (0.005 + rnd() * 0.2));
    const target = Math.round(floor * (0.5 + rnd() * 6));
    const r = await fitPdf(fakePdf(orig, floor), { targetBytes: target });
    assert.ok(r.attempts <= 8, `case ${i} used ${r.attempts} runs`);
    if (r.fits) {
      assert.ok(r.size <= target, `case ${i}: ${r.size} > ${target}`);
      if (r.strength > 0) assert.ok(r.size >= 0.8 * target, `case ${i}: undershoot ${r.size} vs ${target}`);
    } else {
      assert.ok(floor > target * 0.999, `case ${i}: claimed impossible`);
    }
  }
});
