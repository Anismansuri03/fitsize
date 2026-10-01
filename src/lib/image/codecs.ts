// Image decoding / resizing / encoding on top of jSquash (Squoosh codecs in WASM).
// Runs inside the image worker.
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { encode as encodeWebp } from '@jsquash/webp';
import { encode as encodeAvif } from '@jsquash/avif';
import { optimise as optimisePng } from '@jsquash/oxipng';
import resize from '@jsquash/resize';
import type { ImageFormat } from './types';

export const MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};
export const EXT: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };

/** What kind of picture is this file? (null = something we don't recognise) */
export function detectFormat(file: Blob & { name?: string }): ImageFormat | 'gif' | 'bmp' | null {
  const t = (file.type || '').toLowerCase();
  const n = (file.name || '').toLowerCase();
  if (t === 'image/jpeg' || /\.jpe?g$/.test(n)) return 'jpeg';
  if (t === 'image/png' || n.endsWith('.png')) return 'png';
  if (t === 'image/webp' || n.endsWith('.webp')) return 'webp';
  if (t === 'image/avif' || n.endsWith('.avif')) return 'avif';
  if (t === 'image/gif' || n.endsWith('.gif')) return 'gif';
  if (t === 'image/bmp' || n.endsWith('.bmp')) return 'bmp';
  return null;
}

const HEIC = /\.(heic|heif)$/i;

export async function decodeToImageData(file: File, flattenOnWhite: boolean): Promise<ImageData> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // also applies the photo's rotation
  } catch {
    if (HEIC.test(file.name) || /heic|heif/i.test(file.type)) {
      throw new Error(
        'HEIC photos (from iPhones) can’t be opened in this browser. Export the photo as JPG first, or set the iPhone camera to “Most Compatible”.',
      );
    }
    throw new Error(`We couldn’t open “${file.name}”. It may be damaged or not a picture.`);
  }
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser can’t process images here.');
  if (flattenOnWhite) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

/** True if any pixel is see-through (used to decide whether JPG would lose something). */
export function hasTransparency(img: ImageData): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 16) if (d[i] < 255) return true;
  return false;
}

export async function resizeTo(img: ImageData, width: number, height: number): Promise<ImageData> {
  if (width === img.width && height === img.height) return img;
  return resize(img, { width, height, method: 'lanczos3', fitMethod: 'stretch', premultiply: true, linearRGB: false });
}

export interface EncodeOpts {
  /** Faster, slightly larger output. Used while searching for the right size. */
  fast?: boolean;
}

export async function encodeImage(
  img: ImageData,
  format: ImageFormat,
  quality: number,
  opts: EncodeOpts = {},
): Promise<Uint8Array> {
  switch (format) {
    case 'jpeg':
      return new Uint8Array(await encodeJpeg(img, { quality }));
    case 'webp':
      return new Uint8Array(await encodeWebp(img, { quality }));
    case 'avif':
      return new Uint8Array(await encodeAvif(img, { quality, speed: opts.fast ? 8 : 6 }));
    case 'png': {
      // Lossless: encode + squeeze. (Quality does not apply to PNG.)
      const optimised = await optimisePng(img, { level: opts.fast ? 1 : 2, interlace: false, optimiseAlpha: false });
      return new Uint8Array(optimised);
    }
  }
}
