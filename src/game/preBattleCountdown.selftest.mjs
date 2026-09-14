import assert from 'node:assert/strict';
import {
  advancePreBattleCountdown,
  resolveVisiblePreBattleSeconds,
} from './preBattleCountdown.ts';

assert.equal(advancePreBattleCountdown(5, 0.25, false), 4.75);
// Countdown 2026-09-13: the warm hold moved from the last second to the top of the
// visible count (3 s); a count already below it keeps its value while warm is pending.
assert.equal(advancePreBattleCountdown(1.1, 0.25, true), 1.1);
assert.equal(advancePreBattleCountdown(4.2, 0.25, true), 3.95);
assert.equal(advancePreBattleCountdown(3.1, 0.25, true), 3);
assert.equal(advancePreBattleCountdown(3, 0.25, true), 3);
assert.equal(advancePreBattleCountdown(3, 0.25, false), 2.75);
assert.equal(advancePreBattleCountdown(2, 0.25, true, 1), 1.75, 'an explicit lower hold still counts down to it');
assert.equal(advancePreBattleCountdown(1, 0.25, true), 1);
assert.equal(advancePreBattleCountdown(1, 0.25, false), 0.75);
assert.equal(advancePreBattleCountdown(0.1, 0.25, false), 0);
assert.equal(advancePreBattleCountdown(Infinity, 1, true), Infinity);
assert.equal(advancePreBattleCountdown(2, -1, false), 2);

assert.equal(resolveVisiblePreBattleSeconds(5, 0), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, 1), 4);
// Countdown 2026-09-13: whole seconds, never fewer than three, so the count reads 3-2-1.
assert.equal(resolveVisiblePreBattleSeconds(5, 4.6), 3);
assert.equal(resolveVisiblePreBattleSeconds(5, 10), 3);
assert.equal(resolveVisiblePreBattleSeconds(5, 1.5), 3, 'a fractional credit floors to the whole numeral');
assert.equal(resolveVisiblePreBattleSeconds(5, 0.5), 4);
assert.equal(resolveVisiblePreBattleSeconds(1, 0.5, 2), 1);
assert.equal(resolveVisiblePreBattleSeconds(5, -1), 5);
assert.equal(resolveVisiblePreBattleSeconds(5, Number.NaN), 5);

console.log('preBattleCountdown.selftest: warm hold, loader credit, and rollout release passed');

// Keep the player-entry countdown and the intent-loading policy in the same
// normal npm-test gate: both determine what work may happen before rollout.
