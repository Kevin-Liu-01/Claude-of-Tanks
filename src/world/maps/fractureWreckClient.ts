// src/world/maps/fractureWreckClient.ts — (the destructible-kits lane, 2026-10-11) the page's side of the wreck worker
// (fractureWreckWorker.ts): one lazy worker per world, one job in flight, the reply unwrapped without a pass over its
// vertices (fractureWreckWire.ts). props.ts warms its deferred broken pools through it once the battle runs and disposes
// it when every pool is built or the world goes. A worker that fails, falls silent past `timeoutMs` or is disposed
// rejects the job in flight; the pool then builds its wreck on the page when a copy first breaks.
import type * as THREE from 'three';
import { unpackFractureWreck, type FractureWreckWire } from './fractureWreckWire.ts';
import type { FractureWreckJob } from './fractureWreckJob.ts';

export interface FractureWreckRequest { requestId: number; job: FractureWreckJob }

export type FractureWreckReply =
  | { requestId: number; ok: true; wire: FractureWreckWire }
  | { requestId: number; ok: false; message: string };

type WorkerPort = Pick<Worker, 'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'>;

export interface FractureWreckClient {
  /** One job at a time: resolves with the wreck; rejects when the worker fails, falls silent or is disposed. */
  build(job: FractureWreckJob): Promise<THREE.BufferGeometry>;
  dispose(): void;
}

interface Pending {
  requestId: number;
  resolve(geometry: THREE.BufferGeometry): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export function createFractureWreckClient(
  makeWorker: () => WorkerPort = () => new Worker(new URL('./fractureWreckWorker.ts', import.meta.url), {
    type: 'module', name: 'cot-fracture-wreck',
  }),
  timeoutMs = 30_000,
): FractureWreckClient {
  let worker: WorkerPort | null = null;
  let pending: Pending | null = null;
  let serial = 0;
  let disposed = false;
  const stop = (): void => {
    if (!worker) return;
    worker.onmessage = worker.onerror = worker.onmessageerror = null;
    worker.terminate();
    worker = null;
  };
  const fail = (message: string): void => {
    const job = pending;
    pending = null;
    stop();
    if (job) { clearTimeout(job.timer); job.reject(new Error(message)); }
  };
  return {
    build(job) {
      if (disposed) return Promise.reject(new Error('Fracture wreck worker disposed'));
      if (pending) return Promise.reject(new Error('Fracture wreck worker builds one wreck at a time'));
      return new Promise<THREE.BufferGeometry>((resolve, reject) => {
        const requestId = ++serial;
        let port: WorkerPort;
        try {
          port = worker ??= makeWorker();
        } catch (error) {
          reject(error instanceof Error ? error : new Error('Fracture wreck worker failed to start'));
          return;
        }
        pending = { requestId, resolve, reject, timer: setTimeout(() => fail('Fracture wreck worker timed out'), timeoutMs) };
        port.onmessage = (event: MessageEvent<FractureWreckReply>) => {
          const reply = event.data;
          if (!pending || reply?.requestId !== pending.requestId) return;
          const done = pending;
          pending = null;
          clearTimeout(done.timer);
          if (!reply.ok) { stop(); done.reject(new Error(reply.message)); return; }
          try {
            done.resolve(unpackFractureWreck(reply.wire));
          } catch (error) {
            done.reject(error instanceof Error ? error : new Error('Fracture wreck reply unreadable'));
          }
        };
        port.onerror = (event) => fail(event.message || 'Fracture wreck worker failed');
        port.onmessageerror = () => fail('Fracture wreck worker transfer failed');
        port.postMessage({ requestId, job } satisfies FractureWreckRequest);
      });
    },
    dispose() {
      disposed = true;
      fail('Fracture wreck worker disposed');
    },
  };
}
