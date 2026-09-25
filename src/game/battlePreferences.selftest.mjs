import assert from 'node:assert/strict';
import { ALLOW_NIGHT_STORAGE_KEY, createBattlePreferences } from './battlePreferences.ts';

const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const prefs = createBattlePreferences(() => storage);
assert.equal(prefs.allowNight, true, 'existing players keep the seeded night chance');
prefs.setAllowNight(false);
assert.equal(prefs.allowNight, false);
assert.equal(values.get(ALLOW_NIGHT_STORAGE_KEY), 'false');
assert.equal(createBattlePreferences(() => storage).allowNight, false, 'day-only choice survives reload');
prefs.setAllowNight(true);
assert.equal(createBattlePreferences(() => storage).allowNight, true);
for (const corrupt of ['', 'null', '{bad json', '0']) {
  values.set(ALLOW_NIGHT_STORAGE_KEY, corrupt);
  assert.equal(createBattlePreferences(() => storage).allowNight, true, 'unknown values retain the default');
}
for (const getStorage of [
  () => undefined,
  () => { throw Error('storage denied'); },
  () => ({ getItem: () => 'true', setItem: () => { throw Error('quota exceeded'); } }),
]) {
  const session = createBattlePreferences(getStorage);
  assert.equal(session.allowNight, true);
  session.setAllowNight(false);
  assert.equal(session.allowNight, false, 'blocked persistence cannot silently ignore a selected option');
  session.setAllowNight(true);
  assert.equal(session.allowNight, true);
}
console.log('battlePreferences: defaults, reload, corrupt/blocked storage and session toggle PASS');
