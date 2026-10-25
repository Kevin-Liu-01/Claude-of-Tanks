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

// ?simKernels=wasm (or wasm-check, the TypeScript and the kernels side by side): the solo worlds' support and ground on
// the WebAssembly kernels (world/soloWorldKernels.ts, docs/RUST-KERNELS.md). Their module loads with this chunk and only
// with the flag, while the battle loads (a world whose hulls step before it is ready, and a failed load, keep the
// TypeScript).
const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
if (kernelMode === 'wasm' || kernelMode === 'wasm-check') {
  void import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels, (error: unknown) => { console.warn('[simKernels] the solo kernels did not load; the TypeScript runs', error); });
}
