/**
 * The solo sim Worker's entry (soloSimCore.ts on the Worker's own message port; RUST-ENGINE-DECISION §7 step 5). A lazy
 * chunk of its own: the actor, the simulation and the anatomy it pulls in load only when a free sortie runs off-thread.
 * Its battlefield comes from the collision manifests the build serves (fetched per map, cached immutable).
 */
import { createSoloSimCore } from './soloSimCore.ts';
import type { PageToSoloSim, SoloSimPort, SoloSimToPage } from './soloSimProtocol.ts';

type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
};

/** The core's port over a Worker scope (`self` inside the Worker). */
function workerScopePort(scope: WorkerScope): SoloSimPort<PageToSoloSim, SoloSimToPage> {
  return {
    post(message, transfer) { scope.postMessage(message, transfer ?? []); },
    onMessage(listener) {
      const handler = (event: { data: unknown }) => listener(event.data as PageToSoloSim);
      scope.addEventListener('message', handler);
      return () => scope.removeEventListener('message', handler);
    },
    close() { scope.close(); },
  };
}

const scope = globalThis as unknown as WorkerScope & { document?: unknown };
if (typeof scope.postMessage === 'function' && typeof scope.document === 'undefined') {
  createSoloSimCore({ port: workerScopePort(scope) });
}
