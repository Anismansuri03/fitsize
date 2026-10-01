import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { icons } from '../data/icons';
import type { IconName } from '../data/icons';
import { formatBytes } from '../lib/fit/units';
import type { Unit } from '../lib/fit/units';

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}

/* ---------- Dropzone ---------- */

export const ACCEPT_PDF = 'application/pdf,.pdf';
export const ACCEPT_IMAGES =
  'image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp,.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.heic,.heif';

export function matchesAccept(file: File, accept: string): boolean {
  const name = file.name.toLowerCase();
  return accept.split(',').some((raw) => {
    const t = raw.trim().toLowerCase();
    if (!t) return false;
    if (t.startsWith('.')) return name.endsWith(t);
    if (t.endsWith('/*')) return file.type.toLowerCase().startsWith(t.slice(0, -1));
    return file.type.toLowerCase() === t;
  });
}

export function Dropzone(props: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onReject?: (names: string[]) => void;
  title: string;
  hint?: string;
  buttonLabel?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { accept, multiple, onFiles, onReject, title, hint, buttonLabel = 'Choose file', compact, disabled } = props;
  const [over, setOver] = useState(false);

  const handle = (list: FileList | File[]) => {
    const all = Array.from(list);
    const good = all.filter((f) => matchesAccept(f, accept));
    const bad = all.filter((f) => !matchesAccept(f, accept));
    if (bad.length) onReject?.(bad.map((f) => f.name));
    if (good.length) onFiles(multiple ? good : good.slice(0, 1));
  };

  return (
    <label
      className={`drop${over ? ' drop--over' : ''}${compact ? ' drop--compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
    >
      <input
        className="sr-only"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files) handle(e.target.files);
          e.target.value = ''; // allow picking the same file again
        }}
      />
      <span className="drop__icon" aria-hidden="true">
        <Icon name={compact ? 'plus' : 'upload'} size={compact ? 18 : 26} />
      </span>
      <span className="drop__title">{title}</span>
      {!compact && hint && <span className="drop__hint">{hint}</span>}
      {!compact && (
        <span className="btn btn--primary drop__btn" aria-hidden="true">
          {buttonLabel}
        </span>
      )}
    </label>
  );
}

/* ---------- Form pieces ---------- */

export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  wide?: boolean;
}) {
  const name = useId();
  return (
    <div className={`seg${props.wide ? ' seg--wide' : ''}`} role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <label key={o.value} className="seg__opt">
          <input type="radio" name={name} value={o.value} checked={props.value === o.value} onChange={() => props.onChange(o.value)} />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

const SIZE_CHIPS: { value: number; unit: Unit }[] = [
  { value: 100, unit: 'KB' },
  { value: 200, unit: 'KB' },
  { value: 500, unit: 'KB' },
  { value: 1, unit: 'MB' },
  { value: 2, unit: 'MB' },
];

/** "Make it smaller than [ 200 ] [KB | MB]" */
export function SizeField(props: {
  text: string;
  unit: Unit;
  onText: (t: string) => void;
  onUnit: (u: Unit) => void;
  error?: string;
  label?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label ?? 'Make it smaller than'}
      </label>
      <div className="size-row">
        <input
          id={id}
          className="input"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={props.text}
          onChange={(e) => props.onText(e.target.value)}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${id}-err` : undefined}
        />
        <Segmented
          label="Unit"
          value={props.unit}
          options={[
            { value: 'KB', label: 'KB' },
            { value: 'MB', label: 'MB' },
          ]}
          onChange={props.onUnit}
        />
      </div>
      <div className="chips" role="group" aria-label="Common sizes">
        {SIZE_CHIPS.map((c) => (
          <button
            key={`${c.value}${c.unit}`}
            type="button"
            className="chip"
            aria-pressed={Number(props.text) === c.value && props.unit === c.unit}
            onClick={() => {
              props.onText(String(c.value));
              props.onUnit(c.unit);
            }}
          >
            {c.value} {c.unit}
          </button>
        ))}
      </div>
      {props.error && (
        <p id={`${id}-err`} className="field__error" role="alert">
          {props.error}
        </p>
      )}
    </div>
  );
}

