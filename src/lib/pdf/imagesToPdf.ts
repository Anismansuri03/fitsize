import type { ProgressInfo } from '../worker-rpc';

export type PageSize = 'fit' | 'a4' | 'letter';
export type Margin = 'none' | 'small' | 'big';

const SIZES = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const MARGINS: Record<Margin, number> = { none: 0, small: 24, big: 48 };

interface Prepared {
  kind: 'jpg' | 'png';
  bytes: Uint8Array;
  width: number;
  height: number;
}

async function canvasToJpeg(bitmap: ImageBitmap): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process a picture.'))), 'image/jpeg', 0.92),
  );
  c.width = c.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

async function prepare(file: File): Promise<Prepared> {
  const type = file.type.toLowerCase();
  const raw = new Uint8Array(await file.arrayBuffer());
  let upright: ImageBitmap;
  try {
    upright = await createImageBitmap(file); // respects the photo's rotation
  } catch {
    throw new Error(`We couldn’t open “${file.name}”. It may be damaged, or a format your browser can’t read (like HEIC).`);
  }
  try {
    if (type === 'image/jpeg' || /\.jpe?g$/i.test(file.name)) {
      // Use the original bytes untouched unless the photo is rotated by its metadata.
      const asStored = await createImageBitmap(file, { imageOrientation: 'none' });
      const sameShape = asStored.width === upright.width && asStored.height === upright.height;
      asStored.close();
      if (sameShape) return { kind: 'jpg', bytes: raw, width: upright.width, height: upright.height };
    } else if (type === 'image/png' || /\.png$/i.test(file.name)) {
      return { kind: 'png', bytes: raw, width: upright.width, height: upright.height };
    }
    return { kind: 'jpg', bytes: await canvasToJpeg(upright), width: upright.width, height: upright.height };
  } finally {
    upright.close();
  }
}

export async function imagesToPdf(
  files: File[],
  o: { pageSize: PageSize; margin: Margin; onProgress?: (p: ProgressInfo) => void },
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const m = MARGINS[o.margin];

  for (let i = 0; i < files.length; i++) {
    o.onProgress?.({ progress: i / files.length, note: `Adding picture ${i + 1} of ${files.length}…` });
    let prep = await prepare(files[i]);
    let img;
    try {
      img = prep.kind === 'png' ? await doc.embedPng(prep.bytes) : await doc.embedJpg(prep.bytes);
    } catch {
      // Unusual PNG/JPEG variants: convert through the browser and try again.
      const bmp = await createImageBitmap(files[i]);
      prep = { kind: 'jpg', bytes: await canvasToJpeg(bmp), width: bmp.width, height: bmp.height };
      bmp.close();
      img = await doc.embedJpg(prep.bytes);
    }

    let pageW: number;
    let pageH: number;
    if (o.pageSize === 'fit') {
      let k = 72 / 150; // treat pictures as 150 dpi
      const longest = Math.max(prep.width, prep.height) * k;
      if (longest > 1400) k *= 1400 / longest;
      pageW = prep.width * k + m * 2;
      pageH = prep.height * k + m * 2;
    } else {
      const [w, h] = SIZES[o.pageSize];
      const landscape = prep.width > prep.height;
      pageW = landscape ? h : w;
      pageH = landscape ? w : h;
    }
    const availW = Math.max(10, pageW - m * 2);
    const availH = Math.max(10, pageH - m * 2);
    const fit = Math.min(availW / prep.width, availH / prep.height);
    const drawW = prep.width * fit;
    const drawH = prep.height * fit;
    const page = doc.addPage([pageW, pageH]);
    page.drawImage(img, { x: (pageW - drawW) / 2, y: (pageH - drawH) / 2, width: drawW, height: drawH });
  }
  o.onProgress?.({ progress: 0.98, note: 'Saving the PDF…' });
  return doc.save({ useObjectStreams: true });
}
