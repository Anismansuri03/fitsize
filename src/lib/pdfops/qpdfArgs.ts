// Builds qpdf command lines. Files live in the worker's memory as /<name>; qpdf writes /out.pdf (or /out-*.pdf).
// Keeping this pure means it can be tested without a browser.

export const inName = (i: number) => (i === 0 ? 'in.pdf' : `in${i}.pdf`);

/** Put several PDFs one after another. */
export function mergeArgs(count: number): string[] {
  // Each file needs an explicit range: qpdf would otherwise read the next file name as a page range.
  const files = Array.from({ length: count }, (_, i) => [`/${inName(i)}`, '1-z']).flat();
  return ['--empty', '--pages', ...files, '--', '/out.pdf'];
}

/** Keep only these pages of /in.pdf, in this order. Also used to delete pages (keep the rest). */
export function keepPagesArgs(pages: number[]): string[] {
  if (!pages.length) throw new Error('Choose at least one page.');
  return ['/in.pdf', '--pages', '.', pages.join(','), '--', '/out.pdf'];
}

/** Turn pages clockwise. `turns` maps page number -> 90, 180 or 270. Adds to any rotation the page already has. */
export function rotateArgs(turns: Map<number, number>): string[] {
  const byAngle = new Map<number, number[]>();
  for (const [page, angle] of turns) {
    const a = ((angle % 360) + 360) % 360;
    if (a === 0) continue;
    byAngle.set(a, [...(byAngle.get(a) ?? []), page]);
  }
  const opts = [...byAngle].map(([a, pages]) => `--rotate=+${a}:${pages.sort((x, y) => x - y).join(',')}`);
  return ['/in.pdf', ...opts, '/out.pdf'];
}

/** Cut /in.pdf into pieces of n pages: out-01-03.pdf, out-04-06.pdf ... */
export function splitEveryArgs(n: number): string[] {
  return ['/in.pdf', `--split-pages=${Math.max(1, Math.floor(n))}`, '/out.pdf'];
}

export interface Allowed {
  print: boolean;
  copy: boolean;
  edit: boolean;
}

/** Lock with AES-256. `owner` decides who may change the restrictions. */
export function encryptArgs(user: string, owner: string, allowed: Allowed): string[] {
  return [
    '--encrypt', user, owner, '256',
    `--print=${allowed.print ? 'full' : 'none'}`,
    `--extract=${allowed.copy ? 'y' : 'n'}`,
    `--modify=${allowed.edit ? 'all' : 'none'}`,
    '--', '/in.pdf', '/out.pdf',
  ];
}

/** Remove the password (and any restrictions). */
export function decryptArgs(password: string): string[] {
  return [...(password ? [`--password=${password}`] : []), '--decrypt', '/in.pdf', '/out.pdf'];
}

/** qpdf exit codes: 0 = fine, 3 = fine but it had to fix small things. 2 = it could not do it. */
export const isSuccess = (code: number) => code === 0 || code === 3;

export type FailureKind = 'password' | 'damaged' | 'other';

export function classifyFailure(log: string): FailureKind {
  if (/invalid password|incorrect password|password is required|supplied password/i.test(log)) return 'password';
  if (/not a PDF|can't find PDF header|startxref|xref|unexpected EOF|damaged|recovery|can't find/i.test(log)) return 'damaged';
  return 'other';
}