export function AdvancedToggle(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        Advanced settings
      </label>
      {props.checked && <div className="advanced">{props.children}</div>}
    </div>
  );
}

export function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
  ends?: [string, string];
  help?: string;
}) {
  const id = useId();
  return (
    <div className="range">
      <div className="range__top">
        <label className="field__label" htmlFor={id}>
          {props.label}
        </label>
        <span className="range__value">{props.format ? props.format(props.value) : props.value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      {props.ends && (
        <div className="range__ends">
          <span>{props.ends[0]}</span>
          <span>{props.ends[1]}</span>
        </div>
      )}
      {props.help && <p className="field__help">{props.help}</p>}
    </div>
  );
}

export function CheckField(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; help?: string }) {
  return (
    <div className="field">
      <label className="check check--plain">
        <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
        {props.children}
      </label>
      {props.help && <p className="field__help">{props.help}</p>}
    </div>
  );
}

/* ---------- Feedback ---------- */

export function ProgressBar({ value, note }: { value?: number; note?: string }) {
  const pct = value === undefined ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="progress__note">
        <span>{note ?? 'Working…'}</span>
        {pct !== undefined && <span>{pct}%</span>}
      </div>
      <div
        className={`progress__bar${pct === undefined ? ' progress__bar--indeterminate' : ''}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="progress__fill" style={pct === undefined ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Notice(props: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  const tone = props.tone ?? 'info';
  const icon: IconName = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <div className={`notice${tone === 'info' ? '' : ` notice--${tone}`}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon} size={20} />
      <div className="notice__body">{props.children}</div>
    </div>
  );
}

/** The signature element: how big it was, how big it is now, and where your limit sits. */
export function Gauge(props: { before: number; after: number; limit: number; ok: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const max = props.limit * 1.4;
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  return (
    <div
      className="gauge"
      role="img"
      aria-label={`Before ${formatBytes(props.before)}. After ${formatBytes(props.after)}. Your limit is ${formatBytes(props.limit)}.`}
    >
      <span className="gauge__label g-l1">Before</span>
      <div className="gauge__track g-t1">
        <div className="gauge__bar gauge__bar--before" style={{ width: shown ? pct(props.before) : 0 }} />
        {props.before > max && <span className="gauge__cut" />}
      </div>
      <span className="gauge__value g-v1">{formatBytes(props.before)}</span>
      <span className="gauge__label g-l2">After</span>
      <div className="gauge__track g-t2">
        <div className={`gauge__bar ${props.ok ? 'gauge__bar--ok' : 'gauge__bar--warn'}`} style={{ width: shown ? pct(props.after) : 0 }} />
      </div>
      <span className="gauge__value g-v2">{formatBytes(props.after)}</span>
      <div className="gauge__limit">
        <span>Limit {formatBytes(props.limit)}</span>
      </div>
    </div>
  );
}

/* ---------- Files ---------- */

export function useObjectUrl(blob: Blob | null | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

export function Thumb({ file, label }: { file: Blob; label?: string }) {
  const url = useObjectUrl(file);
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="file__thumb">{label ?? ''}</span>;
  return <img className="file__thumb" src={url} alt="" onError={() => setFailed(true)} />;
}

export function FileCard(props: {
  name: string;
  sub?: ReactNode;
  thumb?: ReactNode;
  tone?: 'done' | 'warn' | 'error';
  onRemove?: () => void;
  removeDisabled?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`file${props.tone ? ` file--${props.tone}` : ''}`}>
      <div className="file__head">
        {props.thumb}
        <div className="file__meta">
          <div className="file__name" title={props.name}>
            {props.name}
          </div>
          {props.sub && <div className="file__sub">{props.sub}</div>}
        </div>
        <div className="file__actions">
          {props.actions}
          {props.onRemove && (
            <button type="button" className="icon-btn" onClick={props.onRemove} disabled={props.removeDisabled} aria-label={`Remove ${props.name}`}>
              <Icon name="x" size={18} />
            </button>
          )}
        </div>
      </div>
      {props.children && <div className="file__body">{props.children}</div>}
    </div>
  );
}

export function PrivacyNote() {
  return (
    <p className="privacy">
      <Icon name="shield" size={18} />
      <span>Your files stay on your device. Nothing is uploaded.</span>
    </p>
  );
}
