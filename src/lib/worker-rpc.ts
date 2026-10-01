// Tiny request/response layer over a Web Worker, with progress and cancel.
// Cancelling terminates the worker (the only way to stop WASM mid-run); the
// next call quietly starts a fresh one.

export interface ProgressInfo {
  /** 0-1, or undefined when the amount of work is not known. */
  progress?: number;
  note?: string;
}

interface Pending {
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: ProgressInfo) => void;
}

export interface CallOptions {
  transfer?: Transferable[];
  onProgress?: (p: ProgressInfo) => void;
  signal?: AbortSignal;
}

export class WorkerClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly create: () => Worker) {}

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = this.create();
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as { id: number; kind: 'progress' | 'done' | 'error'; [k: string]: any };
      const p = this.pending.get(m.id);
      if (!p) return;
      if (m.kind === 'progress') p.onProgress?.({ progress: m.progress, note: m.note });
      else if (m.kind === 'done') {
        this.pending.delete(m.id);
        p.resolve(m.result);
      } else {
        this.pending.delete(m.id);
        p.reject(new Error(m.message || 'Something went wrong.'));
      }
    };
    w.onerror = (e) => {
      const err = new Error(e.message || 'The background worker crashed.');
      this.rejectAll(err);
      this.terminate();
    };
    this.worker = w;
    return w;
  }

  call<T>(op: string, payload: unknown, o: CallOptions = {}): Promise<T> {
    if (o.signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
    const worker = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => {
        this.terminate();
        reject(new DOMException('Cancelled', 'AbortError'));
      };
      o.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        onProgress: o.onProgress,
        resolve: (v) => {
          o.signal?.removeEventListener('abort', onAbort);
          resolve(v);
        },
        reject: (e) => {
          o.signal?.removeEventListener('abort', onAbort);
          reject(e);
        },
      });
      worker.postMessage({ id, op, payload }, o.transfer ?? []);
    });
  }

  private rejectAll(err: unknown) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(new DOMException('Cancelled', 'AbortError'));
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/memory|allocation|out of/i.test(msg))
    return 'This file is too big for your device to handle. Try a smaller file, or use a computer instead of a phone.';
  return msg || 'Something went wrong. Please try again.';
}
