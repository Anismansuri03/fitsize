import { useState } from 'react';
import { imageWorker } from '../lib/image/imageClient';
import type { ImageFormat } from '../lib/image/types';
import { formatBytes } from '../lib/fit/units';
import { baseName, bytesToBlob, downloadBlob } from '../lib/download';
import { downloadZip } from '../lib/downloadZip';
import { useJobs } from './useJobs';
import type { Output } from './useJobs';
import {
  ACCEPT_IMAGES,
  AdvancedToggle,
  Dropzone,
  FileCard,
  Icon,
  Notice,
  PrivacyNote,
  ProgressBar,
  RangeField,
  Segmented,
  Thumb,
  useObjectUrl,
} from './ui';

interface ConvOut extends Output {
  width: number;
  height: number;
  originalSize: number;
  label: string;
}

const LABELS: Record<ImageFormat, string> = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', avif: 'AVIF' };
const DEFAULT_QUALITY: Record<ImageFormat, number> = { jpeg: 90, png: 100, webp: 88, avif: 60 };

function ResultThumb({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? <img className="file__thumb" src={url} alt="" /> : null;
}

export default function ConvertImageTool(props: { defaultFormat?: ImageFormat }) {
  const { jobs, busy, add, remove, clear, run, cancel } = useJobs<ConvOut>();
  const [format, setFormat] = useState<ImageFormat>(props.defaultFormat ?? 'jpeg');
  const [advanced, setAdvanced] = useState(false);
  const [quality, setQuality] = useState(DEFAULT_QUALITY[props.defaultFormat ?? 'jpeg']);
  const [rejected, setRejected] = useState<string[]>([]);
  const done = jobs.filter((j) => j.status === 'done' && j.result);
  const anyDone = done.length > 0;

  const pickFormat = (f: ImageFormat) => {
    setFormat(f);
    setQuality(DEFAULT_QUALITY[f]);
  };

  const start = () =>
    run(async (job, { signal, report }) => {
      const res = await imageWorker.convert({ file: job.file, format, quality: advanced ? quality : DEFAULT_QUALITY[format] }, { signal, onProgress: report });
      const blob = bytesToBlob(res.bytes, res.mime);
      return {
        blob,
        filename: `${baseName(job.file.name)}.${res.ext}`,
        size: blob.size,
        width: res.width,
        height: res.height,
        originalSize: job.file.size,
        label: LABELS[format],
      };
    });

  if (jobs.length === 0) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={ACCEPT_IMAGES}
          multiple
          onFiles={(f) => { setRejected([]); add(f); }}
          onReject={setRejected}
          title="Drop your pictures here"
          hint="JPG, PNG, WebP, AVIF, GIF and BMP. You can choose several at once."
          buttonLabel="Choose pictures"
        />
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  return (
    <div className="panel stack">
      <div className="files">
        {jobs.map((j) => {
          const r = j.result;
          return (
            <FileCard
              key={j.id}
              name={r ? r.filename : j.file.name}
              tone={j.status === 'error' ? 'error' : r ? 'done' : undefined}
              thumb={r ? <ResultThumb blob={r.blob} /> : <Thumb file={j.file} label="IMG" />}
              sub={r ? `${formatBytes(r.originalSize)} → ${formatBytes(r.size)}  ·  ${r.width} × ${r.height} px` : formatBytes(j.file.size)}
              onRemove={() => remove(j.id)}
              removeDisabled={busy}
            >
              {j.status === 'working' && <ProgressBar value={j.progress} note={j.note} />}
              {j.status === 'error' && <Notice tone="error">{j.error}</Notice>}
              {r && (
                <div className="result__actions">
                  <button type="button" className="btn btn--fern" onClick={() => downloadBlob(r.blob, r.filename)}>
                    <Icon name="download" size={18} /> Download {r.label}
                  </button>
                </div>
              )}
            </FileCard>
          );
        })}
      </div>

      {!busy && <Dropzone accept={ACCEPT_IMAGES} multiple compact onFiles={(f) => { setRejected([]); add(f); }} onReject={setRejected} title="Add more pictures" />}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}

      <div className="field">
        <span className="field__label">Convert to</span>
        <Segmented
          label="Convert to"
          wide
          value={format}
          onChange={pickFormat}
          options={[
            { value: 'jpeg', label: 'JPG' },
            { value: 'png', label: 'PNG' },
            { value: 'webp', label: 'WebP' },
            { value: 'avif', label: 'AVIF' },
          ]}
        />
        {format === 'jpeg' && <p className="field__help">JPG can’t be see-through. Transparent areas turn white.</p>}
        {format === 'png' && <p className="field__help">PNG keeps every detail and see-through areas. Files are bigger.</p>}
        {format === 'webp' && <p className="field__help">WebP is small and works in all modern browsers and apps.</p>}
        {format === 'avif' && <p className="field__help">AVIF gives the smallest files, but some older apps can’t open it, and it takes longer to make.</p>}
      </div>

      {format !== 'png' && (
        <AdvancedToggle checked={advanced} onChange={setAdvanced}>
          <RangeField label="Picture quality" value={quality} min={10} max={100} onChange={setQuality} format={(n) => `${n}%`} ends={['Smaller file', 'Sharper picture']} />
        </AdvancedToggle>
      )}

      <div className="stack">
        {busy ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={cancel}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={start}>
            {anyDone ? `Convert again to ${LABELS[format]}` : jobs.length > 1 ? `Convert ${jobs.length} pictures to ${LABELS[format]}` : `Convert to ${LABELS[format]}`}
          </button>
        )}
        {done.length > 1 && !busy && (
          <button type="button" className="btn btn--secondary" onClick={() => downloadZip(done.map((j) => ({ blob: j.result!.blob, filename: j.result!.filename })), `converted-${format}.zip`)}>
            <Icon name="download" size={18} /> Download all ({done.length}) as ZIP
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { imageWorker.terminate(); clear(); }} disabled={busy}>Start over</button>
      </div>
      <PrivacyNote />
    </div>
  );
}
