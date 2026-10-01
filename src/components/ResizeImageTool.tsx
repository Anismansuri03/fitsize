import { useEffect, useState } from 'react';
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

interface ResizeOut extends Output {
  width: number;
  height: number;
  originalSize: number;
}
interface Meta {
  width: number;
  height: number;
}

const WIDTH_CHIPS = [640, 1024, 1280, 1920, 3840];

function ResultThumb({ blob }: { blob: Blob }) {
  const url = useObjectUrl(blob);
  return url ? <img className="file__thumb" src={url} alt="" /> : null;
}

export default function ResizeImageTool() {
  const { jobs, busy, add, remove, clear, run, cancel, patch } = useJobs<ResizeOut, Meta>();
  const [mode, setMode] = useState<'pixels' | 'percent'>('pixels');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [basis, setBasis] = useState<'width' | 'height'>('width');
  const [lock, setLock] = useState(true);
  const [percent, setPercent] = useState(50);
  const [advanced, setAdvanced] = useState(false);
  const [format, setFormat] = useState<'same' | ImageFormat>('same');
  const [quality, setQuality] = useState(92);
  const [rejected, setRejected] = useState<string[]>([]);

  // Learn the size of each picture so we can show it and keep the shape.
  useEffect(() => {
    jobs.forEach((j) => {
      if (j.meta) return;
      createImageBitmap(j.file)
        .then((b) => {
          patch(j.id, { meta: { width: b.width, height: b.height } });
          b.close();
        })
        .catch(() => patch(j.id, { meta: { width: 0, height: 0 } }));
    });
  }, [jobs, patch]);

  const first = jobs.find((j) => j.meta && j.meta.width > 0)?.meta;

  // If a width/height was typed before the picture's size was known, fill in the other side now.
  useEffect(() => {
    if (!lock || !first) return;
    if (basis === 'width' && Number(width) > 0) setHeight(String(Math.round((first.height * Number(width)) / first.width)));
    else if (basis === 'height' && Number(height) > 0) setWidth(String(Math.round((first.width * Number(height)) / first.height)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first?.width, first?.height, lock]);

  const onWidth = (v: string) => {
    setWidth(v);
    setBasis('width');
    if (lock && first && Number(v) > 0) setHeight(String(Math.round((first.height * Number(v)) / first.width)));
    else if (lock && !v) setHeight('');
  };
  const onHeight = (v: string) => {
    setHeight(v);
    setBasis('height');
    if (lock && first && Number(v) > 0) setWidth(String(Math.round((first.width * Number(v)) / first.height)));
    else if (lock && !v) setWidth('');
  };

  const invalid = mode === 'pixels' && !(Number(width) > 0 || Number(height) > 0);
  const anyDone = jobs.some((j) => j.status === 'done');
  const done = jobs.filter((j) => j.status === 'done' && j.result);

  const start = () =>
    run(async (job, { signal, report }) => {
      const res = await imageWorker.resize(
        {
          file: job.file,
          mode,
          width: width ? Number(width) : null,
          height: height ? Number(height) : null,
          basis,
          lock,
          percent,
          format: advanced ? format : 'same',
          quality: advanced ? quality : 92,
        },
        { signal, onProgress: report },
      );
      const blob = bytesToBlob(res.bytes, res.mime);
      return {
        blob,
        filename: `${baseName(job.file.name)}-${res.width}x${res.height}.${res.ext}`,
        size: blob.size,
        width: res.width,
        height: res.height,
        originalSize: job.file.size,
      };
    });

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
          return (
            <FileCard
              key={j.id}
              name={j.file.name}
              tone={j.status === 'error' ? 'error' : r ? 'done' : undefined}
              thumb={r ? <ResultThumb blob={r.blob} /> : <Thumb file={j.file} label="IMG" />}
              sub={
                r
                  ? `${j.meta?.width ? `${j.meta.width} × ${j.meta.height}` : ''}  →  ${r.width} × ${r.height} px  ·  ${formatBytes(r.size)}`
                  : `${j.meta?.width ? `${j.meta.width} × ${j.meta.height} px  ·  ` : ''}${formatBytes(j.file.size)}`
              }
              onRemove={() => remove(j.id)}
              removeDisabled={busy}
            >
              {j.status === 'working' && <ProgressBar value={j.progress} note={j.note} />}
              {j.status === 'error' && <Notice tone="error">{j.error}</Notice>}
              {r && (
                <div className="result__actions">
                  <button type="button" className="btn btn--fern" onClick={() => downloadBlob(r.blob, r.filename)}>
                    <Icon name="download" size={18} /> Download
                  </button>
                </div>
              )}
            </FileCard>
          );
        })}
      </div>

      {!busy && (
        <Dropzone accept={ACCEPT_IMAGES} multiple compact onFiles={(f) => { setRejected([]); add(f); }} onReject={setRejected} title="Add more pictures" />
      )}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a picture file.`}</Notice>}

      <div className="field">
        <span className="field__label">Resize by</span>
        <Segmented
          label="Resize by"
          wide
          value={mode}
          onChange={setMode}
          options={[
            { value: 'pixels', label: 'Pixels' },
            { value: 'percent', label: 'Percentage' },
          ]}
        />
      </div>

      {mode === 'pixels' ? (
        <div className="stack">
          <div className="size-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field">
              <label className="field__label" htmlFor="rw">Width (px)</label>
              <input id="rw" className="input" type="number" inputMode="numeric" min="1" value={width} onChange={(e) => onWidth(e.target.value)} placeholder={first ? String(first.width) : ''} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="rh">Height (px)</label>
              <input id="rh" className="input" type="number" inputMode="numeric" min="1" value={height} onChange={(e) => onHeight(e.target.value)} placeholder={first ? String(first.height) : ''} />
            </div>
          </div>
          <label className="check check--plain">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
            Keep the picture’s shape (recommended)
          </label>
          <div className="chips" role="group" aria-label="Common widths">
            {WIDTH_CHIPS.map((w) => (
              <button key={w} type="button" className="chip" aria-pressed={Number(width) === w} onClick={() => { setLock(true); onWidth(String(w)); }}>
                {w} px wide
              </button>
            ))}
          </div>
          {jobs.length > 1 && lock && <p className="field__help">Each picture is resized to your {basis} and keeps its own shape.</p>}
          {invalid && <p className="field__help">Enter a width, a height, or both.</p>}
        </div>
      ) : (
        <RangeField label="Make it" value={percent} min={5} max={200} step={5} onChange={setPercent} format={(n) => `${n}% of the original size`} ends={['5%', '200%']} />
      )}

      <AdvancedToggle checked={advanced} onChange={setAdvanced}>
        <div className="field">
          <span className="field__label">Save as</span>
          <Segmented
            label="Save as"
            wide
            value={format}
            onChange={setFormat}
            options={[
              { value: 'same', label: 'Same' },
              { value: 'jpeg', label: 'JPG' },
              { value: 'png', label: 'PNG' },
              { value: 'webp', label: 'WebP' },
            ]}
          />
        </div>
        <RangeField label="Picture quality" value={quality} min={40} max={100} onChange={setQuality} format={(n) => `${n}%`} ends={['Smaller file', 'Sharper picture']} help="Doesn’t apply to PNG, which is always lossless." />
      </AdvancedToggle>

      <div className="stack">
        {busy ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={cancel}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={start} disabled={invalid}>
            {anyDone ? 'Resize again' : jobs.length > 1 ? `Resize ${jobs.length} pictures` : 'Resize picture'}
          </button>
        )}
        {done.length > 1 && !busy && (
          <button type="button" className="btn btn--secondary" onClick={() => downloadZip(done.map((j) => ({ blob: j.result!.blob, filename: j.result!.filename })), 'resized-pictures.zip')}>
            <Icon name="download" size={18} /> Download all ({done.length}) as ZIP
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { imageWorker.terminate(); clear(); }} disabled={busy}>Start over</button>
      </div>
      <PrivacyNote />
    </div>
  );
}
