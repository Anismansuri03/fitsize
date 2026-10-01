// Size units and formatting.
//
// A person typing "200 KB" may be checked by a website that counts 1 KB as
// 1,000 bytes OR 1,024 bytes. We treat 1 KB as 1,000 bytes (the smaller
// interpretation) and aim ~2% under it, so the result passes either way.

export type Unit = 'KB' | 'MB';

export const BYTES_PER_UNIT: Record<Unit, number> = { KB: 1000, MB: 1_000_000 };

/** Headroom under the requested size. */
export const SAFETY_FACTOR = 0.98;

export function toBytes(value: number, unit: Unit): number {
  return Math.floor(value * BYTES_PER_UNIT[unit]);
}

/** The byte count we actually aim for, given what the person asked for. */
export function effectiveTarget(requestedBytes: number): number {
  return Math.max(1, Math.floor(requestedBytes * SAFETY_FACTOR));
}

/** "198 KB", "24.6 KB", "1.42 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  if (bytes < 1_000_000) {
    const kb = bytes / 1000;
    return `${trim(kb < 100 ? kb.toFixed(1) : kb.toFixed(0))} KB`;
  }
  const mb = bytes / 1_000_000;
  return `${trim(mb < 10 ? mb.toFixed(2) : mb.toFixed(1))} MB`;
}

function trim(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Turn the text of a number box into a positive number, or null. */
export function parseSizeValue(text: string): number | null {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** How much smaller, as a friendly percentage: (100, 7) -> "93% smaller". */
export function percentSmaller(before: number, after: number): string {
  if (before <= 0 || after >= before) return '';
  return `${Math.round((1 - after / before) * 100)}% smaller`;
}
