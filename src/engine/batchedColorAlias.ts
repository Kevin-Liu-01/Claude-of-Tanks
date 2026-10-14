// batchedColorAlias.ts — the BatchedMesh colour-texture alias three r185's program check needs (2026-10-13, the perf
// stream). Its own module, so the game entry carries this getter alone: the caster-kind settling (shadowDepthKinds.ts)
// loads as its own chunk with the first instanced or batched shadow draw (lighting.ts).
import * as THREE from 'three';

/**
 * 2026-10-13 (the perf stream): three r185's setProgram asks whether a BatchedMesh's colour texture matches its
 * program's USE_BATCHING_COLOR by `object.colorTexture`, a property BatchedMesh does not have (it keeps the texture in
 * `_colorsTexture`, which getParameters reads): for a batch without colours, `undefined !== null` held, so EVERY draw of
 * every batched mesh (the props buckets' batches, the tanks' gear and articulated shadow batches, in every pass) asked
 * for a program change and re-ran getProgram (its parameters and its cache-key string) to land on the same program.
 * The getter gives the check the property it reads; the program a draw takes is unchanged (getParameters still reads
 * `_colorsTexture`). A three that grows its own `colorTexture` keeps it.
 */
export function installBatchedColorTextureAlias(): boolean {
  const proto = THREE.BatchedMesh.prototype as unknown as Record<string, unknown>;
  if ('colorTexture' in proto) return false;
  Object.defineProperty(proto, 'colorTexture', {
    configurable: true,
    get(this: { _colorsTexture?: THREE.DataTexture | null }) { return this._colorsTexture ?? null; },
  });
  return true;
}
