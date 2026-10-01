import type { FontKey } from '../../lib/editor/types';
import { GOOGLE_FONTS } from '../../lib/editor/googleFonts';
import type { ShapeKind } from './ctl';
import { Segmented } from '../ui';

export const INK_COLORS = ['#111827', '#dc2626', '#1c4fd8', '#15803d', '#d97706', '#ffffff'];
export const HIGHLIGHT_COLORS = ['#ffe066', '#86efac', '#fda4af', '#93c5fd', '#fdba74'];

export function Swatches(props: { colors: string[]; value: string; onChange: (c: string) => void; label: string }) {
  return (
    <div className="inks" role="radiogroup" aria-label={props.label}>
      {props.colors.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={props.value.toLowerCase() === c} aria-label={`${props.label} ${c}`} className={`swatch${props.value.toLowerCase() === c ? ' swatch--on' : ''}${c === '#ffffff' ? ' swatch--light' : ''}`} style={{ background: c }} onClick={() => props.onChange(c)} />
      ))}
    </div>
  );
}

export function Stepper(props: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void; unit?: string }) {
  const step = props.step ?? 1;
  const set = (n: number) => props.onChange(Math.min(props.max, Math.max(props.min, Math.round(n * 100) / 100)));
  return (
    <div className="stepper" role="group" aria-label={props.label}>
      <span className="stepper__label">{props.label}</span>
      <button type="button" className="stepper__btn" onClick={() => set(props.value - step)} aria-label={`Smaller ${props.label}`} disabled={props.value <= props.min}>−</button>
      <output className="stepper__val">{props.value}{props.unit ?? ''}</output>
      <button type="button" className="stepper__btn" onClick={() => set(props.value + step)} aria-label={`Bigger ${props.label}`} disabled={props.value >= props.max}>+</button>
    </div>
  );
}

const BUILT_IN: { value: FontKey; label: string }[] = [{ value: 'sans', label: 'Sans-serif' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Typewriter' }];

export function FontPicker(props: { value: FontKey; onChange: (f: FontKey) => void; id: string }) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>Font</label>
      <select id={props.id} className="select" value={props.value} onChange={(e) => props.onChange(e.target.value as FontKey)}>
        <optgroup label="Fast (no download)">
          {BUILT_IN.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </optgroup>
        <optgroup label="More fonts">
          {GOOGLE_FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </optgroup>
      </select>
    </div>
  );
}

export function TextControls(props: { font: FontKey; size: number; color: string; bold: boolean; italic: boolean; onChange: (p: Partial<{ font: FontKey; size: number; color: string; bold: boolean; italic: boolean }>) => void }) {
  return (
    <>
      <FontPicker id="text-font" value={props.font} onChange={(font) => props.onChange({ font })} />
      <Stepper label="Size" value={props.size} min={6} max={96} step={props.size >= 24 ? 4 : 1} onChange={(size) => props.onChange({ size })} />
      <div className="fmt" role="group" aria-label="Style">
        <button type="button" className="fmt__btn" aria-pressed={props.bold} onClick={() => props.onChange({ bold: !props.bold })} aria-label="Bold"><b>B</b></button>
        <button type="button" className="fmt__btn" aria-pressed={props.italic} onClick={() => props.onChange({ italic: !props.italic })} aria-label="Italic"><i>I</i></button>
      </div>
      <Swatches colors={INK_COLORS.slice(0, 5)} value={props.color} label="Text colour" onChange={(color) => props.onChange({ color })} />
    </>
  );
}

export const SHAPES: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'Box' },
  { value: 'ellipse', label: 'Circle' },
  { value: 'line', label: 'Line' },
  { value: 'arrow', label: 'Arrow' },
];
