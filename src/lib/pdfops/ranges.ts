import { parsePageRange } from '../pdf/pageRange.ts';

export type GroupsResult = { ok: true; groups: number[][] } | { ok: false; message: string };

/** "1-3, 5, 8-" -> [[1,2,3],[5],[8..max]]. Each comma-separated part becomes its own group (its own file). */
export function parseRangeGroups(text: string, max: number): GroupsResult {
  const parts = text.split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { ok: false, message: 'Type the pages you want, like 1-3, 5.' };
  const groups: number[][] = [];
  for (const part of parts) {
    const r = parsePageRange(part, max);
    if (!r.ok) return r;
    groups.push(r.pages);
  }
  return { ok: true, groups };
}

/** Every page number NOT in `remove`, in order. */
export function keepAllExcept(total: number, remove: Set<number>): number[] {
  return Array.from({ length: total }, (_, i) => i + 1).filter((p) => !remove.has(p));
}

/** "invoice-1-3.pdf" style names for split pieces. */
export function pieceName(base: string, pages: number[]): string {
  const first = pages[0];
  const last = pages[pages.length - 1];
  const contiguous = pages.every((p, i) => p === first + i);
  if (pages.length === 1) return `${base}-page-${first}.pdf`;
  return contiguous ? `${base}-pages-${first}-${last}.pdf` : `${base}-pages-${pages.slice(0, 4).join('-')}${pages.length > 4 ? '-etc' : ''}.pdf`;
}
