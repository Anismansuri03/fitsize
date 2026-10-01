import { useState } from 'react';
import { imageWorker } from '../lib/image/imageClient';
import { effectiveTarget, formatBytes, parseSizeValue, percentSmaller, toBytes } from '../lib/fit/units';
import type { Unit } from '../lib/fit/units';
import { baseName, bytesToBlob, downloadBlob } from '../lib/download';
import { downloadZip } from '../lib/downloadZip';
import { useJobs } from './useJobs';
import type { Output } from './useJobs';
import {
  ACCEPT_IMAGES,
  AdvancedToggle,
  Dropzone,
  FileCard,
  Gauge,
  Icon,
  Notice,
  PrivacyNote,
  ProgressBar,
  RangeField,
  Segmented,
  SizeField,
  Thumb,
  useObjectUrl,
} from './ui';

interface ImgOut extends Output {
  width: number;
  height: number;
  originalSize: number;
  unchanged: boolean;
  fits: boolean;
  auto: boolean;
  requestedBytes: number;
  scale?: number;
  wasPng: boolean;
}

type Format = 'same' | 'jpeg' | 'webp';

function ResultThumb({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? <img className="file__thumb" src={url} alt="" /> : null;
}

export default function CompressImageTool(props: { defaultValue?: number; defaultUnit?: Unit }) {
  const { jobs, busy, add, remove, clear, run, cancel } = useJobs<ImgOut>();
  const [text, setText] = useState(String(props.defaultValue ?? 200));
  const [unit, setUnit] = useState<Unit>(props.defaultUnit ?? 'KB');
  const [format, setFormat] = useState<Format>('same');
  const [advanced, setAdvanced] = useState(false);
  const [quality, setQuality] = useState(75);
  const [maxDim, setMaxDim] = useState('');
  const [rejected, setRejected] = useState<string[]>([]);

  const value = parseSizeValue(text);
  const sizeError = !advanced && value === null ? 'Enter a size bigger than 0, for example 200.' : '';
  const anyDone = jobs.some((j) => j.status === 'done');

  const start = (formatOverride?: Format) => {
    const fmt = formatOverride ?? format;
    if (formatOverride) setFormat(formatOverride);
    if (!advanced && value === null) return;
    const requestedBytes = value ? toBytes(value, unit) : 0;
    return run(async (job, { signal, report }) => {
      const res = await imageWorker.compress(
        {
          file: job.file,
          mode: advanced ? 'manual' : 'target',
          requestedBytes,
          targetBytes: effectiveTarget(requestedBytes),
          format: fmt,
          quality,
          maxDim: maxDim ? Math.max(16, Number(maxDim)) : null,
        },
        { signal, onProgress: report },
      );
      const blob = bytesToBlob(res.bytes, res.mime);
      return {
        blob,
        filename: res.unchanged ? job.file.name : `${baseName(job.file.name)}-compressed.${res.ext}`,
        size: blob.size,
        width: res.width,
        height: res.height,
        originalSize: job.file.size,
        unchanged: !!res.unchanged,
        fits: res.fits ?? true,
        auto: !advanced,
        requestedBytes,
        scale: res.scale,
        wasPng: /png/i.test(job.file.type) || /\.png$/i.test(job.file.name),
      };
    });
  };

  const done = jobs.filter((j) => j.status === 'done' && j.result);

  if (jobs.length === 0) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={ACCEPT_IMAGES}
          multiple
          onFiles={(f) => {
            setRejected([]);
            add(f);
          }}
          onReject={setRejected}
          title="Drop your pictures here"
          hint="JPG, PNG, WebP and more. You can choose several at once."
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
          const tone = j.status === 'error' ? 'error' : r ? (r.fits ? 'done' : 'warn') : undefined;
          return (
            <FileCard
              key={j.id}
              name={j.file.name}
              tone={tone}
              thumb={r ? <ResultThumb blob={r.blob} /> : <Thumb file={j.file} label="IMG" />}
              sub={
                r
                  ? `${formatBytes(r.originalSize)} → ${formatBytes(r.size)}  ·  ${r.width} × ${r.height} px`
                  : formatBytes(j.file.size)
              }
              onRemove={() => remove(j.id)}
              removeDisabled={busy}
            >
              {j.status === 'working' && <ProgressBar value={j.progress} note={j.note} />}
              {j.status === 'error' && <Notice tone="error">{j.error}</Notice>}
              {r && (
                <div className="result">
                  {r.auto && r.requestedBytes > 0 && !r.unchanged && (
                    <Gauge before={r.originalSize} after={r.size} limit={r.requestedBytes} ok={r.fits} />
                  )}
                  {r.unchanged && r.fits && r.auto && (
                    <Notice tone="ok">
                      <span>
                        <strong>Already under {formatBytes(r.requestedBytes)}.</strong> This picture is {formatBytes(r.originalSize)}, so we left it as it is.
                      </span>
                    </Notice>
                  )}
                  {r.unchanged && !r.auto && (
                    <Notice>
                      <span>This picture is already very well compressed, so we kept your original.</span>
                    </Notice>
                  )}
                  {!r.fits && (
                    <Notice tone="warn">
                      <span>
                        <strong>We couldn’t get this under {formatBytes(r.requestedBytes)}</strong> without making the picture too small to use. The smallest we reached is {formatBytes(r.size)}. Try a
                        bigger limit, or use the smallest version below.
                      </span>
                    </Notice>
                  )}
                  {r.fits && r.auto && r.wasPng && format === 'same' && r.scale !== undefined && r.scale < 0.97 && (
                    <Notice>
                      <span>
                        PNG pictures can only get this small by losing pixels. JPG usually looks sharper at the same size.
                      </span>
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => start('jpeg')} disabled={busy}>
                        Try as JPG
                      </button>
                    </Notice>
                  )}
                  <div className="result__line">
                    <span className="result__sizes">{formatBytes(r.size)}</span>
                    {percentSmaller(r.originalSize, r.size) && (
                      <span className={`result__badge${r.fits ? '' : ' result__badge--warn'}`}>{percentSmaller(r.originalSize, r.size)}</span>
                    )}
                  </div>
                  <div className="result__actions">
                    <button type="button" className="btn btn--fern" onClick={() => downloadBlob(r.blob, r.filename)}>
                      <Icon name="download" size={18} /> {r.fits ? 'Download' : 'Download smallest version'}
                    </button>
                  </div>
                </div>
              )}
            </FileCard>
          );
        })}
      </div>

      {!busy && (
        <Dropzone
          accept={ACCEPT_IMAGES}
          multiple
          compact
          onFiles={(f) => {
            setRejected([]);
            add(f);
          }}
          onReject={setRejected}
          title="Add more pictures"
        />
      )}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}

      {!advanced && <SizeField text={text} unit={unit} onText={setText} onUnit={setUnit} error={text !== '' ? sizeError : ''} />}

      <div className="field">
        <span className="field__label">Save as</span>
        <Segmented
          label="Save as"
          wide
          value={format}
          onChange={setFormat}
          options={[
            { value: 'same', label: 'Same type' },
            { value: 'jpeg', label: 'JPG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />
      </div>

      <AdvancedToggle checked={advanced} onChange={setAdvanced}>
        <RangeField
          label="Picture quality"
          value={quality}
          min={10}
          max={100}
          onChange={setQuality}
          format={(n) => `${n}%`}
          ends={['Smaller file', 'Sharper picture']}
          help="You choose the quality yourself, so the size isn’t fixed."
        />
        <div className="field">
          <label className="field__label" htmlFor="maxdim">
            Longest side (optional)
          </label>
          <input
            id="maxdim"
            className="input"
            type="number"
            inputMode="numeric"
            min="16"
            placeholder="Keep original size"
            value={maxDim}
            onChange={(e) => setMaxDim(e.target.value)}
          />
          <p className="field__help">Shrink big pictures to at most this many pixels wide or tall.</p>
        </div>
      </AdvancedToggle>

      <div className="stack">
        {busy ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={cancel}>
            Cancel
          </button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={() => start()} disabled={!!sizeError}>
            {anyDone ? 'Compress again' : jobs.length > 1 ? `Compress ${jobs.length} pictures` : 'Compress picture'}
          </button>
        )}
        {done.length > 1 && !busy && (
          <button type="button" className="btn btn--secondary" onClick={() => downloadZip(done.map((j) => ({ blob: j.result!.blob, filename: j.result!.filename })), 'compressed-pictures.zip')}>
            <Icon name="download" size={18} /> Download all ({done.length}) as ZIP
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { imageWorker.terminate(); clear(); }} disabled={busy}>
          Start over
        </button>
      </div>
      <PrivacyNote />
    </div>
  );
}
