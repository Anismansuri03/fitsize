import { downloadBlob } from './download';
import { makeZip } from './zip';

export async function downloadZip(items: { blob: Blob; filename: string }[], zipName: string) {
  const entries = await Promise.all(
    items.map(async (i) => ({ name: i.filename, data: new Uint8Array(await i.blob.arrayBuffer()) })),
  );
  downloadBlob(new Blob([makeZip(entries) as BlobPart], { type: 'application/zip' }), zipName);
}
