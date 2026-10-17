// structureGroundOcclusionWorker.ts — 2026-10-09 (the shadows lane): the ground's sky occlusion beside the world's solids,
// baked off the main thread (structureGroundOcclusionBake.ts; the runtime is structureGroundOcclusion.ts). One request per
// message: the packed occluders and a texel rectangle (null = the whole raster); the answer carries the RG8 texels back.
// (2026-10-17, 227) A request of kind 'aureole' bakes the thin deck's aureole shadow for its sun instead
// (structureAureoleBake.ts); its answer echoes the kind, the sun and whether it was the whole raster.
import type { RuntimeValue } from '../runtimeTypes.ts';
import { bakeStructureGroundOcclusion, type SgoRect } from './structureGroundOcclusionBake.ts';
import { bakeStructureAureole } from './structureAureoleBake.ts';

interface SgoRequest {
  id: number;
  packed: Float32Array;
  rect: SgoRect | null;
  kind?: 'aureole';
  sun?: number[];
  radius?: number;
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
  if (data.kind === 'aureole' && data.sun) {
    const aureole = bakeStructureAureole(data.packed, data.sun, data.rect, data.radius);
    scope.postMessage({ id: data.id, kind: 'aureole', sun: data.sun, full: data.rect === null, rg: aureole.rg, rect: aureole.rect,
      parts: aureole.parts, ms: aureole.ms }, [aureole.rg.buffer as ArrayBuffer]);
    return;
  }
  const result = bakeStructureGroundOcclusion(data.packed, data.rect);
  scope.postMessage({ id: data.id, rg: result.rg, rect: result.rect, parts: result.parts, ms: result.ms },
    [result.rg.buffer as ArrayBuffer]);
};
