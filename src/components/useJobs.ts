import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError, isAbort } from '../lib/worker-rpc';
import type { ProgressInfo } from '../lib/worker-rpc';

export interface Output {
  blob: Blob;
  filename: string;
  size: number;
  /** Free anything held by the result (e.g. preview URLs). */
  dispose?: () => void;
}

export interface Job<R extends Output = Output, M = unknown> {
  id: string;
  file: File;
  status: 'ready' | 'working' | 'done' | 'error';
  progress?: number;
  note?: string;
  result?: R;
  error?: string;
  meta?: M;
}

export interface WorkContext {
  signal: AbortSignal;
  report: (p: ProgressInfo) => void;
}

/** A list of files that are processed one after another, with progress and cancel. */
export function useJobs<R extends Output, M = unknown>() {
  const [jobs, setJobs] = useState<Job<R, M>[]>([]);
  const [busy, setBusy] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const patch = useCallback((id: string, p: Partial<Job<R, M>>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }, []);

  const add = useCallback((files: File[], opts: { replace?: boolean } = {}) => {
    setJobs((js) => {
      if (opts.replace) js.forEach((j) => j.result?.dispose?.());
      const fresh = files.map<Job<R, M>>((file) => ({ id: `job-${++seq.current}`, file, status: 'ready' }));
      return opts.replace ? fresh : [...js, ...fresh];
    });
  }, []);

  const remove = useCallback((id: string) => {
    setJobs((js) => {
      js.find((j) => j.id === id)?.result?.dispose?.();
      return js.filter((j) => j.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setJobs((js) => {
      js.forEach((j) => j.result?.dispose?.());
      return [];
    });
  }, []);

  const move = useCallback((id: string, dir: -1 | 1) => {
    setJobs((js) => {
      const i = js.findIndex((j) => j.id === id);
      const k = i + dir;
      if (i < 0 || k < 0 || k >= js.length) return js;
      const next = js.slice();
      [next[i], next[k]] = [next[k], next[i]];
      return next;
    });
  }, []);

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const run = useCallback(
    async (work: (job: Job<R, M>, ctx: WorkContext) => Promise<R>, only?: string[]) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      const targets = jobsRef.current.filter((j) => !only || only.includes(j.id));
      targets.forEach((j) => j.result?.dispose?.());
      setJobs((js) =>
        js.map((j) => (targets.some((t) => t.id === j.id) ? { ...j, status: 'ready', result: undefined, error: undefined, progress: undefined, note: undefined } : j)),
      );
      try {
        for (const job of targets) {
          if (ctrl.signal.aborted) break;
          patch(job.id, { status: 'working', progress: undefined, note: 'Starting…' });
          try {
            const result = await work(job, {
              signal: ctrl.signal,
              report: (p) => patch(job.id, { ...(p.progress !== undefined && { progress: p.progress }), ...(p.note && { note: p.note }) }),
            });
            patch(job.id, { status: 'done', result, progress: 1 });
          } catch (e) {
            if (isAbort(e)) {
              patch(job.id, { status: 'ready', note: undefined, progress: undefined });
              break;
            }
            patch(job.id, { status: 'error', error: friendlyError(e) });
          }
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [patch],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
      jobsRef.current.forEach((j) => j.result?.dispose?.());
    },
    [],
  );

  return { jobs, busy, add, remove, clear, move, run, cancel, patch };
}
