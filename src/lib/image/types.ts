export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'avif';

export interface ImageResult {
  bytes: Uint8Array;
  mime: string;
  ext: string;
  width: number;
  height: number;
  /** We kept the original because it already met the goal (or was already the smallest). */
  unchanged?: boolean;
  /** For "compress to size": did we get under the limit? */
  fits?: boolean;
  quality?: number;
  scale?: number;
  attempts?: number;
}

export interface CompressPayload {
  file: File;
  mode: 'target' | 'manual';
  /** The size the person asked for, in bytes. */
  requestedBytes?: number;
  /** What we aim for (a little under requestedBytes). */
  targetBytes?: number;
  format: 'same' | 'jpeg' | 'webp';
  /** Manual mode. */
  quality?: number;
  maxDim?: number | null;
}

export interface ResizePayload {
  file: File;
  mode: 'pixels' | 'percent';
  width?: number | null;
  height?: number | null;
  /** Which box the person typed in last (used when the ratio is locked). */
  basis?: 'width' | 'height';
  lock?: boolean;
  percent?: number;
  format: 'same' | ImageFormat;
  quality: number;
}

export interface ConvertPayload {
  file: File;
  format: ImageFormat;
  quality: number;
}
