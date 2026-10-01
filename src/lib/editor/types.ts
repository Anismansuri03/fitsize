// Everything the editor knows about a document, as plain data.
// Positions are in PDF points (1/72 inch), measured from the top-left of the page as it is DISPLAYED
// (after any rotation). That keeps the screen and the saved PDF in agreement.

// The 3 built-in ones need no download and render instantly (used for most everyday text).
// The rest are real Google Fonts: same trick, but fetched and embedded only when actually used.
export type FontKey = 'sans' | 'serif' | 'mono' | 'inter' | 'roboto' | 'poppins' | 'playfair' | 'merriweather' | 'caveat';

interface Base {
  id: string;
  pageId: string;
  x: number;
  y: number;
}

export interface TextAnn extends Base {
  type: 'text';
  text: string;
  size: number;
  color: string;
  font: FontKey;
  bold: boolean;
  italic: boolean;
  w: number;
  h: number;
}

export interface ImageAnn extends Base {
  type: 'image';
  w: number;
  h: number;
  bytes: Uint8Array;
  mime: 'image/png' | 'image/jpeg';
}

export type BoxVariant = 'rect' | 'ellipse' | 'highlight' | 'whiteout' | 'redact';

export interface BoxAnn extends Base {
  type: 'box';
  variant: BoxVariant;
  w: number;
  h: number;
  stroke: string | null;
  fill: string | null;
  strokeWidth: number;
  opacity: number;
}

/** Freehand lines, arrows and tick/cross marks: strokes in a local w0 x h0 box that can be scaled. */
export interface VectorAnn extends Base {
  type: 'vector';
  w: number;
  h: number;
  w0: number;
  h0: number;
  paths: [number, number][][];
  color: string;
  width: number;
}

export type Annot = TextAnn | ImageAnn | BoxAnn | VectorAnn;

export interface PageRef {
  id: string;
  /** Which opened PDF this page comes from, or -1 for a blank page. */
  src: number;
  /** Zero-based page number inside that PDF. */
  index: number;
  /** The rotation the page already had. */
  baseRot: number;
  /** Extra rotation the person added (0, 90, 180, 270). */
  rot: number;
  /** Displayed size in points when rot = 0 (baseRot already applied). */
  w: number;
  h: number;
}

export interface Doc {
  pages: PageRef[];
  annots: Annot[];
}

export const pageSize = (p: PageRef) => (p.rot % 180 === 0 ? { w: p.w, h: p.h } : { w: p.h, h: p.w });
