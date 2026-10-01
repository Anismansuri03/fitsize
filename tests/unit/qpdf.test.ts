// Runs the real qpdf (WebAssembly) against PDFs built on the spot, and checks the results with pdf-lib.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';
import { mergeArgs, keepPagesArgs, rotateArgs, splitEveryArgs, encryptArgs, decryptArgs, isSuccess, classifyFailure } from '../../src/lib/pdfops/qpdfArgs.ts';
import { parseRangeGroups, keepAllExcept, pieceName } from '../../src/lib/pdfops/ranges.ts';

const require = createRequire(import.meta.url);
const createModule = require('@neslinesli93/qpdf-wasm');
const wasmPath = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');

// Every page gets its own width (base + page number), so tests can tell pages apart after qpdf rewrites them.
async function makePdf(base: number, pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) d.addPage([base + i, 400]).drawText(`p${i}`, { x: 40, y: 300, size: 30, font: f });
  return d.save();
}
const widths = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPages().map((p) => Math.round(p.getWidth()));

async function qpdf(args: string[], files: Record<string, Uint8Array>) {
  const q = await createModule({ noInitialRun: true, print() {}, printErr() {}, locateFile: () => wasmPath });
  for (const [n, b] of Object.entries(files)) q.FS.writeFile('/' + n, b);
  let code = 0;
  try { code = q.callMain(args); } catch (e) { code = (e as { status?: number })?.status ?? -1; }
  const outs: Record<string, Uint8Array> = {};
  for (const n of q.FS.readdir('/') as string[]) if (n.startsWith('out')) outs[n] = q.FS.readFile('/' + n);
  return { code, outs };
}

test('args: merge, keep-pages, rotate and split lines are what qpdf expects', () => {
  assert.deepEqual(mergeArgs(3), ['--empty', '--pages', '/in.pdf', '1-z', '/in1.pdf', '1-z', '/in2.pdf', '1-z', '--', '/out.pdf']);
  assert.deepEqual(keepPagesArgs([1, 3, 4]), ['/in.pdf', '--pages', '.', '1,3,4', '--', '/out.pdf']);
  assert.throws(() => keepPagesArgs([]));
  assert.deepEqual(rotateArgs(new Map([[3, 90], [1, 90], [2, 180]])), ['/in.pdf', '--rotate=+90:1,3', '--rotate=+180:2', '/out.pdf']);
  assert.deepEqual(rotateArgs(new Map([[1, 0], [2, 360]])), ['/in.pdf', '/out.pdf']);
  assert.deepEqual(splitEveryArgs(2.9), ['/in.pdf', '--split-pages=2', '/out.pdf']);
  assert.ok(isSuccess(0) && isSuccess(3) && !isSuccess(2));
  assert.equal(classifyFailure("qpdf: /in.pdf: invalid password"), 'password');
  assert.equal(classifyFailure("WARNING: file is damaged\ncan't find startxref"), 'damaged');
});

test('ranges: each comma part is its own group; errors are friendly', () => {
  assert.deepEqual(parseRangeGroups('1-3, 5, 8-', 9), { ok: true, groups: [[1, 2, 3], [5], [8, 9]] });
  const bad = parseRangeGroups('2-4, 40', 9);
  assert.ok(!bad.ok && /9 pages/.test(bad.message));
  assert.ok(!parseRangeGroups('  ', 9).ok);
  assert.deepEqual(keepAllExcept(5, new Set([2, 4])), [1, 3, 5]);
  assert.equal(pieceName('report', [3]), 'report-page-3.pdf');
  assert.equal(pieceName('report', [2, 3, 4]), 'report-pages-2-4.pdf');
});

test('qpdf merge: pages from three PDFs come out in the order given', async () => {
  const a = await makePdf(100, 2), b = await makePdf(200, 1), c = await makePdf(300, 3);
  const r = await qpdf(mergeArgs(3), { 'in.pdf': a, 'in1.pdf': b, 'in2.pdf': c });
  assert.ok(isSuccess(r.code));
  assert.deepEqual(await widths(r.outs['out.pdf']), [101, 102, 201, 301, 302, 303]);
});

test('qpdf keep-pages: extract in a new order (even repeated), and delete by keeping the rest', async () => {
  const src = await makePdf(100, 5);
  const ex = await qpdf(keepPagesArgs([4, 2, 2]), { 'in.pdf': src });
  assert.deepEqual(await widths(ex.outs['out.pdf']), [104, 102, 102]);
  const del = await qpdf(keepPagesArgs(keepAllExcept(5, new Set([1, 5]))), { 'in.pdf': src });
  assert.deepEqual(await widths(del.outs['out.pdf']), [102, 103, 104]);
});

test('qpdf rotate: adds to existing rotation and only touches the chosen pages', async () => {
  const d = await PDFDocument.create();
  for (let i = 0; i < 3; i++) d.addPage([300, 400]);
  d.getPage(1).setRotation(degrees(90)); // page 2 starts rotated
  const src = await d.save();
  const r = await qpdf(rotateArgs(new Map([[1, 90], [2, 90], [3, 270]])), { 'in.pdf': src });
  const out = await PDFDocument.load(r.outs['out.pdf']);
  assert.deepEqual(out.getPages().map((p) => p.getRotation().angle), [90, 180, 270]);
  const untouched = await qpdf(rotateArgs(new Map([[2, 180]])), { 'in.pdf': src });
  const u = await PDFDocument.load(untouched.outs['out.pdf']);
  assert.deepEqual(u.getPages().map((p) => p.getRotation().angle), [0, 270, 0]);
});

test('qpdf split: every 2 pages -> 3 files of 2,2,1 pages', async () => {
  const r = await qpdf(splitEveryArgs(2), { 'in.pdf': await makePdf(100, 5) });
  const names = Object.keys(r.outs).sort();
  assert.equal(names.length, 3, names.join());
  const counts = [];
  for (const n of names) counts.push((await PDFDocument.load(r.outs[n])).getPageCount());
  assert.deepEqual(counts, [2, 2, 1]);
});

test('qpdf protect + unlock: locked file needs the password; wrong password fails cleanly; right one restores it', async () => {
  const src = await makePdf(100, 2);
  const locked = await qpdf(encryptArgs('open-sesame', 'owner-secret', { print: true, copy: false, edit: false }), { 'in.pdf': src });
  assert.ok(isSuccess(locked.code));
  const lockedBytes = locked.outs['out.pdf'];
  await assert.rejects(() => PDFDocument.load(lockedBytes), /encrypted/i, 'pdf-lib refuses the locked file');
  const wrong = await qpdf(decryptArgs('nope'), { 'in.pdf': lockedBytes });
  assert.ok(!isSuccess(wrong.code) && Object.keys(wrong.outs).length === 0, 'wrong password produces nothing');
  const ok = await qpdf(decryptArgs('open-sesame'), { 'in.pdf': lockedBytes });
  assert.ok(isSuccess(ok.code));
  assert.equal((await PDFDocument.load(ok.outs['out.pdf'])).getPageCount(), 2);
});
