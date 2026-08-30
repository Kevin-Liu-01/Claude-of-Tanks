import assert from 'node:assert/strict';
import { createLazyRuntimeOwner } from './lazyRuntimeOwner.ts';

let loads = 0;
let creates = 0;
const owner = createLazyRuntimeOwner(
  async () => { loads += 1; return { value: 7 }; },
  (module) => { creates += 1; return { value: module.value }; },
);
assert.equal(owner.current, null);
const [first, second] = await Promise.all([owner.preload(), owner.preload()]);
assert.equal(first, second, 'concurrent requests share one runtime');
assert.equal(owner.current, first);
assert.equal(loads, 1);
assert.equal(creates, 1);
assert.equal(await owner.preload(), first, 'resolved runtime is reused');

let attempts = 0;
const retrying = createLazyRuntimeOwner(
  async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('expected first failure');
    return { ready: true };
  },
  (module) => module,
);
await assert.rejects(retrying.preload(), /expected first failure/);
assert.equal(retrying.current, null);
assert.deepEqual(await retrying.preload(), { ready: true });
assert.equal(attempts, 2, 'a rejected load does not poison the owner');

assert.throws(
  () => createLazyRuntimeOwner(null, () => ({})),
  /loader and factory/,
);

console.log('lazyRuntimeOwner.selftest: coalescing, reuse, and retry passed');
