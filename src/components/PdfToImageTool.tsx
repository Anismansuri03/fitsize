import { useEffect, useRef, useState } from 'react';
import { countPages, renderPdfPages } from '../lib/pdf/pdfToImages';
import type { RenderedPage } from '../lib/pdf/pdfToImages';
import { parsePageRange } from '../lib/pdf/pageRange';
import { formatBytes } from '../lib/fit/units';
import { baseName, downloadBlob } from '../lib/download';
import { downloadZip } from '../lib/downloadZip';
import { friendlyError, isAbort } from '../lib/worker-rpc';
import type { ProgressInfo } from '../lib/worker-rpc';
import { ACCEPT_PDF, Dropzone, FileCard, Icon, Notice, PrivacyNote, ProgressBar, RangeField, Segmented, useObjectUrl } from './ui';

const QUALITY_DPI = { small: 96, standard: 150, high: 300 } as const;
type Detail = keyof typeof QUALITY_DPI;

function PageThumb({ page, name, ext }: { page: RenderedPage; name: string; ext: string }) {
  const url = useObjectUrl(page.blob);
  const filename = `${name}-page-${page.pageNumber}.${ext}`;
  return (
    <div className="thumb">
      {url && <img src={url} alt={`Page ${page.pageNumber}`} />}
      <div className="thumb__name">Page {page.pageNumber} · {formatBytes(page.blob.size)}</div>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => downloadBlob(page.blob, filename)}>
        <Icon name="download" size={16} /> Download
      </button>
    </div>
  );
}

export default function PdfToImageTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [rangeText, setRangeText] = useState('');
  const [format, setFormat] = useState<'png' | 'jpeg'>('jpeg');
  const [detail, setDetail] = useState<Detail>('standard');
  const [quality, setQuality] = useState(90);
  const [rejected, setRejected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>({});
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const ctl = useRef<AbortController | null>(null);

  useEffect(() => {
    setPageCount(null);
    setPages([]);
    if (!file) return;
    let live = true;
    countPages(file)
      .then((n) => live && setPageCount(n))
      .catch((e) => {
        if (live) {
          setError(friendlyError(e));
          setFile(null);
        }
      });
    return () => {
      live = false;
    };
  }, [file]);

  const range = pageCount ? parsePageRange(rangeText, pageCount) : null;
  const rangeError = range && !range.ok ? range.message : '';
  const ext = format === 'png' ? 'png' : 'jpg';

  const start = async () => {
    if (!file || !range || !range.ok) return;
    setError(null);
    setPages([]);
    setWorking(true);
    const c = new AbortController();
    ctl.current = c;
    try {
      await renderPdfPages(file, {
        pages: range.pages,
        dpi: QUALITY_DPI[detail],
        format,
        quality,
        signal: c.signal,
        onProgress: setProgress,
        onPage: (p) => setPages((prev) => [...prev, p]),
      });
    } catch (e) {
      if (!isAbort(e)) setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  };

  if (!file) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={ACCEPT_PDF}
          onFiles={(f) => { setRejected([]); setError(null); setFile(f[0]); }}
          onReject={setRejected}
          title="Drop your PDF here"
          hint="Every page can become a picture."
          buttonLabel="Choose PDF"
        />
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  const base = baseName(file.name);

  return (
    <div className="panel stack">
      <FileCard
        name={file.name}
        thumb={<span className="file__thumb">PDF</span>}
        sub={pageCount === null ? `${formatBytes(file.size)} · reading…` : `${formatBytes(file.size)} · ${pageCount} page${pageCount === 1 ? '' : 's'}`}
        onRemove={() => { ctl.current?.abort(); setFile(null); }}
      />

      <div className="field">
        <span className="field__label">Picture type</span>
        <Segmented
          label="Picture type"
          wide
          value={format}
          onChange={setFormat}
          options={[
            { value: 'jpeg', label: 'JPG (smaller)' },
            { value: 'png', label: 'PNG (sharpest)' },
          ]}
        />
      </div>

      <div className="field">
        <span className="field__label">Detail</span>
        <Segmented
          label="Detail"
          wide
          value={detail}
          onChange={setDetail}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'standard', label: 'Standard' },
            { value: 'high', label: 'High' },
          ]}
        />
        <p className="field__help">
          {detail === 'small' && 'Good for quick previews and sharing on chat.'}
          {detail === 'standard' && 'Clear on screens. A good choice for most people.'}
          {detail === 'high' && 'Sharp enough for printing. Pictures are large and take longer.'}
        </p>
      </div>

      {format === 'jpeg' && <RangeField label="Picture quality" value={quality} min={40} max={100} onChange={setQuality} format={(n) => `${n}%`} ends={['Smaller file', 'Sharper picture']} />}

      <div className="field">
        <label className="field__label" htmlFor="pages">Which pages?</label>
        <input
          id="pages"
          className="input"
          type="text"
          value={rangeText}
          onChange={(e) => setRangeText(e.target.value)}
          placeholder={pageCount ? `All ${pageCount} pages` : 'All pages'}
          aria-invalid={rangeError ? true : undefined}
          disabled={pageCount === null}
        />
        <p className="field__help">Leave empty for all pages, or type something like 1-3, 5.</p>
        {rangeError && <p className="field__error" role="alert">{rangeError}</p>}
      </div>

      {working && <ProgressBar value={progress.progress} note={progress.note} />}
      {error && <Notice tone="error">{error}</Notice>}

      {pages.length > 0 && (
        <div className="stack">
          {!working && (
            <div className="summary-bar">
              <span>{pages.length} picture{pages.length === 1 ? '' : 's'} ready</span>
              {pages.length > 1 && (
                <button
                  type="button"
                  className="btn btn--fern btn--small"
                  onClick={() => downloadZip(pages.map((p) => ({ blob: p.blob, filename: `${base}-page-${p.pageNumber}.${ext}` })), `${base}-pictures.zip`)}
                >
                  <Icon name="download" size={16} /> Download all as ZIP
                </button>
              )}
            </div>
          )}
          <div className="thumbs">
            {pages.map((p) => <PageThumb key={p.pageNumber} page={p} name={base} ext={ext} />)}
          </div>
        </div>
      )}

      <div className="stack">
        {working ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={() => ctl.current?.abort()}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={start} disabled={pageCount === null || !!rangeError}>
            {pages.length ? 'Convert again' : 'Convert to pictures'}
          </button>
        )}
      </div>
      <PrivacyNote />
    </div>
  );
}
