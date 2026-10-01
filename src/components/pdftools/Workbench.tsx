import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { countPages } from '../../lib/pdf/pdfToImages';
import { formatBytes } from '../../lib/fit/units';
import { bytesToBlob, downloadBlob } from '../../lib/download';
import { downloadZip } from '../../lib/downloadZip';
import { friendlyError, isAbort } from '../../lib/worker-rpc';
import type { ProgressInfo } from '../../lib/worker-rpc';
import { ACCEPT_PDF, Dropzone, FileCard, Icon, Notice, PrivacyNote, ProgressBar } from '../ui';

export interface OutFile {
  name: string;
  bytes: Uint8Array;
  mime?: string;
}
export interface Item {
  id: string;
  file: File;
  /** null while we are counting, or when the PDF can't be read (e.g. it is locked). */
  pages: number | null;
}
export interface RunCtx {
  signal: AbortSignal;
  report: (p: ProgressInfo) => void;
}

interface Props {
  dropTitle: string;
  dropHint?: string;
  dropButton?: string;
  multiple?: boolean;
  reorder?: boolean;
  /** Fewest files needed before the button works. */
  min?: number;
  countPages?: boolean;
  accept?: string;
  action: (items: Item[]) => string;
  /** Return a message if the current options can't be run yet. */
  problem?: (items: Item[]) => string | null;
  options?: (items: Item[]) => ReactNode;
  process: (items: Item[], ctx: RunCtx) => Promise<OutFile[]>;
  next?: { href: string; label: string }[];
  zipName?: string;
  onCancel?: () => void;
  result?: (outs: OutFile[]) => ReactNode;
}

let seq = 0;
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

