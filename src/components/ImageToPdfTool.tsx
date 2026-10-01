import { useRef, useState } from 'react';
import { imagesToPdf } from '../lib/pdf/imagesToPdf';
import { enhanceImage } from '../lib/pdf/scanEnhance';
import type { ScanMode } from '../lib/pdf/scanEnhance';
import type { Margin, PageSize } from '../lib/pdf/imagesToPdf';
import { formatBytes } from '../lib/fit/units';
import { bytesToBlob, downloadBlob } from '../lib/download';
import { friendlyError, isAbort } from '../lib/worker-rpc';
import type { ProgressInfo } from '../lib/worker-rpc';
import { useJobs } from './useJobs';
import type { Output } from './useJobs';
import { ACCEPT_IMAGES, Dropzone, FileCard, Icon, Notice, PrivacyNote, ProgressBar, Segmented, Thumb } from './ui';

export default function ImageToPdfTool({ scan = false }: { scan?: boolean }) {
  const { jobs, add, remove, clear, move } = useJobs<Output>();
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [margin, setMargin] = useState<Margin>(scan ? 'none' : 'small');
  const [enhance, setEnhance] = useState<ScanMode>('enhanced');
  const camera = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; size: number; pages: number } | null>(null);
  const cancelled = useRef(false);

  const start = async () => {
    setError(null);
    setResult(null);
    setWorking(true);
    cancelled.current = false;
    setProgress({ note: 'Starting…' });
    try {
      let files = jobs.map((j) => j.file);
      if (scan && enhance !== 'original') {
        files = [];
        for (let i = 0; i < jobs.length; i++) {
          if (cancelled.current) return;
          setProgress({ progress: i / jobs.length / 2, note: `Cleaning up picture ${i + 1} of ${jobs.length}…` });
          files.push(await enhanceImage(jobs[i].file, enhance));
        }
      }
      const bytes = await imagesToPdf(files, { pageSize, margin, onProgress: (p) => !cancelled.current && setProgress(scan && enhance !== 'original' ? { ...p, progress: 0.5 + (p.progress ?? 0) / 2 } : p) });
      if (cancelled.current) return;
      setResult({ blob: bytesToBlob(bytes, 'application/pdf'), size: bytes.byteLength, pages: jobs.length });
    } catch (e) {
      if (!isAbort(e)) setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  };

  const cameraInput = scan ? (
    <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true"
      onChange={(e) => { const f = Array.from(e.target.files ?? []); if (f.length) { setResult(null); add(f); } e.target.value = ''; }} />
  ) : null;
  const cameraButton = scan ? (
    <button type="button" className="btn btn--secondary" onClick={() => camera.current?.click()}><Icon name="camera" size={18} /> Take a photo</button>
  ) : null;

  if (jobs.length === 0) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={ACCEPT_IMAGES}
          multiple
          onFiles={(f) => { setRejected([]); add(f); }}
          onReject={setRejected}
          title={scan ? 'Add photos of your pages' : 'Drop your pictures here'}
          hint={scan ? 'Take a photo of each page, or choose photos you already have.' : 'Each picture becomes one page. You can put them in order next.'}
          buttonLabel="Choose pictures"
        />
        {cameraButton}
        {cameraInput}
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  return (
    <div className="panel stack">
      <div className="files">
        {jobs.map((j, i) => (
          <FileCard
            key={j.id}
            name={j.file.name}
            thumb={<Thumb file={j.file} label="IMG" />}
            sub={`Page ${i + 1}  ·  ${formatBytes(j.file.size)}`}
            onRemove={() => { setResult(null); remove(j.id); }}
            removeDisabled={working}
            actions={
              jobs.length > 1 ? (
                <>
                  <button type="button" className="icon-btn" aria-label={`Move ${j.file.name} up`} disabled={i === 0 || working} onClick={() => { setResult(null); move(j.id, -1); }}>
                    <Icon name="up" size={18} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Move ${j.file.name} down`} disabled={i === jobs.length - 1 || working} onClick={() => { setResult(null); move(j.id, 1); }}>
                    <Icon name="down" size={18} />
                  </button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>

      {cameraInput}
      {!working && cameraButton}
      {!working && <Dropzone accept={ACCEPT_IMAGES} multiple compact onFiles={(f) => { setRejected([]); setResult(null); add(f); }} onReject={setRejected} title="Add more pictures" />}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}

      {scan && (
        <div className="field">
          <span className="field__label">Look</span>
          <Segmented<ScanMode> label="Look" wide value={enhance} onChange={(v) => { setEnhance(v); setResult(null); }} options={[{ value: 'enhanced', label: 'Clean up' }, { value: 'bw', label: 'Black & white' }, { value: 'original', label: 'As taken' }]} />
          <p className="field__help">{enhance === 'enhanced' ? 'Whiter paper and darker ink, colours kept.' : enhance === 'bw' ? 'Like a photocopy: crisp black text with no shadows. Best for text pages.' : 'No changes to your photos.'}</p>
        </div>
      )}
      <div className="field">
        <span className="field__label">Page size</span>
        <Segmented
          label="Page size"
          wide
          value={pageSize}
          onChange={(v) => { setPageSize(v); setResult(null); }}
          options={[
            { value: 'a4', label: 'A4' },
            { value: 'letter', label: 'US Letter' },
            { value: 'fit', label: 'Same as picture' },
          ]}
        />
      </div>
      <div className="field">
        <span className="field__label">Space around the picture</span>
        <Segmented
          label="Margin"
          wide
          value={margin}
          onChange={(v) => { setMargin(v); setResult(null); }}
          options={[
            { value: 'none', label: 'None' },
            { value: 'small', label: 'Small' },
            { value: 'big', label: 'Big' },
          ]}
        />
      </div>

      {working && <ProgressBar value={progress.progress} note={progress.note} />}
      {error && <Notice tone="error">{error}</Notice>}
      {result && !working && (
        <div className="file file--done">
          <div className="result">
            <div className="result__line">
              <span className="result__sizes">{result.pages} page{result.pages === 1 ? '' : 's'}</span>
              <span className="result__badge">{formatBytes(result.size)}</span>
            </div>
            <div className="result__actions">
              <button type="button" className="btn btn--fern" onClick={() => downloadBlob(result.blob, 'pictures.pdf')}>
                <Icon name="download" size={18} /> Download PDF
              </button>
            </div>
            <p className="field__help">Too big for a form? Use Compress PDF to get it under the size you need.</p>
          </div>
        </div>
      )}

      <div className="stack">
        {working ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={() => { cancelled.current = true; setWorking(false); }}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={start}>
            {result ? 'Create PDF again' : jobs.length > 1 ? `Create PDF from ${jobs.length} pictures` : 'Create PDF'}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { clear(); setResult(null); setError(null); }} disabled={working}>Start over</button>
      </div>
      <PrivacyNote />
    </div>
  );
}
