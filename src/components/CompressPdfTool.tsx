import { useRef, useState } from 'react';
import { compressPdfManual, compressPdfToSize } from '../lib/pdf/compressPdf';
import type { PdfCompressResult } from '../lib/pdf/compressPdf';
import { rasterizeToSize } from '../lib/pdf/rasterizePdf';
import { ghostscript } from '../lib/pdf/ghostscript';
import { effectiveTarget, formatBytes, parseSizeValue, percentSmaller, toBytes } from '../lib/fit/units';
import type { Unit } from '../lib/fit/units';
import { baseName, bytesToBlob, downloadBlob } from '../lib/download';
import { downloadZip } from '../lib/downloadZip';
import { friendlyError, isAbort } from '../lib/worker-rpc';
import { useJobs } from './useJobs';
import type { Output } from './useJobs';
import {
  ACCEPT_PDF,
  AdvancedToggle,
  CheckField,
  Dropzone,
  FileCard,
  Gauge,
  Icon,
  Notice,
  PrivacyNote,
  ProgressBar,
  RangeField,
  SizeField,
} from './ui';

interface PdfOut extends Output {
  originalSize: number;
  fits: boolean;
  unchanged: boolean;
  auto: boolean;
  requestedBytes: number;
  label?: PdfCompressResult['label'];
  smallestSize?: number;
  rasterized?: boolean;
}

const DPI_CHOICES = [72, 96, 120, 150, 200, 300];

