// Main-thread handle to the image worker.
import { WorkerClient } from '../worker-rpc';
import type { CallOptions } from '../worker-rpc';
import type { CompressPayload, ConvertPayload, ImageResult, ResizePayload } from './types';

const client = new WorkerClient(
  () => new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' }),
);

export const imageWorker = {
  compress: (p: CompressPayload, o?: CallOptions) => client.call<ImageResult>('compress', p, o),
  resize: (p: ResizePayload, o?: CallOptions) => client.call<ImageResult>('resize', p, o),
  convert: (p: ConvertPayload, o?: CallOptions) => client.call<ImageResult>('convert', p, o),
  terminate: () => client.terminate(),
};
