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
const access = createSoloBattleRuntimeAccess(async () => {
  loads++;
  if (loads === 1) throw new Error('simulated transfer failure');
  return runtime;
});

assert.throws(() => access.simStep('early'), /not ready/,
  'authority calls fail explicitly before the lazy graph is ready');
await assert.rejects(access.preload(), /simulated transfer failure/);
assert.equal(access.isReady(), false, 'a rejected transfer does not poison readiness');

// (round 4 F3) each preload is a wait of its own for the chunk's kernels (its bound starts at the call), so two calls are
// two promises; the transfer they share is one: one load for both, one runtime
const first = access.preload();
const shared = access.preload();
assert.equal(await first, await shared, 'concurrent acquisition shares one in-flight transfer');
assert.equal(loads, 2, 'a rejected transfer is retried exactly once, for both concurrent calls');
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

console.log('soloBattleAccess.selftest: retryable lazy authority access passed');
