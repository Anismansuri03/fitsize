import { ghostscript } from '../../lib/pdf/ghostscript';
import { repairArgs } from '../../lib/pdf/gsArgs';
import { openPdf } from '../../lib/pdf/pdfjs';
import { extractText } from '../../lib/pdfops/text';
import { Notice } from '../ui';
import Workbench from './Workbench';
import { base, plural, readBytes } from './shared';

export function RepairPdfTool() {
  return (
    <Workbench
      countPages={false}
      dropTitle="Drop your damaged PDF here"
      dropHint="For files that won’t open, or open with errors or missing pages."
      action={() => 'Repair PDF'}
      zipName="repaired.zip"
      onCancel={() => ghostscript.terminate()}
      next={[{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/edit-pdf/', label: 'Edit it' }]}
      options={() => <p className="field__help">We rebuild the file from everything that can still be read. If part of the file is truly missing, that part can’t come back.</p>}
      process={async (items, { signal, report }) => {
        report({ note: 'Loading the repair tool (one time only)…' });
        await ghostscript.load(await readBytes(items[0].file), { signal, onProgress: report });
        report({ progress: 0.7, note: 'Rebuilding the file…' });
        const out = await ghostscript.runArgs(repairArgs(), { signal });
        // Check that the result really opens and has pages.
        let pages = 0;
        try {
          const { doc, close } = await openPdf(out);
          pages = doc.numPages;
          await close();
        } catch { /* handled below */ }
        if (!pages) throw new Error('We couldn’t recover anything readable from this file.');
        return [{ name: `${base(items[0].file)}-repaired.pdf`, bytes: out }];
      }}
      result={(outs) => <Notice tone="ok"><span>The repaired PDF opens correctly. Interactive form fields and bookmarks may not have been kept.</span></Notice>}
    />
  );
}

export function PdfToTextTool() {
  return (
    <Workbench
      countPages={false}
      dropTitle="Drop your PDF here"
      dropHint="We’ll pull out the text as a plain .txt file."
      action={() => 'Extract text'}
      zipName="text.zip"
      next={[{ href: '/pdf-to-image/', label: 'PDF to pictures' }, { href: '/edit-pdf/', label: 'Edit PDF' }]}
      options={() => <p className="field__help">Works on PDFs made from documents. Scans (pictures of pages) have no text inside to extract.</p>}
      process={async (items, { signal, report }) => {
        const r = await extractText(items[0].file, { signal, onProgress: report });
        if (r.empty) throw new Error('We found no text in this PDF. It is probably a scan, which is just pictures of pages.');
        return [{ name: `${base(items[0].file)}.txt`, bytes: new TextEncoder().encode(r.text), mime: 'text/plain;charset=utf-8' }];
      }}
      result={(outs) => <p className="field__help">{plural(outs[0].bytes.byteLength, 'byte')} of text extracted. Layout such as columns and tables is not kept.</p>}
    />
  );
}
