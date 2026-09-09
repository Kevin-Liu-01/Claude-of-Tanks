import { unpackWreckBake, type WreckBakeWire } from './wreckBakeWire.ts';
import type { WreckBake, WreckOptions } from './wrecks.ts';

export interface WreckBakeRequest {
  requestId: number;
  specId: string;
  options: WreckOptions;
}

export type WreckBakeReply =
  | { requestId: number; ok: true; wire: WreckBakeWire | null }
  | { requestId: number; ok: false; message: string };

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;

export interface WreckBakeClient {
  prepare(): void;
  bake(specId: string, options: WreckOptions, checkpoint: () => Promise<void> | void): Promise<WreckBake | null>;
  dispose(): void;
}

/** One lazy worker per map construction, never a retained fleet-wide cache. */
export function createWreckBakeClient(
  makeWorker: () => WorkerPort = () => new Worker(new URL('./wreckBakeWorker.ts', import.meta.url), {
    type: 'module', name: 'cot-static-wreck-bake',
  }),
  timeoutMs = 30_000,
): WreckBakeClient {
  let worker: WorkerPort | null = null;
  let disposed = false;
  let busy = false;
  let serial = 0;
  let cancelPending: (() => void) | null = null;
  let startupError: Error | null = null;
  const stopWorker = (): void => {
    if (!worker) return;
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  };
  return {
    prepare() {
      if (disposed) throw new Error('Wreck worker disposed');
      if (worker) return;
      worker = makeWorker();
      // Start common module transfer while ordinary structures are prepared.
      // No donor is built or speculatively selected by this early startup.
      worker.onerror = event => {
        startupError = new Error(event.message || 'Wreck worker startup failed');
        stopWorker();
      };
      worker.onmessageerror = () => {
        startupError = new Error('Wreck worker startup transfer failed');
        stopWorker();
      };
    },
    async bake(specId, options, checkpoint) {
      if (disposed) throw new Error('Wreck worker disposed');
      if (busy) throw new Error('Wreck worker accepts one bake at a time');
      busy = true;
      const requestId = ++serial;
      let reply: WreckBakeReply | null = null;
      let error: Error | null = null;
      let wake: (() => void) | null = null;
      const fail = (message: string): void => { error = new Error(message); wake?.(); };
      cancelPending = () => fail('Wreck worker disposed');
      const started = performance.now();
      try {
        if (startupError) {
          const failure = startupError;
          startupError = null;
          throw failure;
        }
        worker ??= makeWorker();
        worker.onmessage = (event: MessageEvent<WreckBakeReply>) => {
          if (event.data?.requestId !== requestId) return;
          reply = event.data;
          wake?.();
        };
        worker.onerror = event => fail(event.message || 'Wreck worker failed');
        worker.onmessageerror = () => fail('Wreck worker transfer failed');
        worker.postMessage({ requestId, specId, options } satisfies WreckBakeRequest);
        // Real tasks, not a Promise-only spin. The unchanged-fraction callback
        // checks map ownership, cancellation and foreground/background pacing.
        // Keep the wire unhydrated until the final check so cancellation cannot
        // strand an off-tree BufferGeometry while the scheduler is awaiting.
        while (!reply && !error) {
          await new Promise<void>(resolve => {
            const finish = (): void => { clearTimeout(timer); wake = null; resolve(); };
            const timer = setTimeout(finish, 30);
            wake = finish;
          });
          await checkpoint();
          if (!reply && !error && performance.now() - started >= timeoutMs) {
            fail('Wreck worker timed out');
          }
        }
        if (error) throw error;
        if (disposed) throw new Error('Wreck worker disposed');
        // Event handlers set this value across await boundaries.
        const result = reply as WreckBakeReply | null;
        if (!result) throw new Error('Wreck worker returned no result');
        if (!result.ok) throw new Error(result.message);
        return result.wire ? unpackWreckBake(result.wire) : null;
      } catch (failure) {
        stopWorker();
        throw failure;
      } finally {
        cancelPending = null;
        if (worker) worker.onmessage = worker.onerror = worker.onmessageerror = null;
        busy = false;
      }
    },
    dispose() {
      disposed = true;
      cancelPending?.();
      stopWorker();
    },
  };
}
