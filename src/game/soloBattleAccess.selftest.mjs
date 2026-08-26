import assert from 'node:assert/strict';
import { createSoloBattleRuntimeAccess } from './soloBattleAccess.ts';

const calls = [];
const runtime = {
  setupBattle: (...args) => calls.push(['setupBattle', ...args]),
  simStep: (...args) => calls.push(['simStep', ...args]),
  createCollider: (...args) => calls.push(['createCollider', ...args]),
  prepareNextOpeningRoute: (...args) => calls.push(['prepareNextOpeningRoute', ...args]),
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

const first = access.preload();
const shared = access.preload();
assert.equal(first, shared, 'concurrent acquisition shares one in-flight transfer');
await first;
assert.equal(loads, 2, 'a rejected transfer is retried exactly once');
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
