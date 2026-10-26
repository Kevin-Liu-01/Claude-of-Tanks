/**
 * Lazy solo-authority boundary. Importing this module intentionally acquires
 * AI, spotting, route planning, collision, movement, and combat integration;
 * garage boot must reach it only through explicit battle/capture intent.
 */
import { setSoloWorldKernels } from './state.ts';
import { reportSimKernels } from '../world/simKernelsReport.ts';
import { simKernelsFailureReason } from '../world/simKernelsStatus.ts';

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
// A failed load is reported (world/simKernelsReport.ts: __SIM_KERNELS, one telemetry note, a development console line).
const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
if (kernelMode === 'ts') {
  reportSimKernels('solo', { mode: 'ts', reason: 'off' });
} else {
  void import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels, (error: unknown) => { reportSimKernels('solo', { mode: 'ts', reason: simKernelsFailureReason(error) }, error); });
}
