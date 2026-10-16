// structureGroundOcclusionWorker.ts — 2026-10-09 (the shadows lane): the ground's sky occlusion beside the world's solids,
// baked off the main thread (structureGroundOcclusionBake.ts; the runtime is structureGroundOcclusion.ts). One request per
// message: the packed occluders and a texel rectangle (null = the whole raster); the answer carries the RG8 texels back.
import type { RuntimeValue } from '../runtimeTypes.ts';
import { bakeStructureGroundOcclusion, type SgoRect } from './structureGroundOcclusionBake.ts';

interface SgoRequest {
  id: number;
  packed: Float32Array;
  rect: SgoRect | null;
}

interface SgoWorkerScope {
  onmessage: ((event: MessageEvent<SgoRequest>) => void) | null;
  postMessage(message: Record<string, RuntimeValue>, transfer: Transferable[]): void;
}

function isSgoWorkerScope(value: RuntimeValue): value is SgoWorkerScope {
  return value !== null && typeof value === 'object' && 'postMessage' in value && typeof value.postMessage === 'function'
    && 'onmessage' in value;
}

const scope: RuntimeValue = globalThis;
if (!isSgoWorkerScope(scope)) throw new TypeError('structure ground occlusion worker requires a WorkerGlobalScope');

scope.onmessage = ({ data }) => {
  const result = bakeStructureGroundOcclusion(data.packed, data.rect);
  scope.postMessage({ id: data.id, rg: result.rg, rect: result.rect, parts: result.parts, ms: result.ms },
    [result.rg.buffer as ArrayBuffer]);
};
