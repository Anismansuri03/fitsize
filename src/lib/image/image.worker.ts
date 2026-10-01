// Runs all picture work off the main thread so the page never freezes.
import { fitToSize } from '../fit/fitToSize';
import type { FitEncoder } from '../fit/fitToSize';
import { decodeToImageData, detectFormat, encodeImage, resizeTo, EXT, MIME } from './codecs';
import type {
  CompressPayload,
  ConvertPayload,
  ImageFormat,
  ImageResult,
  ResizePayload,
} from './types';

interface Ctx {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
const ctx = self as unknown as Ctx;
type Report = (p: { progress?: number; note?: string }) => void;

/** Lowest quality we accept before we would rather shrink the picture instead. */
const QUALITY_LIMITS: Record<ImageFormat, { min: number; max: number }> = {
  jpeg: { min: 45, max: 92 },
  webp: { min: 40, max: 90 },
  avif: { min: 30, max: 75 },
  png: { min: 100, max: 100 },
};

function outputFormatFor(file: File, requested: 'same' | ImageFormat): ImageFormat {
  if (requested !== 'same') return requested;
  const detected = detectFormat(file);
  if (detected === 'jpeg' || detected === 'png' || detected === 'webp' || detected === 'avif') return detected;
  return 'jpeg'; // gif / bmp / unknown -> a normal photo format
}

function done(bytes: Uint8Array, format: ImageFormat, width: number, height: number, extra: Partial<ImageResult> = {}) {
  const result: ImageResult = { bytes, mime: MIME[format], ext: EXT[format], width, height, ...extra };
  return { value: result, transfer: [bytes.buffer as ArrayBuffer] };
}

function keepOriginal(file: File, width: number, height: number, extra: Partial<ImageResult> = {}) {
  return file.arrayBuffer().then((buf) => {
    const detected = detectFormat(file);
    const fmt: ImageFormat = detected === 'jpeg' || detected === 'png' || detected === 'webp' || detected === 'avif' ? detected : 'jpeg';
    return done(new Uint8Array(buf), fmt, width, height, { unchanged: true, ...extra });
  });
}

// ---------- Compress ----------
async function compress(p: CompressPayload, report: Report) {
  const { file } = p;
  const fmt = outputFormatFor(file, p.format);
  const inputFmt = detectFormat(file);
  const flatten = fmt === 'jpeg';
  report({ note: 'Opening picture…' });
  let src = await decodeToImageData(file, flatten);

  if (p.mode === 'manual') {
    if (p.maxDim && Math.max(src.width, src.height) > p.maxDim) {
      const k = p.maxDim / Math.max(src.width, src.height);
      src = await resizeTo(src, Math.max(1, Math.round(src.width * k)), Math.max(1, Math.round(src.height * k)));
    }
    report({ note: 'Compressing…' });
    const bytes = await encodeImage(src, fmt, p.quality ?? 75);
    if (fmt === inputFmt && bytes.byteLength >= file.size && !p.maxDim) {
      return keepOriginal(file, src.width, src.height);
    }
    return done(bytes, fmt, src.width, src.height, { quality: p.quality });
  }

  // Target-size mode
  const requested = p.requestedBytes ?? 0;
  const target = p.targetBytes ?? Math.floor(requested * 0.98);
  if (fmt === inputFmt && file.size <= requested) {
    return keepOriginal(file, src.width, src.height, { fits: true });
  }

  const limits = QUALITY_LIMITS[fmt];
  const scaled = new Map<number, ImageData>();
  const getScaled = async (scale: number) => {
    const w = Math.max(1, Math.round(src.width * scale));
    if (w >= src.width) return src;
    let img = scaled.get(w);
    if (!img) {
      const h = Math.max(1, Math.round(src.height * scale));
      img = await resizeTo(src, w, h);
      scaled.set(w, img);
      if (scaled.size > 4) scaled.delete(scaled.keys().next().value as number); // keep memory small
    }
    return img;
  };

  const encoder: FitEncoder = {
    width: src.width,
    height: src.height,
    hasQuality: fmt !== 'png',
    async encode(scale, quality) {
      const img = await getScaled(scale);
      return encodeImage(img, fmt, quality, { fast: true });
    },
  };

  // Never shrink so far that the longest side drops under ~160 px.
  const minScale = Math.min(1, Math.max(0.04, 160 / Math.max(src.width, src.height)));
  report({ note: 'Finding the best quality that fits…' });
  const r = await fitToSize(encoder, {
    targetBytes: target,
    minQuality: limits.min,
    maxQuality: limits.max,
    minScale,
    onAttempt: ({ attempt }) =>
      report({ progress: Math.min(0.95, attempt / 12), note: 'Finding the best quality that fits…' }),
  });

  const w = Math.max(1, Math.round(src.width * r.scale));
  const h = Math.max(1, Math.round(src.height * r.scale));
  return done(r.bytes, fmt, w, h, { fits: r.fits, quality: r.quality, scale: r.scale, attempts: r.attempts });
}

// ---------- Resize ----------
async function resizeOp(p: ResizePayload, report: Report) {
  const { file } = p;
  const fmt = outputFormatFor(file, p.format);
  report({ note: 'Opening picture…' });
  const src = await decodeToImageData(file, fmt === 'jpeg');
  let w = src.width;
  let h = src.height;

  if (p.mode === 'percent') {
    const k = Math.max(1, p.percent ?? 100) / 100;
    w = Math.round(src.width * k);
    h = Math.round(src.height * k);
  } else if (p.lock !== false) {
    if (p.basis === 'height' && p.height) {
      h = Math.round(p.height);
      w = Math.round((src.width * h) / src.height);
    } else if (p.width) {
      w = Math.round(p.width);
      h = Math.round((src.height * w) / src.width);
    } else if (p.height) {
      h = Math.round(p.height);
      w = Math.round((src.width * h) / src.height);
    }
  } else {
    w = Math.round(p.width || src.width);
    h = Math.round(p.height || src.height);
  }
  w = Math.min(16000, Math.max(1, w));
  h = Math.min(16000, Math.max(1, h));

  report({ note: `Resizing to ${w} × ${h}…` });
  const out = await resizeTo(src, w, h);
  report({ note: 'Saving…' });
  const bytes = await encodeImage(out, fmt, p.quality);
  return done(bytes, fmt, w, h);
}

// ---------- Convert ----------
async function convertOp(p: ConvertPayload, report: Report) {
  report({ note: 'Opening picture…' });
  const src = await decodeToImageData(p.file, p.format === 'jpeg');
  report({ note: `Converting to ${EXT[p.format].toUpperCase()}…` });
  const bytes = await encodeImage(src, p.format, p.quality);
  return done(bytes, p.format, src.width, src.height, { quality: p.quality });
}

const handlers: Record<string, (payload: any, report: Report) => Promise<{ value: ImageResult; transfer: Transferable[] }>> = {
  compress,
  resize: resizeOp,
  convert: convertOp,
};

ctx.onmessage = async (e: MessageEvent) => {
  const { id, op, payload } = e.data as { id: number; op: string; payload: unknown };
  try {
    const handler = handlers[op];
    if (!handler) throw new Error(`Unknown operation: ${op}`);
    const out = await handler(payload, (p) => ctx.postMessage({ id, kind: 'progress', ...p }));
    ctx.postMessage({ id, kind: 'done', result: out.value }, out.transfer);
  } catch (err) {
    ctx.postMessage({ id, kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
