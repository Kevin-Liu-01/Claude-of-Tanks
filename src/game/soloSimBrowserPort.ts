/**
 * The page's port to the solo sim Worker (soloSimWorker.ts; RUST-ENGINE-DECISION §7 step 5). `new URL(..., import.meta.url)`
 * makes the Worker its own lazy chunk (the actor, the simulation and the anatomy it reaches never join the page's boot).
 * The Battle hover prepares one for the selected battlefield, and the sortie that follows takes it; a sortie on another
 * battlefield, or none, lets it go. Browser-only; the receipts pair two in-process ends (soloSimSession.selftest.mjs).
 */
import simKernelsWasmUrl from '../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm?url';
import { COLLISION_MANIFEST_ROUTE } from '../mp/host/worldCollision.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import type { PageToSoloSim, SoloSimPort, SoloSimToPage, SoloSimWorld } from './soloSimProtocol.ts';

/** The battlefield the Worker reads: the collision manifests the build serves, and its kernels (?simKernels=ts: none). */
export const SOLO_SIM_WORLD: Pick<SoloSimWorld, 'manifestBase' | 'simKernelsUrl'> = {
  manifestBase: COLLISION_MANIFEST_ROUTE,
  simKernelsUrl: typeof location === 'object' && new URLSearchParams(location.search).get('simKernels') === 'ts' ? null : simKernelsWasmUrl,
};

type SoloSimPagePort = SoloSimPort<SoloSimToPage, PageToSoloSim>;

function spawn(): SoloSimPagePort {
  const worker = new Worker(new URL('./soloSimWorker.ts', import.meta.url), { type: 'module', name: 'cot-solo-sim' });
  return {
    post(message, transfer) { worker.postMessage(message, transfer ?? []); },
    onMessage(listener) {
      const onMessage = (event: MessageEvent) => listener(event.data as SoloSimToPage);
      const onError = (event: ErrorEvent) => listener({ type: 'boot_failed', error: event.message || 'worker error' });
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      return () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', onError); };
    },
    close() { worker.terminate(); },
  };
}

const worldKey = (mapId: string, mode: string): string => `${mapId}|${terrainVariantFor(mode) ?? ''}`;

let prepared: { key: string; port: SoloSimPagePort } | null = null;

/** The Battle hover: a Worker builds the selected battlefield and loads the vehicles' anatomy ahead of the press. */
export function prepareSoloSim(mapId: string, mode: string, specIds: readonly string[]): void {
  const key = worldKey(mapId, mode);
  if (prepared?.key === key) return;
  prepared?.port.close();
  const port = spawn();
  port.post({ type: 'prepare', world: { mapId, mode, ...SOLO_SIM_WORLD }, specIds: [...specIds] });
  prepared = { key, port };
}

/** A battle that will not run on the prepared Worker (the page's own simulation took it) lets it go. */
export function releasePreparedSoloSim(): void {
  prepared?.port.close();
  prepared = null;
}

/** The sortie's Worker: the hover's when it prepared this battlefield, else a fresh one. */
export function openSoloSimWorker(mapId: string, mode: string): SoloSimPagePort {
  const taken = prepared;
  prepared = null;
  if (taken && taken.key === worldKey(mapId, mode)) return taken.port;
  taken?.port.close();
  return spawn();
}
