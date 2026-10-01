import { useState } from 'react';
import { qpdf } from '../../lib/pdfops/qpdf';
import { keepPagesArgs, splitEveryArgs } from '../../lib/pdfops/qpdfArgs';
import { parseRangeGroups, pieceName } from '../../lib/pdfops/ranges';
import { Segmented } from '../ui';
import Workbench from './Workbench';
import type { OutFile } from './Workbench';
import { base, plural, readBytes } from './shared';

type Mode = 'ranges' | 'every' | 'each';

export default function SplitPdfTool() {
  const [mode, setMode] = useState<Mode>('ranges');
  const [ranges, setRanges] = useState('');
  const [every, setEvery] = useState('2');

  const n = Math.floor(Number(every));

  return (
    <Workbench
      dropTitle="Drop your PDF here"
      dropHint="Then choose how to cut it up."
      action={() => (mode === 'each' ? 'Split into single pages' : mode === 'every' ? `Split every ${plural(n || 0, 'page')}` : 'Split PDF')}
      zipName="split-pdf.zip"
      onCancel={() => qpdf.terminate()}
      next={[{ href: '/merge-pdf/', label: 'Merge PDFs' }, { href: '/compress-pdf/', label: 'Compress' }]}
      problem={(items) => {
        const pages = items[0]?.pages;
        if (mode === 'ranges') {
          if (!ranges.trim()) return 'Type the pages you want, like 1-3, 5, 8-.';
          if (pages) {
            const g = parseRangeGroups(ranges, pages);
            if (!g.ok) return g.message;
          }
        }
        if (mode === 'every' && !(n >= 1)) return 'Enter a number of pages, like 2.';
        return null;
      }}
      options={(items) => (
        <div className="stack">
          <div className="field">
            <span className="field__label">Split by</span>
            <Segmented<Mode> label="Split by" wide value={mode} onChange={setMode} options={[{ value: 'ranges', label: 'Page ranges' }, { value: 'every', label: 'Every N pages' }, { value: 'each', label: 'Every page' }]} />
          </div>
          {mode === 'ranges' && (
            <div className="field">
              <label className="field__label" htmlFor="ranges">Pages</label>
              <input id="ranges" className="input" type="text" value={ranges} onChange={(e) => setRanges(e.target.value)} placeholder={items[0]?.pages ? `for example 1-3, 5, 8-${items[0].pages}` : 'for example 1-3, 5, 8-'} autoComplete="off" />
              <p className="field__help">Every part you separate with a comma becomes its own PDF. “1-3, 5” makes two files.</p>
            </div>
          )}
          {mode === 'every' && (
            <div className="field">
              <label className="field__label" htmlFor="every">Pages in each file</label>
              <input id="every" className="input" type="number" inputMode="numeric" min="1" value={every} onChange={(e) => setEvery(e.target.value)} />
              {items[0]?.pages && n >= 1 && <p className="field__help">{items[0].pages} pages will become {Math.ceil(items[0].pages / n)} files.</p>}
            </div>
          )}
          {mode === 'each' && items[0]?.pages && <p className="field__help">You’ll get {plural(items[0].pages, 'file')}, one for every page.</p>}
        </div>
      )}
      process={async (items, { signal, report }) => {
        const it = items[0];
        const name = base(it.file);
        await qpdf.load([await readBytes(it.file)], { signal });
        const total = it.pages ?? 0;

        if (mode === 'ranges') {
          const g = parseRangeGroups(ranges, total || 100000);
          if (!g.ok) throw new Error(g.message);
          const outs: OutFile[] = [];
          for (let i = 0; i < g.groups.length; i++) {
            report({ progress: i / g.groups.length, note: `Making file ${i + 1} of ${g.groups.length}…` });
            const r = await qpdf.run(keepPagesArgs(g.groups[i]), { signal });
            outs.push({ name: pieceName(name, g.groups[i]), bytes: r.files[0].bytes });
          }
          return outs;
        }

        report({ note: 'Splitting…' });
        const size = mode === 'each' ? 1 : n;
        const r = await qpdf.run(splitEveryArgs(size), { signal });
        return r.files.map((f, i) => {
          const from = i * size + 1;
          const last = total ? Math.min(total, from + size - 1) : from + size - 1;
          const pages = Array.from({ length: last - from + 1 }, (_, k) => from + k);
          return { name: total ? pieceName(name, pages) : `${name}-part-${i + 1}.pdf`, bytes: f.bytes };
        });
      }}
    />
  );
}
