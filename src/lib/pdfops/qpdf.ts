// Main-thread handle to the qpdf worker (public/engine/qpdf-worker.js).
import { WorkerClient } from '../worker-rpc';
import type { CallOptions } from '../worker-rpc';
import { classifyFailure, inName, isSuccess } from './qpdfArgs';
import type { FailureKind } from './qpdfArgs';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const client = new WorkerClient(() => new Worker(`${BASE}engine/qpdf-worker.js`));

export class QpdfError extends Error {
  constructor(public kind: FailureKind, message: string) {
    super(message);
  }
}

const MESSAGES: Record<FailureKind, string> = {
  password: 'This PDF is protected with a password. Use “Unlock PDF” first, then try again.',
  damaged: 'We couldn’t read this PDF. It may be damaged. Try “Repair PDF” first.',
  other: 'Something went wrong while working on this PDF. Please try again.',
};

export interface QpdfFile {
  name: string;
  bytes: Uint8Array;
}

export const qpdf = {
  /** Give the worker the PDFs to work on (they are called in.pdf, in1.pdf, in2.pdf ...). */
  async load(pdfs: Uint8Array[], o?: CallOptions) {
    const files = pdfs.map((b, i) => ({ name: inName(i), data: b.slice().buffer }));
    await client.call('load', { files }, { ...o, transfer: files.map((f) => f.data) });
  },
  /** Run qpdf. Returns every output file (out.pdf, or out-*.pdf when splitting). */
  async run(args: string[], o: CallOptions = {}): Promise<{ files: QpdfFile[]; fixed: boolean }> {
    const r = await client.call<{ code: number; logs: string[]; outs: QpdfFile[] }>('run', { args, prefix: 'out' }, o);
    if (!isSuccess(r.code) || !r.outs.length) throw new QpdfError(classifyFailure(r.logs.join('\n')), MESSAGES[classifyFailure(r.logs.join('\n'))]);
    return { files: r.outs.sort((a, b) => a.name.localeCompare(b.name)), fixed: r.code === 3 };
  },
  terminate: () => client.terminate(),
};
