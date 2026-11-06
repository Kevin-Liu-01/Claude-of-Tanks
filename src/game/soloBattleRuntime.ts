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
// chunk, and the battle entry waits for it (round 3 X10: soloKernelsSettled below, which soloBattleAccess.ts's load
// awaits): state.ts setupBattle chooses once a battle, so a battle set up before the kernels landed ran its whole life on
// the TypeScript, and a first battle whose covered entry finished before its own chunk's kernels did lost them to that
// race. A failed load, and one still loading past SOLO_KERNELS_ENTRY_WAIT_MS, keep the TypeScript; a load past the bound
// goes on, and the first battle set up after it lands rides the kernels.
// A failed load is reported (world/simKernelsReport.ts: __SIM_KERNELS, one telemetry note, a development console line).

/**
 * How long the battle entry waits for the kernels (round 3 X10). The covered entry loads the world, the fleet's builders
 * and the HUD beside this chunk (game/soloBattleLoadingRuntime.ts), so the wait costs an entry nothing unless the kernels
 * are the last thing loading: a 117 KB module (a slow link's second or two) and its compile.
 */
export const SOLO_KERNELS_ENTRY_WAIT_MS = 3000;

const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
let kernelsSettled: Promise<void> = Promise.resolve();
if (kernelMode === 'ts') {
  reportSimKernels('solo', { mode: 'ts', reason: 'off' });
} else {
  const settled = import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels, (error: unknown) => { reportSimKernels('solo', { mode: 'ts', reason: simKernelsFailureReason(error) }, error); });
  // (no top-level await: the kernels' chunk may import modules the bundler placed in this one, and would wait on it)
  let bound: ReturnType<typeof setTimeout> | undefined;
  kernelsSettled = Promise.race([settled, new Promise<void>((resolve) => { bound = setTimeout(resolve, SOLO_KERNELS_ENTRY_WAIT_MS); })])
    .then(() => { clearTimeout(bound); });
}

/**
 * The kernels' load settled for the battle entry (round 3 X10): installed (setSoloWorldKernels) or failed, or the bound
 * passed, whichever came first; at once under ?simKernels=ts. One wait for the chunk's life, never a rejection.
 */
export function soloKernelsSettled(): Promise<void> {
  return kernelsSettled;
}