export default function Workbench(props: Props) {
  const { multiple, reorder, min = 1, countPages: doCount = true } = props;
  const [items, setItems] = useState<Item[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressInfo>({});
  const [outs, setOuts] = useState<OutFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const add = (files: File[]) => {
    setRejected([]);
    setOuts(null);
    setError(null);
    const fresh = files.map<Item>((file) => ({ id: `w${++seq}`, file, pages: null }));
    setItems((cur) => (multiple ? [...cur, ...fresh] : fresh));
    if (doCount) {
      fresh.forEach((it) =>
        countPages(it.file)
          .then((n) => setItems((cur) => cur.map((c) => (c.id === it.id ? { ...c, pages: n } : c))))
          .catch(() => { /* locked or damaged: the tool itself will explain */ }),
      );
    }
  };

  useEffect(() => () => ctl.current?.abort(), []);

  const move = (id: string, dir: -1 | 1) => {
    setOuts(null);
    setItems((cur) => {
      const i = cur.findIndex((c) => c.id === id);
      const k = i + dir;
      if (i < 0 || k < 0 || k >= cur.length) return cur;
      const next = cur.slice();
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });
  };

  const run = async () => {
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setError(null);
    setOuts(null);
    setProgress({ note: 'Working on it…' });
    try {
      const result = await props.process(items, { signal: c.signal, report: (p) => setProgress((cur) => ({ ...cur, ...p })) });
      setOuts(result);
    } catch (e) {
      if (!isAbort(e)) setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    ctl.current?.abort();
    props.onCancel?.();
  };

  if (items.length === 0) {
    return (
      <div className="panel stack">
        <Dropzone
          accept={props.accept ?? ACCEPT_PDF}
          multiple={multiple}
          onFiles={add}
          onReject={setRejected}
          title={props.dropTitle}
          hint={props.dropHint}
          buttonLabel={props.dropButton ?? 'Choose PDF'}
        />
        {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
        <PrivacyNote />
      </div>
    );
  }

  const problem = props.problem?.(items) ?? null;
  const notEnough = items.length < min;
  const disabled = busy || notEnough || !!problem;

  return (
    <div className="panel stack">
      <div className="files">
        {items.map((it, i) => (
          <FileCard
            key={it.id}
            name={it.file.name}
            thumb={<span className="file__thumb">PDF</span>}
            sub={`${formatBytes(it.file.size)}${it.pages ? `  ·  ${it.pages} page${it.pages === 1 ? '' : 's'}` : ''}`}
            onRemove={() => { setOuts(null); setItems((cur) => cur.filter((c) => c.id !== it.id)); }}
            removeDisabled={busy}
            actions={
              reorder && items.length > 1 ? (
                <>
                  <button type="button" className="icon-btn" aria-label={`Move ${it.file.name} up`} disabled={i === 0 || busy} onClick={() => move(it.id, -1)}><Icon name="up" size={18} /></button>
                  <button type="button" className="icon-btn" aria-label={`Move ${it.file.name} down`} disabled={i === items.length - 1 || busy} onClick={() => move(it.id, 1)}><Icon name="down" size={18} /></button>
                </>
              ) : undefined
            }
          />
        ))}
      </div>

      {multiple && !busy && (
        <Dropzone accept={props.accept ?? ACCEPT_PDF} multiple compact onFiles={add} onReject={setRejected} title="Add more PDFs" />
      )}
      {rejected.length > 0 && <Notice tone="warn">{`We can’t use ${rejected.join(', ')}. Please choose a PDF file.`}</Notice>}
      {notEnough && <p className="field__help">Add at least {min} PDF files.</p>}

      {props.options?.(items)}

      {busy && <ProgressBar value={progress.progress} note={progress.note} />}
      {error && <Notice tone="error">{error}</Notice>}
      {problem && !busy && <p className="field__help" role="status">{problem}</p>}

      {outs && !busy && <ResultView outs={outs} zipName={props.zipName ?? 'files.zip'} next={props.next} extra={props.result?.(outs)} />}

      <div className="stack">
        {busy ? (
          <button type="button" className="btn btn--secondary btn--big" onClick={cancel}>Cancel</button>
        ) : (
          <button type="button" className="btn btn--primary btn--big" onClick={run} disabled={disabled}>
            {outs ? 'Do it again' : props.action(items)}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => { setItems([]); setOuts(null); setError(null); }} disabled={busy}>Start over</button>
      </div>
      <PrivacyNote />
    </div>
  );
}

export function ResultView(props: { outs: OutFile[]; zipName: string; next?: { href: string; label: string }[]; extra?: ReactNode }) {
  const { outs } = props;
  const many = outs.length > 1;
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? outs : outs.slice(0, 6);
  const total = outs.reduce((n, o) => n + o.bytes.byteLength, 0);
  const save = (o: OutFile) => downloadBlob(bytesToBlob(o.bytes, o.mime ?? 'application/pdf'), o.name);

  return (
    <div className="file file--done">
      <div className="result">
        <div className="result__line">
          <span className="result__sizes">{many ? `${outs.length} files ready` : 'Your file is ready'}</span>
          <span className="result__badge">{formatBytes(total)}</span>
        </div>
        {props.extra}
        {many ? (
          <>
            <div className="result__actions">
              <button type="button" className="btn btn--fern" onClick={() => downloadZip(outs.map((o) => ({ blob: bytesToBlob(o.bytes, o.mime ?? 'application/pdf'), filename: o.name })), props.zipName)}>
                <Icon name="download" size={18} /> Download all as ZIP
              </button>
            </div>
            <ul className="outlist">
              {shown.map((o) => (
                <li key={o.name}>
                  <span className="outlist__name" title={o.name}>{o.name}</span>
                  <span className="outlist__size">{formatBytes(o.bytes.byteLength)}</span>
                  <button type="button" className="btn btn--secondary btn--small" onClick={() => save(o)}>Download</button>
                </li>
              ))}
            </ul>
            {outs.length > 6 && <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${outs.length}`}</button>}
          </>
        ) : (
          <div className="result__actions">
            <button type="button" className="btn btn--fern" onClick={() => save(outs[0])}>
              <Icon name="download" size={18} /> Download {outs[0].name.split('.').pop()?.toUpperCase()}
            </button>
          </div>
        )}
        {props.next && props.next.length > 0 && (
          <div className="nextsteps">
            <span className="field__help">What next?</span>
            <div className="related">
              {props.next.map((n) => (<a key={n.href} href={n.href}>{n.label}</a>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
