import assert from 'node:assert/strict';
import { createSoloBattleRuntimeAccess } from './soloBattleAccess.ts';

const calls = [];
const runtime = {
  setupBattle: (...args) => calls.push(['setupBattle', ...args]),
  simStep: (...args) => calls.push(['simStep', ...args]),
  createCollider: (...args) => calls.push(['createCollider', ...args]),
  prepareNextOpeningRoute: (...args) => calls.push(['prepareNextOpeningRoute', ...args]),
  soloKernelsSettled: async () => {},
};
let loads = 0;
// each successful transfer hands a chunk object of its own, so two calls that share one transfer resolve to one object
const access = createSoloBattleRuntimeAccess(async () => {
  loads++;
  if (loads === 1) throw new Error('simulated transfer failure');
  return { ...runtime };
});

assert.throws(() => access.simStep('early'), /not ready/,
  'authority calls fail explicitly before the lazy graph is ready');
await assert.rejects(access.preload(), /simulated transfer failure/);
assert.equal(access.isReady(), false, 'a rejected transfer does not poison readiness');

// (round 4 F3) each preload is a wait of its own for the chunk's kernels (its bound starts once the call has the chunk),
// so two calls are two promises; the transfer they share is one: one load for both, one chunk object
const first = access.preload();
const shared = access.preload();
const [firstRuntime, sharedRuntime] = await Promise.all([first, shared]);
assert.equal(loads, 2, 'concurrent acquisition shares one in-flight transfer: the rejected one is retried exactly once, '
  + 'for both concurrent calls');
assert.equal(firstRuntime, sharedRuntime, 'both calls resolve to that one transfer\'s runtime');
assert.equal(access.isReady(), true);

access.setupBattle('game', 'tank');
access.simStep(1 / 60);
access.createCollider('world');
access.prepareNextOpeningRoute('roster');
assert.deepEqual(calls, [
  ['setupBattle', 'game', 'tank'],
  ['simStep', 1 / 60],
  ['createCollider', 'world'],
  ['prepareNextOpeningRoute', 'roster'],
], 'stable accessors delegate without changing arguments or call order');

// (round 4 F3, review r1) a preload a caller drops is a handled promise, as the lazy chunk's own load is
// (app/lazyChunk.ts): a failed transfer is no unhandled rejection. The kernels' wait moved out of the chunk's kept load
// into a chain of each preload's own, which a dropped call left unhandled.
{
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const dropped = createSoloBattleRuntimeAccess(async () => { throw new Error('dropped transfer failure'); });
    dropped.preload();
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(dropped.isReady(), false);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
  assert.deepEqual(unhandled.map((reason) => reason?.message ?? String(reason)), [],
    'a dropped preload of a failed transfer raises no unhandled rejection');
}

console.log('soloBattleAccess.selftest: retryable lazy authority access passed');
