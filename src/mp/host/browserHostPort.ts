/**
 * The main thread's port to the host Worker (P2 client lane). `createBrowserHostPort` spawns the Worker as its own
 * lazy chunk (`new URL(..., import.meta.url)`: Vite bundles matchHostWorker.ts and everything it reaches — the actor,
 * the simulation, the fleet builders — separately; nothing of it joins the boot-critical main chunk) and adapts its
 * message events to the `HostPort` shape the host runtime speaks. Browser-only; the receipts use the in-process pair.
 */
import type { HostPort, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';

interface WorkerLike {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  addEventListener(type: 'message' | 'error', listener: (event: { data?: unknown; message?: string }) => void): void;
  removeEventListener(type: 'message' | 'error', listener: (event: { data?: unknown; message?: string }) => void): void;
  terminate(): void;
}

/** Wrap a Worker (or anything with its message surface) as the host runtime's port. */
export function workerHostPort(worker: WorkerLike): HostPort<HostToWorkerMessage, WorkerToHostMessage> {
  return {
    post(message, transfer) { worker.postMessage(message, transfer ?? []); },
    onMessage(listener) {
      const onMessage = (event: { data?: unknown }) => listener(event.data as WorkerToHostMessage);
      const onError = (event: { message?: string }) => listener({ type: 'boot_failed', error: event.message ?? 'worker error' });
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      return () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); };
    },
    close() { worker.terminate(); },
  };
}

/** Spawn the host Worker chunk. */
export function createBrowserHostPort(): HostPort<HostToWorkerMessage, WorkerToHostMessage> {
  const worker = new Worker(new URL('./matchHostWorker.ts', import.meta.url), { type: 'module', name: 'cot-match-host' });
  // The DOM Worker's overloaded listener signatures narrow the structural shape above; the surface is the same.
  return workerHostPort(worker as unknown as WorkerLike);
}
