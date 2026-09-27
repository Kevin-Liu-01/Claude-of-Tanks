import assert from 'node:assert/strict';
import { BATTLE_TIMES_STORAGE_KEY, createBattlePreferences } from './battlePreferences.ts';
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const prefs = createBattlePreferences(() => storage);
assert.deepEqual(prefs.times, ['day', 'sunset', 'night']);
assert.equal(prefs.setEnabled('night', false), true);
assert.deepEqual(createBattlePreferences(() => storage).times, ['day', 'sunset']);
prefs.setEnabled('day', false);
assert.deepEqual(prefs.times, ['sunset']);
assert.equal(prefs.setEnabled('sunset', false), false, 'the final time cannot be disabled');
assert.deepEqual(prefs.times, ['sunset']);
assert.throws(() => prefs.setEnabled('dawn', true), /Unknown/);
values.delete(BATTLE_TIMES_STORAGE_KEY);
values.set('cot.battle.allowNight.v1', 'false');
assert.deepEqual(createBattlePreferences(() => storage).times, ['day'], 'legacy opt-out preserves day-only intent');
values.clear();
for (const corrupt of ['', 'null', '{bad json', '[]', '["dawn"]', 'true']) {
  values.set(BATTLE_TIMES_STORAGE_KEY, corrupt);
  assert.deepEqual(createBattlePreferences(() => storage).times, ['day', 'sunset', 'night']);
}
for (const getStorage of [() => undefined, () => { throw Error('denied'); },
  () => ({getItem: () => null, setItem: () => { throw Error('quota'); }})]) {
  const session = createBattlePreferences(getStorage);
  session.setEnabled('day', false); session.setEnabled('night', false);
  assert.deepEqual(session.times, ['sunset'], 'session survives blocked persistence');
}
console.log('battlePreferences: selection, reload, migration, last-choice protection and blocked storage PASS');
