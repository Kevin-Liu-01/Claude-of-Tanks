import assert from 'node:assert/strict';
import { createBattleLoadAccess } from './battleLoadAccess.ts';

let attempts = 0;
const runtime = {
  visible: false,
  covering: false,
  show() {},
  rosters() {},
  progress() {},
  async hide() {},
};
const access = createBattleLoadAccess({
  async load() {
    attempts += 1;
    if (attempts === 1) throw new Error('injected chunk failure');
    return { createBattleLoadScreen: () => runtime };
  },
});

await assert.rejects(access.preload(), /injected chunk failure/);
assert.equal(access.current, null);
const [first, joined] = await Promise.all([access.preload(), access.preload()]);
assert.equal(first, runtime);
assert.equal(joined, runtime);
assert.equal(access.current, runtime);
assert.equal(attempts, 2, 'a failed transfer retries and concurrent callers coalesce');

console.log('battleLoadAccess.selftest: garage exclusion, retry, and request joining passed');
