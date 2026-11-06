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
// chunk, and the battle entry waits for it (round 3 X10: soloKernelsSettled below, which soloBattleAccess.ts's preload
// awaits): state.ts setupBattle chooses once a battle, so a battle set up before the kernels landed ran its whole life on
// the TypeScript, and a first battle whose covered entry finished before its own chunk's kernels did lost them to that
// race. A failed load, and one still loading SOLO_KERNELS_ENTRY_WAIT_MS after the entry began to wait (round 4 F3: the
// entry's own bound, not one from the chunk's first load at the Battle intent), keep the TypeScript; a load past the bound
// goes on, and the first battle set up after it lands rides the kernels.
// A failed load is reported (world/simKernelsReport.ts: __SIM_KERNELS, one telemetry note, a development console line).

/**
 * How long a battle entry waits for the kernels (round 3 X10), from its own wait (round 4 F3): the covered entry asks the
 * authority at its barrier's start, beside the world, the fleet's builders and the HUD (game/soloBattleLoadingRuntime.ts),
 * so the wait costs an entry nothing unless the kernels are the last thing loading: a 117 KB module (a slow link's second
 * or two) and its compile. A barrier that outlasts the bound with the kernels still loading sets its battle up on the
 * TypeScript; the kernels, landing later, carry the next.
 */
export const SOLO_KERNELS_ENTRY_WAIT_MS = 3000;

const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
/**
 * The chunk's one load of the kernels: installed, or failed and reported. Never a rejection (round 4 F3): an installer
 * that throws is a failed load, and a report that throws leaves the TypeScript unreported. A rejection here failed every
 * wait on it, and with them the access's preload, so each solo entry for the document's life (import() hands every re-ask
 * the cached module, and its one load).
 */
function loadKernels(): Promise<void> {
  if (kernelMode === 'ts') {
    reportSimKernels('solo', { mode: 'ts', reason: 'off' });
    return Promise.resolve();
  }
  return import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check'))
    .then(setSoloWorldKernels)
    .then(undefined, (error: unknown) => { reportSimKernels('solo', { mode: 'ts', reason: simKernelsFailureReason(error) }, error); })
    .then(undefined, () => { /* the report itself threw: the TypeScript stands, unreported */ });
}
// (no top-level await: the kernels' chunk may import modules the bundler placed in this one, and would wait on it)
const kernelsLoad = loadKernels();

/**
 * One battle entry's wait for the kernels (round 3 X10, round 4 F3): the load installed or failed, or
 * SOLO_KERNELS_ENTRY_WAIT_MS since this call, whichever comes first; at once under ?simKernels=ts. Each call is a wait of
 * its own, its bound started at the call (soloBattleAccess.ts preload: the covered entry's barrier, not the chunk's first
 * load at the Battle intent, whose dwell in the garage spent the bound), and it never rejects.
 */
export function soloKernelsSettled(): Promise<void> {
  if (kernelMode === 'ts') return kernelsLoad;
  let bound: ReturnType<typeof setTimeout> | undefined;
  const lapse = new Promise<void>((resolve) => { bound = setTimeout(resolve, SOLO_KERNELS_ENTRY_WAIT_MS); });
  return Promise.race([kernelsLoad, lapse]).then(() => { clearTimeout(bound); });
}
