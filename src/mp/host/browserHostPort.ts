/**
 * The main thread's port to the host Worker (P2 client lane). `createBrowserHostPort` spawns the Worker as its own
 * lazy chunk (`new URL(..., import.meta.url)`: Vite bundles matchHostWorker.ts and everything it reaches — the actor,
 * the simulation, the fleet builders — separately; nothing of it joins the boot-critical main chunk) and adapts its
 * message events to the `HostPort` shape the host runtime speaks. Browser-only; the receipts use the in-process pair.
 */
import type { HostPort, HostPrepareConfig, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';
import simKernelsWasmUrl from '../../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm?url';
import { terrainVariantFor } from '../../sim/matchRuleset.ts';

/** The world kernels' module as the build serves it (on by default; ?simKernels=ts: null, the TypeScript): the host's
 * Worker fetches it and builds its world on them. Read here, in the lazy multiplayer chunk, not at boot. */
export const SIM_KERNELS_URL: string | null = typeof location === 'object'
  && new URLSearchParams(location.search).get('simKernels') === 'ts' ? null : simKernelsWasmUrl;

interface WorkerLike {
  postMessage(message: unknown, transfer?: ArrayBuffer[]): void;
  addEventListener(type: 'message' | 'error', listener: (event: { data?: unknown; message?: string }) => void): void;
  removeEventListener(type: 'message' | 'error', listener: (event: { data?: unknown; message?: string }) => void): void;
  terminate(): void;
}

/** Wrap a Worker (or anything with its message surface) as the host runtime's port. */
function workerHostPort(worker: WorkerLike): HostPort<HostToWorkerMessage, WorkerToHostMessage> {
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

function spawnHostPort(): HostPort<HostToWorkerMessage, WorkerToHostMessage> {
  const worker = new Worker(new URL('./matchHostWorker.ts', import.meta.url), { type: 'module', name: 'cot-match-host' });
  // The DOM Worker's overloaded listener signatures narrow the structural shape above; the surface is the same.
  return workerHostPort(worker as unknown as WorkerLike);
}

/**
 * A solo battle's host thread prepared while the player is still in the Garage (mp/session/soloHostEntry.ts,
 * RUST-ENGINE-DECISION §7 step 5). The core's 'prepare' (§13.21) builds the battlefield's collision world, loads the fleet's
 * anatomy and builds the bots' ground ahead, so the battle's boot is the actor alone. The next host port this page creates
 * takes it. A preparation for another battlefield replaces it, and a boot it was not prepared for builds afresh.
 */
let preparedSolo: { key: string; port: HostPort<HostToWorkerMessage, WorkerToHostMessage> } | null = null;

export function prepareSoloHostPort(prepare: HostPrepareConfig): void {
  // (the battlefield as the core keys its prepared world: the map and its terrain variant, matchHostCore.ts worldKey)
  const key = `${prepare.mapId}|${terrainVariantFor(prepare.mode) ?? ''}|${prepare.manifestBase ?? ''}|${prepare.simKernelsUrl ?? ''}`;
  if (preparedSolo?.key === key) return;
  preparedSolo?.port.close();
  const port = spawnHostPort();
  port.post({ type: 'prepare', prepare });
  preparedSolo = { key, port };
}

/** A battle that will not run on the prepared host (the page's own simulation took it) lets its thread and world go. */
export function releasePreparedSoloHostPort(): void {
  preparedSolo?.port.close();
  preparedSolo = null;
}

/** Spawn the host Worker chunk (or take the solo battle's prepared one). */
export function createBrowserHostPort(): HostPort<HostToWorkerMessage, WorkerToHostMessage> {
  const prepared = preparedSolo;
  preparedSolo = null;
  return prepared ? prepared.port : spawnHostPort();
}
