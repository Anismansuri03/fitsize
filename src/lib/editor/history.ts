// Undo / redo. `live` changes (dragging, typing) update the document without piling up steps;
// the whole gesture becomes ONE undo step when it ends.
import type { Doc } from './types';

export interface History {
  past: Doc[];
  present: Doc;
  future: Doc[];
  gesture: Doc | null;
}

export type Action =
  | { type: 'do'; fn: (d: Doc) => Doc }
  | { type: 'live'; fn: (d: Doc) => Doc }
  | { type: 'gestureStart' }
  | { type: 'gestureEnd' }
  | { type: 'gestureCancel' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; doc: Doc };

export const MAX_STEPS = 100;

export const emptyHistory = (doc: Doc = { pages: [], annots: [] }): History => ({ past: [], present: doc, future: [], gesture: null });

const push = (past: Doc[], d: Doc) => [...past.slice(-(MAX_STEPS - 1)), d];

export function historyReducer(h: History, a: Action): History {
  switch (a.type) {
    case 'do': {
      const next = a.fn(h.present);
      if (next === h.present) return h;
      return { ...h, past: push(h.past, h.present), present: next, future: [] };
    }
    case 'live':
      return { ...h, present: a.fn(h.present) };
    case 'gestureStart':
      return h.gesture ? h : { ...h, gesture: h.present };
    case 'gestureEnd': {
      if (!h.gesture) return h;
      if (h.gesture === h.present) return { ...h, gesture: null };
      return { ...h, past: push(h.past, h.gesture), future: [], gesture: null };
    }
    case 'gestureCancel':
      return h.gesture ? { ...h, present: h.gesture, gesture: null } : h;
    case 'undo': {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], gesture: null };
    }
    case 'redo': {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return { past: push(h.past, h.present), present: next, future: rest, gesture: null };
    }
    case 'reset':
      return emptyHistory(a.doc);
  }
}
