import assert from 'node:assert/strict';
import { createArmorAimOverlayAccess } from './armorAimOverlayAccess.ts';

let attempts = 0;
let constructions = 0;
const calls = [];
const access = createArmorAimOverlayAccess(async () => {
  attempts++;
  if (attempts === 1) throw new Error('simulated overlay chunk failure');
  return {
    createArmorAimOverlay() {
      constructions++;
      return {
        prime(target) { calls.push(['prime', target]); return target; },
        warm() { calls.push(['warm']); return () => calls.push(['restore']); },
        update(options) { calls.push(['update', options]); },
        hide() { calls.push(['hide']); },
        clear() { calls.push(['clear']); },
        dispose() { calls.push(['dispose']); },
      };
    },
  };
});

assert.equal(access.isReady(), false);
access.hide();
access.clear();
assert.equal(access.prime({ id: 'early' }), null,
  'an optional overlay must not block a cold battle before its chunk exists');
access.update({ scoped: true });
access.warm()();
await assert.rejects(access.preload(), /simulated overlay chunk failure/);
assert.equal(access.current, null);
assert.doesNotThrow(() => access.update({ scoped: true }),
  'a failed optional chunk must not create a per-frame exception storm');

const first = access.preload();
assert.equal(first, access.preload(), 'parallel battle intents coalesce');
await first;
assert.equal(attempts, 2);
assert.equal(constructions, 1);
assert.equal(access.isReady(), true);
const target = { id: 'tank' };
assert.equal(access.prime(target), target);
const restore = access.warm();
restore();
access.update({ scoped: true });
access.hide();
access.clear();
access.dispose();
assert.deepEqual(calls.map((entry) => entry[0]),
  ['prime', 'warm', 'restore', 'update', 'hide', 'clear', 'dispose']);

console.log('armorAimOverlayAccess.selftest: retryable battle owner passed');
