// "1-3, 5, 8-" -> [1,2,3,5,8,...max]. Returns an error message for bad input.
export type PageRangeResult = { ok: true; pages: number[] } | { ok: false; message: string };

export function parsePageRange(text: string, max: number): PageRangeResult {
  const clean = text.trim();
  if (!clean) return { ok: true, pages: Array.from({ length: max }, (_, i) => i + 1) };
  const seen = new Set<number>();
  for (const part of clean.split(',')) {
    const piece = part.trim();
    if (!piece) continue;
    const m = /^(\d+)?\s*(-)?\s*(\d+)?$/.exec(piece);
    if (!m || (!m[1] && !m[3])) return { ok: false, message: `“${piece}” isn’t a page number. Try something like 1-3, 5.` };
    let from = m[1] ? Number(m[1]) : 1;
    let to = m[2] ? (m[3] ? Number(m[3]) : max) : from;
    if (from < 1 || to < 1 || from > max || to > max)
      return { ok: false, message: `This PDF has ${max} page${max === 1 ? '' : 's'}. Choose pages between 1 and ${max}.` };
    if (from > to) [from, to] = [to, from];
    for (let p = from; p <= to; p++) seen.add(p);
  }
  const pages = [...seen].sort((a, b) => a - b);
  if (!pages.length) return { ok: false, message: 'Enter at least one page number.' };
  return { ok: true, pages };
}
