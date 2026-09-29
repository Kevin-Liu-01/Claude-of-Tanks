import assert from 'node:assert/strict';
import { createCompositionAccess } from './compositionAccess.ts';

let calls = 0;
let release;
const expected = { kind: 'network-composition' };
const access = createCompositionAccess(() => {
  calls += 1;
  return new Promise((resolve) => { release = resolve; });
});

assert.equal(access.current, null, 'construction is inert before network intent');
const first = access.preload();
const concurrent = access.preload();
assert.strictEqual(concurrent, first, 'concurrent intent shares one cold request');
assert.equal(calls, 1);
release(expected);
assert.strictEqual(await first, expected);
assert.strictEqual(access.current, expected);
assert.strictEqual(await access.preload(), expected, 'the constructed owner is retained');
assert.equal(calls, 1);

let attempts = 0;
const retry = createCompositionAccess(async () => {
  attempts += 1;
  if (attempts === 1) throw new Error('cold transfer failed');
  return expected;
});
await assert.rejects(retry.preload(), /cold transfer failed/);
assert.equal(retry.current, null);
assert.strictEqual(await retry.preload(), expected,
  'a first-visit transfer failure must not poison later intent');
assert.equal(attempts, 2);

const empty = createCompositionAccess(async () => null);
await assert.rejects(empty.preload(), /returned no runtime/);

console.log('compositionAccess.selftest: inert, coalesced, retained and retryable');
