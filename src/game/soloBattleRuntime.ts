/**
 * Lazy solo-authority boundary. Importing this module intentionally acquires
 * AI, spotting, route planning, collision, movement, and combat integration;
 * garage boot must reach it only through explicit battle/capture intent.
 */
import { setSoloWorldKernels } from './state.ts';

export {
  createCollider,
  prepareNextOpeningRoute,
  resetProvingRange,
  setProvingTargetsMoving,
  setupBattle,
  simStep,
} from './state.ts';

// The solo worlds' support and ground on the WebAssembly kernels (world/soloWorldKernels.ts, docs/RUST-KERNELS.md), on by
// default: ?simKernels=ts keeps the TypeScript, ?simKernels=wasm-check runs both side by side. The module loads with this
// chunk, while the battle loads (a world whose hulls step before it is ready, and a failed load, keep the TypeScript).
const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
if (kernelMode !== 'ts') {
  void import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels, (error: unknown) => { console.warn('[simKernels] the solo kernels did not load; the TypeScript runs', error); });
}
