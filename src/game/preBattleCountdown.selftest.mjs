import assert from 'node:assert/strict';
import { advancePreBattleCountdown } from './preBattleCountdown.js';

assert.equal(advancePreBattleCountdown(5, 0.25, false), 4.75);
assert.equal(advancePreBattleCountdown(1.1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, false), 0.75);
assert.equal(advancePreBattleCountdown(0.1, 0.25, false), 0);
assert.equal(advancePreBattleCountdown(Infinity, 1, true), Infinity);
assert.equal(advancePreBattleCountdown(2, -1, false), 2);

console.log('preBattleCountdown.selftest: warm hold and rollout release passed');