export default function CompressPdfTool(props: { defaultValue?: number; defaultUnit?: Unit }) {
  const { jobs, busy, add, remove, clear, run, cancel, patch } = useJobs<PdfOut>();
  const [text, setText] = useState(String(props.defaultValue ?? 200));
  const [unit, setUnit] = useState<Unit>(props.defaultUnit ?? 'KB');
  const [advanced, setAdvanced] = useState(false);
  const [quality, setQuality] = useState(70);
  const [dpi, setDpi] = useState(150);
  const [gray, setGray] = useState(false);
  const [removeMeta, setRemoveMeta] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [rasterBusy, setRasterBusy] = useState<string | null>(null);
  const [rasterError, setRasterError] = useState<string | null>(null);
  const rasterCtl = useRef<AbortController | null>(null);

  const value = parseSizeValue(text);
  const sizeError = !advanced && value === null ? 'Enter a size bigger than 0, for example 200.' : '';
  const anyDone = jobs.some((j) => j.status === 'done');
  const done = jobs.filter((j) => j.status === 'done' && j.result);
  const requestedBytes = value ? toBytes(value, unit) : 0;

  const start = () => {
    if (!advanced && value === null) return;
    return run(async (job, { signal, report }) => {
      const common = { signal, onProgress: report, grayscale: gray && advanced, removeMetadata: removeMeta && advanced };
      const r = advanced
        ? await compressPdfManual(job.file, { ...common, dpi, quality })
        : await compressPdfToSize(job.file, { ...common, requestedBytes, targetBytes: effectiveTarget(requestedBytes) });
      return {
        blob: bytesToBlob(r.bytes, 'application/pdf'),
        filename: r.unchanged ? job.file.name : `${baseName(job.file.name)}-compressed.pdf`,
        size: r.size,
        originalSize: job.file.size,
        fits: r.fits,
        unchanged: r.unchanged,
        auto: !advanced,
        requestedBytes,
        label: r.label,
        smallestSize: r.smallestSize,
      };
    });
  };

  // Last resort: turn pages into pictures so the limit can be met.
  const makeItFit = async (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    setRasterError(null);
    setRasterBusy(jobId);
    const ctl = new AbortController();
    rasterCtl.current = ctl;
    patch(jobId, { status: 'working', progress: 0, note: 'Preparing pages…' });
    try {
      const r = await rasterizeToSize(job.file, effectiveTarget(requestedBytes), {
        signal: ctl.signal,
        onProgress: (p) => patch(jobId, { ...(p.progress !== undefined && { progress: p.progress }), ...(p.note && { note: p.note }) }),
      });
      const prev = job.result;
      if (prev && r.size >= prev.size) {
        // Pictures would not help (common with text-only PDFs): keep what we had.
        patch(jobId, { status: 'done' });
        setRasterError('Turning the pages into pictures would not make this PDF any smaller, so we kept the smallest version we already had.');
        return;
      }
      prev?.dispose?.();
      patch(jobId, {
        status: 'done',
        result: {
          blob: bytesToBlob(r.bytes, 'application/pdf'),
          filename: `${baseName(job.file.name)}-compressed.pdf`,
          size: r.size,
          originalSize: job.file.size,
          fits: r.fits,
          unchanged: false,
          auto: true,
          requestedBytes,
          rasterized: true,
        },
      });
    } catch (e) {
      patch(jobId, { status: 'done' });
      if (!isAbort(e)) setRasterError(friendlyError(e));
    } finally {
      setRasterBusy(null);
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={ACCEPT_PDF}
          multiple
          onFiles={(f) => {
            setRejected([]);
            add(f);
          }}
          onReject={setRejected}
          title="Drop your PDF here"
          hint="Choose one or several PDF files."
          buttonLabel="Choose PDF"
        />
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  const working = busy || rasterBusy !== null;

  return (
    <div className="panel stack">
      <div className="files">
        {jobs.map((j) => {
          const r = j.result;
          const tone = j.status === 'error' ? 'error' : r ? (r.fits ? 'done' : 'warn') : undefined;
          return (
            <FileCard
              key={j.id}
              name={j.file.name}
              tone={tone}
              thumb={<span className="file__thumb">PDF</span>}
              sub={r ? `${formatBytes(r.originalSize)} → ${formatBytes(r.size)}` : formatBytes(j.file.size)}
              onRemove={() => remove(j.id)}
              removeDisabled={working}
            >
              {j.status === 'working' && <ProgressBar value={j.progress} note={j.note} />}
              {j.status === 'error' && <Notice tone="error">{j.error}</Notice>}
              {r && j.status === 'done' && (
                <div className="result">
                  {r.auto && r.requestedBytes > 0 && !r.unchanged && (
                    <Gauge before={r.originalSize} after={r.size} limit={r.requestedBytes} ok={r.fits} />
                  )}
                  {r.unchanged && r.fits && r.auto && (
                    <Notice tone="ok">
                      <span>
                        <strong>Already under {formatBytes(r.requestedBytes)}.</strong> This PDF is {formatBytes(r.originalSize)}, so we left it as it is.
                      </span>
                    </Notice>
                  )}
                  {r.unchanged && !r.auto && (
                    <Notice>
                      <span>This PDF is already very well compressed, so we kept your original.</span>
                    </Notice>
                  )}
                  {!r.fits && r.auto && r.rasterized && (
                    <Notice tone="warn">
                      <span>
                        <strong>Even with pages turned into pictures, the smallest we can reach is {formatBytes(r.size)}</strong>, over your {formatBytes(r.requestedBytes)} limit. Try a bigger limit.
                      </span>
                    </Notice>
                  )}
                  {!r.fits && r.auto && !r.rasterized && (
                    <Notice tone="warn">
                      <span>
                        <strong>The smallest we can make this PDF is {formatBytes(r.smallestSize ?? r.size)}</strong>, which is over your {formatBytes(r.requestedBytes)} limit. Most of it is text and drawings, and those can’t be shrunk without changing how the PDF works.
                      </span>
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => makeItFit(j.id)} disabled={working}>
                        Make it fit anyway
                      </button>
                      <span className="field__help">Pages become pictures, so you won’t be able to select or search the text afterwards.</span>
                    </Notice>
                  )}
                  {r.rasterized && r.fits && (
                    <Notice>
                      <span>Pages were turned into pictures to reach your limit. The text can no longer be selected.</span>
                    </Notice>
                  )}
                  <div className="result__line">
                    <span className="result__sizes">{formatBytes(r.size)}</span>
                    {percentSmaller(r.originalSize, r.size) && (
                      <span className={`result__badge${r.fits ? '' : ' result__badge--warn'}`}>{percentSmaller(r.originalSize, r.size)}</span>
                    )}
                    {r.label && <span className="field__help">Quality: {r.label}</span>}
                  </div>
                  <div className="result__actions">
                    <button type="button" className="btn btn--fern" onClick={() => downloadBlob(r.blob, r.filename)}>
                      <Icon name="download" size={18} /> {r.fits ? 'Download PDF' : 'Download smallest version'}
                    </button>
                  </div>
                </div>
              )}
            </FileCard>
          );
        })}
      </div>
      {rasterError && <Notice tone="error">{rasterError}</Notice>}

      {!working && (
        <Dropzone
          accept={ACCEPT_PDF}
          multiple
          compact
          onFiles={(f) => {
            setRejected([]);
            add(f);
          }}
          onReject={setRejected}
          title="Add more PDFs"
        />
      )}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}

      {!advanced && <SizeField text={text} unit={unit} onText={setText} onUnit={setUnit} error={text !== '' ? sizeError : ''} />}

      <AdvancedToggle checked={advanced} onChange={setAdvanced}>
        <RangeField
          label="Picture quality"
          value={quality}
          min={10}
          max={95}
          onChange={setQuality}
          format={(n) => `${n}%`}
          ends={['Smaller file', 'Sharper pictures']}
        />
        <div className="field">
          <label className="field__label" htmlFor="dpi">
            Picture sharpness
          </label>
          <select id="dpi" className="select" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            {DPI_CHOICES.map((d) => (
              <option key={d} value={d}>
                {d} dpi{d === 72 ? ' (smallest, for screens)' : d === 150 ? ' (good for most documents)' : d === 300 ? ' (best, for printing)' : ''}
              </option>
            ))}
          </select>
          <p className="field__help">Pictures sharper than this are reduced. Text and drawings are not affected.</p>
        </div>
        <CheckField checked={gray} onChange={setGray} help="Turns colour pictures into black and white. Makes files smaller.">
          Black and white pictures
        </CheckField>
        <CheckField checked={removeMeta} onChange={setRemoveMeta} help="Clears the title, author and other hidden details.">
          Remove author and title details
        </CheckField>
        <p className="field__help">With advanced settings on, your choices are used exactly as set. The size limit above is switched off.</p>
      </AdvancedToggle>

      <div className="stack">
        {working ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={() => { cancel(); rasterCtl.current?.abort(); ghostscript.terminate(); }}>
            Cancel
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={start} disabled={!!sizeError}>
            {anyDone ? 'Compress again' : jobs.length > 1 ? `Compress ${jobs.length} PDFs` : 'Compress PDF'}
          </button>
        )}
        {done.length > 1 && !working && (
          <button type="button" className="btn btn--secondary" onClick={() => downloadZip(done.map((j) => ({ blob: j.result!.blob, filename: j.result!.filename })), 'compressed-pdfs.zip')}>
            <Icon name="download" size={18} /> Download all ({done.length}) as ZIP
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { ghostscript.terminate(); clear(); }} disabled={working}>
          Start over
        </button>
      </div>
      <PrivacyNote />
    </div>
  );
}
