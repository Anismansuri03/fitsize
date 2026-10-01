// PDF compression: orchestrates the Ghostscript engine and the size search.
import { fitPdf, qualityLabel, settingsForStrength } from '../fit/fitPdf';
import type { PdfSettings, QualityWord } from '../fit/fitPdf';
import type { ProgressInfo } from '../worker-rpc';
import { ghostscript } from './ghostscript';

export interface PdfCompressResult {
  bytes: Uint8Array;
  size: number;
  /** Under the limit the person asked for? (always true in manual mode) */
  fits: boolean;
  /** We kept the original because it already met the goal / could not be improved. */
  unchanged: boolean;
  /** Plain-language quality of the result (auto mode). */
  label?: QualityWord;
  settings?: PdfSettings;
  /** When it does not fit: the smallest size we could reach without rasterising. */
  smallestSize?: number;
}

interface Common {
  signal?: AbortSignal;
  onProgress?: (p: ProgressInfo) => void;
  grayscale?: boolean;
  removeMetadata?: boolean;
}

/** Erase title, author, etc. (and the hidden XMP block) from a PDF. */
export async function scrubMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  doc.setTitle('');
  doc.setAuthor('');
  doc.setSubject('');
  doc.setKeywords([]);
  doc.setCreator('');
  doc.setProducer('');
  doc.catalog.delete(PDFName.of('Metadata'));
  return doc.save({ useObjectStreams: true });
}

async function readAll(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function makeRunner(o: Common) {
  return async (s: PdfSettings): Promise<Uint8Array> => {
    let out = await ghostscript.run({ ...s, gray: o.grayscale }, { signal: o.signal });
    if (o.removeMetadata) out = await scrubMetadata(out);
    return out;
  };
}

/** Simple mode: get the PDF under `targetBytes` with the best quality that fits. */
export async function compressPdfToSize(
  file: File,
  o: Common & { requestedBytes: number; targetBytes: number },
): Promise<PdfCompressResult> {
  const original = await readAll(file);
  if (original.byteLength <= o.requestedBytes && !o.grayscale && !o.removeMetadata) {
    return { bytes: original, size: original.byteLength, fits: true, unchanged: true };
  }

  await ghostscript.load(original, { signal: o.signal, onProgress: o.onProgress });
  const run = makeRunner(o);
  const r = await fitPdf((t) => run(settingsForStrength(t)), {
    targetBytes: o.targetBytes,
    signal: o.signal,
    onAttempt: ({ attempt, expected }) =>
      o.onProgress?.({
        progress: Math.min(0.95, attempt / expected),
        note: attempt === 1 ? 'Checking how small it can go…' : 'Finding the best quality that fits…',
      }),
  });

  if (!r.fits) {
    const smallest = Math.min(r.size, original.byteLength);
    return {
      bytes: r.size <= original.byteLength ? r.bytes : original,
      size: smallest,
      fits: false,
      unchanged: r.size > original.byteLength,
      smallestSize: smallest,
    };
  }
  return {
    bytes: r.bytes,
    size: r.size,
    fits: true,
    unchanged: false,
    label: qualityLabel(r.strength),
    settings: settingsForStrength(r.strength),
  };
}

/** Advanced mode: apply exactly the settings the person chose, once. */
export async function compressPdfManual(
  file: File,
  o: Common & { dpi: number; quality: number },
): Promise<PdfCompressResult> {
  const original = await readAll(file);
  await ghostscript.load(original, { signal: o.signal, onProgress: o.onProgress });
  o.onProgress?.({ note: 'Compressing…' });
  const out = await makeRunner(o)({ dpi: o.dpi, quality: o.quality });
  if (out.byteLength >= original.byteLength) {
    return { bytes: original, size: original.byteLength, fits: true, unchanged: true };
  }
  return { bytes: out, size: out.byteLength, fits: true, unchanged: false, settings: { dpi: o.dpi, quality: o.quality } };
}
