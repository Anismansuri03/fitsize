// Makes a photo of a page look like a scan: whiter paper, darker ink, even lighting.
// The maths works on raw RGBA bytes so it can be tested without a browser.

export type ScanMode = 'original' | 'enhanced' | 'bw';

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Stretch the brightness so the paper becomes white and the ink stays dark (colours are kept). */
export function autoLevels(data: Uint8ClampedArray, lowPct = 0.02, highPct = 0.92): void {
  const hist = new Uint32Array(256);
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) hist[Math.round(lum(data[i], data[i + 1], data[i + 2]))]++;
  const at = (p: number) => {
    let sum = 0;
    for (let v = 0; v < 256; v++) {
      sum += hist[v];
      if (sum >= n * p) return v;
    }
    return 255;
  };
  const lo = at(lowPct);
  const hi = Math.max(at(highPct), lo + 40);
  const k = 255 / (hi - lo);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = (data[i] - lo) * k;
    data[i + 1] = (data[i + 1] - lo) * k;
    data[i + 2] = (data[i + 2] - lo) * k;
  }
}

/** Pure black on white, deciding pixel by pixel against the brightness of its neighbourhood, so shadows don't matter. */
export function adaptiveThreshold(data: Uint8ClampedArray, w: number, h: number, windowFrac = 1 / 14, ratio = 0.9): void {
  const stride = w + 1;
  const integral = new Uint32Array(stride * (h + 1));
  const grey = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = Math.round(lum(data[i], data[i + 1], data[i + 2]));
      grey[y * w + x] = l;
      row += l;
      integral[(y + 1) * stride + (x + 1)] = integral[y * stride + (x + 1)] + row;
    }
  }
  const r = Math.max(7, Math.round(Math.min(w, h) * windowFrac));
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = grey[y * w + x] < mean * ratio ? 0 : 255;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
    }
  }
}

/** Decode, shrink to a sensible size, clean up, and return a JPEG file. */
export async function enhanceImage(file: File, mode: ScanMode): Promise<File> {
  if (mode === 'original') return file;
  const bmp = await createImageBitmap(file); // applies the photo's rotation
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  if (mode === 'bw') adaptiveThreshold(img.data, c.width, c.height);
  else autoLevels(img.data);
  ctx.putImageData(img, 0, 0);
  // Black & white pages are almost entirely two colours, so PNG stays lossless AND small.
  // JPEG's compression would put faint grey ringing around every hard text edge.
  const asPng = mode === 'bw';
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process a picture.'))), asPng ? 'image/png' : 'image/jpeg', 0.9));
  c.width = c.height = 0;
  const ext = asPng ? '.png' : '.jpg';
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + ext, { type: asPng ? 'image/png' : 'image/jpeg' });
}
