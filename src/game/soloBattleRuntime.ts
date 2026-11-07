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
// goes on, and the first battle set up after it lands rides the kernels. While it is pending, each later entry (a Battle
// Again's included) waits up to a bound of its own again, until the load's own deadline (round 5 Q1:
// SOLO_KERNELS_LOAD_DEADLINE_MS from its start) settles it as a failed one; every entry after that goes on at once.
// A failed load is reported (world/simKernelsReport.ts: __SIM_KERNELS, one telemetry note, a development console line).

/**
 * How long a battle entry waits for the kernels (round 3 X10), from its own wait (round 4 F3): the covered entry asks the
 * authority at its barrier's start, beside the world, the fleet's builders and the HUD (game/soloBattleLoadingRuntime.ts),
 * and its wait starts once that ask has the chunk (after the transfer, when that is still in flight), so the wait costs
 * an entry nothing unless the kernels are the last thing loading: a 117 KB module (a slow link's second or two) and its
 * compile. A barrier that outlasts the bound with the kernels still loading sets its battle up on the TypeScript; the
 * first battle set up after they land rides them. Until then every entry, a Battle Again's included, waits up to this
 * bound of its own again while the load is young: a load that never answers costs each entry within its deadline
 * (SOLO_KERNELS_LOAD_DEADLINE_MS, from the load's start) up to 3 s past the rest of its barrier, and every entry after
 * it nothing (round 5 Q1).
 */
export const SOLO_KERNELS_ENTRY_WAIT_MS = 3000;

/**
 * The kernels' load's own deadline (round 5 Q1), from its start: this chunk's body, at the chunk's first ask (the Battle
 * intent's, or an entry's). A load still pending then settles as a failed one, reported 'timeout'
 * (world/simKernelsStatus.ts): its fetch is aborted, and an answer that comes later is never installed, so the TypeScript
 * carries every later battle, as the report says, and every entry after the deadline goes on at once. Before, the fetch
 * had no timeout, and a load that never answered held every solo entry for the document's life up to
 * SOLO_KERNELS_ENTRY_WAIT_MS again (and its request its connection). The load is the kernels' chunk, a 117 KB module and
 * its compile, a slow link's seconds: one still pending at five entry bounds has stalled.
 */
export const SOLO_KERNELS_LOAD_DEADLINE_MS = 15_000;

const kernelMode = typeof location === 'object' ? new URLSearchParams(location.search).get('simKernels') : null;
/**
 * The chunk's one load of the kernels: installed, or failed and reported, by SOLO_KERNELS_LOAD_DEADLINE_MS from its start
 * (round 5 Q1: past it, failed). Never a rejection (round 4 F3): an installer that throws is a failed load, and a report
 * that throws leaves the TypeScript unreported. A rejection here failed every wait on it, and with them the access's
 * preload, so each solo entry for the document's life (import() hands every re-ask the cached module, and its one load).
 */
function loadKernels(): Promise<void> {
  if (kernelMode === 'ts') {
    reportSimKernels('solo', { mode: 'ts', reason: 'off' });
    return Promise.resolve();
  }
  // (round 5 Q1) one deadline for the whole load (the kernels' chunk, the fetch and its body, the compile): the race
  // settles there, the abort stops the fetch, and an answer after it loses the race, never installed
  const abort = new AbortController();
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const lapsed = new Promise<never>((_resolve, reject) => {
    deadline = setTimeout(() => {
      const timeout = new DOMException(`world kernels: no answer in ${SOLO_KERNELS_LOAD_DEADLINE_MS} ms`, 'TimeoutError');
      reject(timeout);
      abort.abort(timeout);
    }, SOLO_KERNELS_LOAD_DEADLINE_MS);
  });
  const loading = import('../world/soloWorldKernels.ts')
    .then((kernels) => kernels.loadSoloWorldKernels(kernelMode === 'wasm-check', abort.signal));
  return Promise.race([loading, lapsed])
    .then(setSoloWorldKernels)
    .then(undefined, (error: unknown) => { reportSimKernels('solo', { mode: 'ts', reason: simKernelsFailureReason(error) }, error); })
    .then(undefined, () => { /* the report itself threw: the TypeScript stands, unreported */ })
    .then(() => { clearTimeout(deadline); });
}
// (no top-level await: the kernels' chunk may import modules the bundler placed in this one, and would wait on it)
const kernelsLoad = loadKernels();

/**
 * One battle entry's wait for the kernels (round 3 X10, round 4 F3): the load installed or failed (by its deadline at the
 * latest, round 5 Q1), or SOLO_KERNELS_ENTRY_WAIT_MS since this call, whichever comes first; at once under ?simKernels=ts
 * and once the load has settled. Each call is a wait of its own, its bound started at the call (soloBattleAccess.ts
 * preload, once its ask has the chunk: the covered entry's barrier, not the chunk's first load at the Battle intent, whose
 * dwell in the garage spent the bound), and it never rejects.
 */
export function soloKernelsSettled(): Promise<void> {
  if (kernelMode === 'ts') return kernelsLoad;
  let bound: ReturnType<typeof setTimeout> | undefined;
  const lapse = new Promise<void>((resolve) => { bound = setTimeout(resolve, SOLO_KERNELS_ENTRY_WAIT_MS); });
  return Promise.race([kernelsLoad, lapse]).then(() => { clearTimeout(bound); });
}
