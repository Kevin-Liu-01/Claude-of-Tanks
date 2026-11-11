// 2026-11-02 audit S3: the deferred combat warm's receipt (window.__BATTLE_DEFERRED_WARM) marked `done` on failure and
// on cancellation too, so its readers (tools/garage-battle-actions-contract.mjs, the loading and time-to-battle probes)
// had to cross-read `error` and `cancelled`; and a battle left before the warm's first frame never settled it at all
// (`done` false for good: a probe waiting on it timed out). The receipt now declares its state: running, then
// finished, failed or cancelled, once. The real runtime runs here and the contract reads what it published.
import assert from 'node:assert/strict';
import { createDeferredCombatWarmRuntime } from './deferredCombatWarmRuntime.ts';
import { checkGarageActionWarmReadiness, DEFERRED_WARM_STATES } from '../../tools/garage-battle-actions-contract.mjs';

const settledStates = DEFERRED_WARM_STATES.filter((state) => state !== 'running');
// one renderer and context for every warm (the program warm checks the context it began on)
const gl = { getExtension: () => null };
const renderer = { info: { programs: [] }, getContext: () => gl };

/** One deferred warm over fakes; `script` shapes the battle it runs in. */
async function runWarm({ leaveBeforeFirstFrame = false, failVision = false, staleMidway = false } = {}) {
  const game = { phase: 'battle', preBattleS: 4 };
  let generation = 7;
  let seenRunning = null;
  const runtime = createDeferredCombatWarmRuntime({
    game,
    renderer,
    camera: { position: {} },
    getBattleVisuals: () => ({ async stream(_predicate, yieldForBudget) { await yieldForBudget(true); } }),
    *warmVisionSteps() { yield; if (failVision) throw new Error('vision broke'); },
    combatWarm: { cancelRare() {}, async warmOpeningChunked() {}, async warmRareChunked() {} },
    async warmBattleTerrainTiles() {},
    getWorld: () => null,
    getGeneration: () => generation,
    setPending() {},
    prepareNextOpeningRoute: () => false,
    now: () => 0,
    yieldFrame: async () => {
      seenRunning = { ...globalThis.__BATTLE_DEFERRED_WARM };
      if (leaveBeforeFirstFrame) game.phase = 'garage';
    },
    createYielder: () => async () => { if (staleMidway) generation += 1; },
  });
  const warn = console.warn;
  console.warn = () => {};
  try { await runtime.schedule(7); } finally { console.warn = warn; }
  const trace = { ...globalThis.__BATTLE_DEFERRED_WARM };
  delete globalThis.__BATTLE_DEFERRED_WARM;
  return { trace, seenRunning };
}

/** The contract over two entries whose deferred receipt is `trace` (the countdown owner's left ready). */
function contractOn(trace) {
  const countdown = { done: true, doneBeforeRollout: true };
  return checkGarageActionWarmReadiness(['battle', 'battle-again'].map((action) => ({
    action, loadingTraces: { __BATTLE_COUNTDOWN_WARM: countdown, __BATTLE_DEFERRED_WARM: { ...trace, doneBeforeRollout: true } },
  })));
}

// running while it works, finished once it is done; the contract accepts it
{
  const { trace, seenRunning } = await runWarm();
  assert.equal(seenRunning.state, 'running');
  assert.equal(seenRunning.done, false);
  assert.equal(trace.state, 'finished');
  assert.equal(trace.done, true);
  assert.equal(trace.error, undefined);
  assert.deepEqual(contractOn(trace), []);
}

// a failure settles it failed, its error kept; `done` (settled) no longer reads as finished
{
  const { trace } = await runWarm({ failVision: true });
  assert.equal(trace.state, 'failed');
  assert.equal(trace.done, true, 'settled');
  assert.match(trace.error, /vision broke/);
  assert.equal(trace.doneBeforeRollout, false);
  assert.deepEqual(contractOn(trace), [
    `battle: deferred warm failed: ${trace.error}`, `battle-again: deferred warm failed: ${trace.error}`,
  ]);
}

// a battle replaced while the warm runs: cancelled, never an error
{
  const { trace } = await runWarm({ staleMidway: true });
  assert.equal(trace.state, 'cancelled');
  assert.equal(trace.cancelled, true);
  assert.equal(trace.error, undefined);
  assert.deepEqual(contractOn(trace), ['battle: deferred warm was cancelled', 'battle-again: deferred warm was cancelled']);
}

// a battle left before the warm's first frame: the receipt settles cancelled instead of waiting for good
{
  const { trace } = await runWarm({ leaveBeforeFirstFrame: true });
  assert.equal(trace.state, 'cancelled', 'a warm whose battle was left before its first frame settles');
  assert.equal(trace.done, true, "its waiters (a probe on __BATTLE_DEFERRED_WARM.done) stop waiting");
  assert.equal(trace.doneBeforeRollout, false);
}

assert.deepEqual(settledStates, ['finished', 'failed', 'cancelled']);
console.log('deferredWarmReceipt.selftest: the deferred warm receipt declares running, finished, failed or cancelled, once');
