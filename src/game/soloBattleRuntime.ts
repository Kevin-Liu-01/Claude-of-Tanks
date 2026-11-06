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
// chunk, and the chunk resolves once it is installed or failed, or past SOLO_KERNELS_ENTRY_WAIT_MS (round 3 X10): state.ts
// setupBattle chooses once a battle, so a battle set up before the kernels landed ran its whole life on the TypeScript,
// and a first battle whose covered entry finished before its own chunk's kernels did lost them to that race. A failed
// load, and one still loading past the bound, keep the TypeScript; the bound's load goes on, and the first battle set up
// after it lands rides the kernels.
// A failed load is reported (world/simKernelsReport.ts: __SIM_KERNELS, one telemetry note, a development console line).

/**
 * How long this chunk waits for the kernels (round 3 X10). The covered battle entry loads the world, the fleet's builders
 * and the HUD beside it (game/soloBattleLoadingRuntime.ts), so the wait costs an entry nothing unless the kernels are the
 * last thing loading: a 117 KB module (a slow link's second or two) and its compile.
 */
export const SOLO_KERNELS_ENTRY_WAIT_MS = 3000;

const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
if (kernelMode === 'ts') {
  reportSimKernels('solo', { mode: 'ts', reason: 'off' });
} else {
  const settled = import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels, (error: unknown) => { reportSimKernels('solo', { mode: 'ts', reason: simKernelsFailureReason(error) }, error); });
  let bound: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([settled, new Promise<void>((resolve) => { bound = setTimeout(resolve, SOLO_KERNELS_ENTRY_WAIT_MS); })]);
  clearTimeout(bound);
}
