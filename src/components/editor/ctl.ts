import type { Action } from '../../lib/editor/history';
import type { Annot, FontKey } from '../../lib/editor/types';
import type { Pt } from '../../lib/editor/geometry';

export type ToolId = 'select' | 'text' | 'draw' | 'highlight' | 'shape' | 'stamp' | 'whiteout' | 'redact';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';

export interface TextStyle {
  font: FontKey;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
}

export interface DragState {
  start: Pt;
  cur: Pt;
  pts: Pt[];
}

/** Everything a page needs from the editor. */
export interface Ctl {
  tool: ToolId;
  shape: ShapeKind;
  zoom: number;
  pen: { color: string; width: number };
  hl: string;
  shapeStyle: { color: string; width: number; fill: boolean };
  selectedId: string | null;
  editing: { id: string; isNew: boolean } | null;
  scrollEl: HTMLElement | null;
  dispatch: (a: Action) => void;
  select: (id: string | null) => void;
  beginText: (pageId: string, x: number, y: number) => void;
  editText: (id: string) => void;
  setText: (id: string, text: string) => void;
  finishEdit: (id: string) => void;
  placeStamp: (pageId: string, at: Pt) => void;
  finishDrag: (pageId: string, d: DragState) => void;
  remove: (id: string) => void;
  registerEl: (pageId: string, el: HTMLElement | null) => void;
}

export type { Annot };
