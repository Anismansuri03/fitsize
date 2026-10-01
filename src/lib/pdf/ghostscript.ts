// Main-thread handle to the Ghostscript worker (public/engine/gs-worker.js).
import { WorkerClient } from '../worker-rpc';
import type { CallOptions } from '../worker-rpc';
import { buildGsArgs } from './gsArgs';
import type { GsOptions } from './gsArgs';

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const client = new WorkerClient(() => new Worker(`${BASE}engine/gs-worker.js`));

export const ghostscript = {
  /** Hand the worker a PDF to work on (downloads the engine the first time). */
  async load(pdf: Uint8Array, o?: CallOptions) {
    const copy = pdf.slice().buffer; // keep our own copy; the worker gets its own
    await client.call('load', { pdf: copy }, { ...o, transfer: [copy] });
  },
  async run(options: GsOptions, o?: CallOptions): Promise<Uint8Array> {
    const r = await client.call<{ bytes: Uint8Array }>('run', { args: buildGsArgs(options) }, o);
    return r.bytes;
  },
  /** Run Ghostscript with exactly these arguments (input is /in.pdf, output must be /out.pdf). */
  async runArgs(args: string[], o?: CallOptions): Promise<Uint8Array> {
    const r = await client.call<{ bytes: Uint8Array }>('run', { args }, o);
    return r.bytes;
  },
  terminate: () => client.terminate(),
};
