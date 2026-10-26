// The riding-parts prebuild's worker (UI-LOCKDOWN E, 2026-10-25): every riding cradle and riding station option set the
// manifest names, the asked-for tanks' first, built through the public fitting from its key alone (ridingPartsWire.ts)
// and posted as its stored parts for the page to seed (ridingPartsPrebuild.ts). It loads the profile kit and no family:
// the parts are geometry.
import * as THREE from 'three';
import { configureTankFactory } from './tankFactoryCore.ts';
import { FITTINGS } from './profiles/kit.ts';
import { ridingPartsSource, ridingPartsTransfer, ridingPartsWire, type RidingPartsWire } from './ridingPartsWire.ts';
import { RIDING_PARTS_BY_SPEC, RIDING_PARTS_KEYS } from './ridingPartsManifest.generated.ts';

/** The page's request: the tanks to serve first, the keys it holds already. */
export interface RidingPartsRequest { readonly order: readonly string[]; readonly have: readonly string[] }
export type RidingPartsReply = { readonly kind: 'riding-part'; readonly wire: RidingPartsWire } | { readonly kind: 'riding-parts-done' };

interface RidingPartsWorkerScope {
  onmessage: ((event: MessageEvent<RidingPartsRequest>) => void) | null;
  postMessage(message: RidingPartsReply, transfer?: Transferable[]): void;
}
const workerScope = globalThis as typeof globalThis & RidingPartsWorkerScope;

configureTankFactory({ canonicalBuilderPacks: [], profiledBuilders: {}, fittings: FITTINGS });
/** A fitting's assembly needs one material to merge into; the stored riding parts are geometry and keep none of it. */
const RIDING_MATS = { dark: new THREE.MeshBasicMaterial() };
const fittings = FITTINGS as unknown as Record<string, ((opts: object) => THREE.Object3D) | undefined>;

/** Each key once, the asked-for tanks' first, a turn of the queue between keys. A key the page holds is skipped; one
 *  that cannot be built here is left to the build that needs it. */
async function buildRidingParts({ order, have }: RidingPartsRequest): Promise<void> {
  const done = new Set(have);
  const keys = [...order.flatMap((id) => (RIDING_PARTS_BY_SPEC[id] ?? []).map((index) => RIDING_PARTS_KEYS[index])), ...RIDING_PARTS_KEYS];
  for (const key of keys) {
    if (!key || done.has(key)) continue;
    done.add(key);
    const source = ridingPartsSource(key);
    try {
      if (source) fittings[source.fitting]?.({ ...source.options, mats: RIDING_MATS });
      const wire = ridingPartsWire(key);
      if (wire) workerScope.postMessage({ kind: 'riding-part', wire }, ridingPartsTransfer(wire));
    } catch { /* built in-line where it is needed */ }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  workerScope.postMessage({ kind: 'riding-parts-done' });
}

workerScope.onmessage = (event) => { void buildRidingParts(event.data); };
