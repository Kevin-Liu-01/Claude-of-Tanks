// The Deploy button's load estimate (battleLoadEstimate.ts). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const { battleLoadEstimateS, recordBattleLoad } = await import('./battleLoadEstimate.ts');

assert.equal(battleLoadEstimateS(), null, 'no estimate before the first load');
recordBattleLoad(5.2);
assert.equal(battleLoadEstimateS(), 6, 'one load, rounded up');
for (const s of [3.1, 4.4, 30, 4.9]) recordBattleLoad(s);
assert.equal(battleLoadEstimateS(), 5, 'the median of the last five: one slow load does not move it');
recordBattleLoad(Number.NaN); recordBattleLoad(-1); recordBattleLoad(9999);
assert.equal(JSON.parse(store.get('cot.battle.loadS.v1')).length, 5, 'only plausible loads are kept, at most five');
store.set('cot.battle.loadS.v1', '{broken');
assert.equal(battleLoadEstimateS(), null, 'a broken store reads as no estimate');
console.log('battleLoadEstimate.selftest: the median of the last five loads, none before the first');
