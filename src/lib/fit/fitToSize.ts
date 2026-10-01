// Finds the best-looking version of an image (or anything encodable with a
// "quality" and a "scale" knob) that is GUARANTEED to fit under a byte limit.
//
// Strategy (least damage first):
//   1. Keep full size and pick the highest quality that fits.
//   2. If even the lowest acceptable quality is too big, shrink the picture just
//      enough, then spend any spare bytes on quality again.
// The search never returns something over the limit unless that is truly
// impossible, in which case it reports `fits: false` with the smallest it found.

export interface FitEncoder {
  /** Full-size pixel dimensions (used to make a smart first guess). */
  width: number;
  height: number;
  /** false for PNG-style formats where only size (not quality) can change. */
  hasQuality: boolean;
  /** Encode at `scale` (0-1, 1 = original size) and `quality` (0-100). */
  encode(scale: number, quality: number): Promise<Uint8Array>;
}

export interface FitOptions {
  /** Bytes the result must not exceed (safety margin already applied). */
  targetBytes: number;
  minQuality: number;
  maxQuality: number;
  /** Never shrink below this fraction of the original size. */
  minScale: number;
  signal?: AbortSignal;
  onAttempt?: (info: { scale: number; quality: number; size: number; attempt: number }) => void;
}

export interface FitResult {
  bytes: Uint8Array;
  size: number;
  scale: number;
  quality: number;
  fits: boolean;
  attempts: number;
}

interface Attempt {
  scale: number;
  quality: number;
  size: number;
  bytes: Uint8Array;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function fitToSize(enc: FitEncoder, o: FitOptions): Promise<FitResult> {
  const target = o.targetBytes;
  let attempts = 0;
  let best: Attempt | null = null; // best attempt that fits
  let smallest: Attempt | null = null; // smallest attempt overall
  const seen = new Map<string, number>(); // "scale:quality" -> size, to skip repeats

  const isBetter = (a: Attempt, b: Attempt) =>
    round3(a.scale) > round3(b.scale) ||
    (round3(a.scale) === round3(b.scale) && a.quality > b.quality);

  async function at(scale: number, quality: number): Promise<Attempt> {
    if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const s = Math.min(1, Math.max(o.minScale, scale));
    const key = `${round3(s)}:${quality}`;
    const known = seen.get(key);
    if (known !== undefined) {
      // Already tried this exact combination; no need to encode again.
      return { scale: s, quality, size: known, bytes: new Uint8Array(0) };
    }
    const bytes = await enc.encode(s, quality);
    attempts++;
    seen.set(key, bytes.byteLength);
    const a: Attempt = { scale: s, quality, size: bytes.byteLength, bytes };
    o.onAttempt?.({ scale: s, quality, size: a.size, attempt: attempts });
    if (!smallest || a.size < smallest.size) smallest = a;
    if (a.size <= target && (!best || isBetter(a, best))) best = a;
    return a;
  }

  const finish = (): FitResult => {
    const pick = (best ?? smallest) as Attempt;
    return {
      bytes: pick.bytes,
      size: pick.size,
      scale: pick.scale,
      quality: pick.quality,
      fits: best !== null,
      attempts,
    };
  };

  const pixels = Math.max(1, enc.width * enc.height);
  const bitsPerPixelAllowed = (target * 8) / pixels;

  // ---------- Formats with no quality dial (PNG): only shrinking helps ----------
  if (!enc.hasQuality) {
    let s = 1;
    let a = await at(1, 100);
    for (let guard = 0; a.size > target && guard < 10 && s > o.minScale + 1e-6; guard++) {
      s = Math.max(o.minScale, Math.min(s * 0.95, s * Math.sqrt(target / a.size) * 0.97));
      a = await at(s, 100);
    }
    // Spend leftover bytes: if we overshot downwards, creep back up.
    for (let i = 0; i < 2; i++) {
      const b = best as Attempt | null;
      if (!b || b.size >= 0.85 * target || b.scale >= 1) break;
      const up = Math.min(1, b.scale * Math.sqrt(target / b.size) * 0.985);
      if (up <= b.scale + 0.01) break;
      await at(up, 100);
    }
    return finish();
  }

  // ---------- Lossy formats: quality first, then size ----------
  const { minQuality: qMin, maxQuality: qMax } = o;
  let s = 1;

  // Plenty of room per pixel: try the top quality at full size straight away.
  if (bitsPerPixelAllowed >= 2) {
    const top = await at(1, qMax);
    if (top.size <= target) return finish();
  } else if (bitsPerPixelAllowed < 1) {
    // Hopeless at full size: jump straight to a sensible smaller size.
    s = Math.max(o.minScale, Math.sqrt(bitsPerPixelAllowed / 1.0));
  }

  // Find a scale where the lowest acceptable quality fits.
  let a = await at(s, qMin);
  for (let guard = 0; a.size > target && guard < 12; guard++) {
    if (s <= o.minScale + 1e-6) return finish(); // impossible without going tiny
    s = Math.max(o.minScale, Math.min(s * 0.95, s * Math.sqrt(target / a.size) * 0.97));
    a = await at(s, qMin);
  }
  if (a.size > target) return finish();

  // We may have shrunk more than necessary: creep the scale back up.
  for (let i = 0; i < 2 && a.size < 0.86 * target && s < 1; i++) {
    const up = Math.min(1, s * Math.sqrt(target / a.size) * 0.985);
    if (up <= s + 0.01) break;
    const t = await at(up, qMin);
    if (t.size > target) break;
    s = up;
    a = t;
  }
  s = (best as Attempt | null)?.scale ?? s;

  // Spend spare bytes on quality at this size.
  const topHere = await at(s, qMax);
  if (topHere.size <= target) return finish();
  let lo = qMin; // known to fit
  let hi = qMax; // known not to fit
  for (let i = 0; i < 7 && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const t = await at(s, mid);
    if (t.size <= target) {
      lo = mid;
      if (t.size >= 0.97 * target) break; // close enough, stop spending time
    } else {
      hi = mid;
    }
  }
  return finish();
}
