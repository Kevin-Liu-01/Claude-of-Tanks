import assert from 'node:assert/strict';
import {
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
} from './preBattleCountdown.js';

assert.equal(advancePreBattleCountdown(5, 0.25, false), 4.75);
assert.equal(advancePreBattleCountdown(1.1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, false), 0.75);
assert.equal(advancePreBattleCountdown(0.1, 0.25, false), 0);
assert.equal(advancePreBattleCountdown(Infinity, 1, true), Infinity);
assert.equal(advancePreBattleCountdown(2, -1, false), 2);

assert.equal(resolveVisiblePreBattleSeconds(5, 0), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, 1), 4);
assert.equal(resolveVisiblePreBattleSeconds(5, 4.6), 2);
assert.equal(resolveVisiblePreBattleSeconds(5, 10), 2);
assert.equal(resolveVisiblePreBattleSeconds(1, 0.5, 2), 1);
assert.equal(resolveVisiblePreBattleSeconds(5, -1), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, Number.NaN), 5);

console.log('preBattleCountdown.selftest: warm hold, loader credit, and rollout release passed');
