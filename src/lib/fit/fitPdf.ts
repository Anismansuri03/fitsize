// Finds the gentlest PDF compression that still fits under a byte limit.
//
// One "strength" number t (0 = best quality, 1 = smallest file) controls how
// aggressively pictures inside the PDF are shrunk and re-encoded. File size
// only goes down as t goes up, so we can binary-search it. Each run of the
// engine takes a second or two, so we keep the number of runs small (<= 8).

export interface PdfSettings {
  /** Highest picture resolution to keep, in dots per inch. */
  dpi: number;
  /** JPEG quality for pictures, 1-100. */
  quality: number;
}

export function settingsForStrength(t: number): PdfSettings {
  const clamped = Math.min(1, Math.max(0, t));
  return {
    dpi: Math.round(300 * Math.pow(50 / 300, clamped)), // 300 -> 50 (geometric)
    quality: Math.round(90 - 58 * clamped), // 90 -> 32
  };
}

export type QualityWord = 'Excellent' | 'Good' | 'Fair' | 'Low';

/** Plain-language label for the result. */
export function qualityLabel(t: number): QualityWord {
  if (t < 0.3) return 'Excellent';
  if (t < 0.55) return 'Good';
  if (t < 0.8) return 'Fair';
  return 'Low';
}

export interface PdfFitOptions {
  targetBytes: number;
  signal?: AbortSignal;
  onAttempt?: (info: { strength: number; size: number; attempt: number; expected: number }) => void;
}

export interface PdfFitResult {
  bytes: Uint8Array;
  size: number;
  strength: number;
  fits: boolean;
  attempts: number;
}

export async function fitPdf(
  run: (strength: number) => Promise<Uint8Array>,
  o: PdfFitOptions,
): Promise<PdfFitResult> {
  let attempts = 0;
  const expected = 8;
  let best: { t: number; bytes: Uint8Array } | null = null;

  async function at(t: number): Promise<Uint8Array> {
    if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const bytes = await run(t);
    attempts++;
    o.onAttempt?.({ strength: t, size: bytes.byteLength, attempt: attempts, expected });
    if (bytes.byteLength <= o.targetBytes && (!best || t < best.t)) best = { t, bytes };
    return bytes;
  }

  // 1) Smallest we can possibly make it. If that does not fit, nothing will.
  const floor = await at(1);
  if (floor.byteLength > o.targetBytes) {
    return { bytes: floor, size: floor.byteLength, strength: 1, fits: false, attempts };
  }

  // 2) Best quality. If that already fits, we are done.
  const top = await at(0);
  if (top.byteLength <= o.targetBytes) {
    return { bytes: top, size: top.byteLength, strength: 0, fits: true, attempts };
  }

  // 3) Narrow in between.
  let lo = 0; // does not fit
  let hi = 1; // fits
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    const bytes = await at(mid);
    if (bytes.byteLength <= o.targetBytes) {
      hi = mid;
      if (bytes.byteLength >= 0.93 * o.targetBytes) break; // close enough
    } else {
      lo = mid;
    }
  }
  const b = best as { t: number; bytes: Uint8Array } | null;
  const pick = b ?? { t: 1, bytes: floor };
  return { bytes: pick.bytes, size: pick.bytes.byteLength, strength: pick.t, fits: true, attempts };
}
