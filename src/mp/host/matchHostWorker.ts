/**
 * The Worker entry of the browser host (P2 client lane): `matchHostCore` on the Worker's own message port. This
 * module is a lazy chunk of its own (main.ts never imports it): the actor, the simulation and the fleet builders it
 * pulls in load only when a commander hosts. The collision world comes from the manifests the build serves under
 * COLLISION_MANIFEST_ROUTE (fetched per map on demand, checksum-verified).
 */
import { createMatchHostCore } from './matchHostCore.ts';
import type { HostPort, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';

type WorkerScope = {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
};

/** The core's port over a Worker scope (`self` inside the Worker). */
export function workerScopePort(scope: WorkerScope): HostPort<WorkerToHostMessage, HostToWorkerMessage> {
  return {
    post(message, transfer) { scope.postMessage(message, transfer ?? []); },
    onMessage(listener) {
      const handler = (event: { data: unknown }) => listener(event.data as HostToWorkerMessage);
      scope.addEventListener('message', handler);
      return () => scope.removeEventListener('message', handler);
    },
    close() { scope.close(); },
  };
}

const scope = globalThis as unknown as WorkerScope & { document?: unknown };
if (typeof scope.postMessage === 'function' && typeof scope.document === 'undefined') {
  createMatchHostCore({ port: workerScopePort(scope) });
}
