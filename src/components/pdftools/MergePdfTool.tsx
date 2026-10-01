import { qpdf } from '../../lib/pdfops/qpdf';
import { mergeArgs } from '../../lib/pdfops/qpdfArgs';
import Workbench from './Workbench';
import { readBytes } from './shared';

export default function MergePdfTool() {
  return (
    <Workbench
      multiple
      reorder
      min={2}
      dropTitle="Drop your PDFs here"
      dropHint="Choose two or more. You can put them in order next."
      action={(it) => `Merge ${it.length} PDFs`}
      zipName="merged.zip"
      onCancel={() => qpdf.terminate()}
      next={[{ href: '/compress-pdf/', label: 'Compress it' }, { href: '/edit-pdf/', label: 'Edit it' }, { href: '/add-page-numbers/', label: 'Add page numbers' }]}
      options={(items) =>
        items.length > 1 ? (
          <p className="field__help">The PDFs will be joined in the order shown{items.every((i) => i.pages) ? `, ${items.reduce((n, i) => n + (i.pages ?? 0), 0)} pages in total` : ''}. Use the arrows to change the order.</p>
        ) : null
      }
      process={async (items, { signal, report }) => {
        report({ note: 'Joining your PDFs…' });
        await qpdf.load(await Promise.all(items.map((i) => readBytes(i.file))), { signal });
        const r = await qpdf.run(mergeArgs(items.length), { signal });
        return [{ name: 'merged.pdf', bytes: r.files[0].bytes }];
      }}
    />
  );
}
