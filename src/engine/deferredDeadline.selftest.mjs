import assert from 'node:assert/strict';
import { createDeferredDeadline } from './deferredDeadline.ts';

const timers = [];
const cleared = new Set();
const clock = {
  setTimeout(callback, delayMs) {
    const handle = { callback, delayMs };
    timers.push(handle);
    return handle;
  },
  clearTimeout(handle) { cleared.add(handle); },
};

let fallbacks = 0;
const completed = createDeferredDeadline(2500, () => {
  fallbacks += 1;
  return 'fallback';
}, clock);
assert.equal(timers[0].delayMs, 2500);
assert.equal(completed.settle('worker'), true);
assert.equal(completed.settle('late'), false);
timers[0].callback();
assert.equal(await completed.promise, 'worker');
assert.equal(fallbacks, 0);
assert.ok(cleared.has(timers[0]));

const timedOut = createDeferredDeadline(100, () => {
  fallbacks += 1;
  return 'fallback';
}, clock);
timers[1].callback();
assert.equal(await timedOut.promise, 'fallback');
assert.equal(timedOut.settled, true);
assert.equal(timedOut.settle('late'), false);
assert.equal(fallbacks, 1);

assert.throws(() => createDeferredDeadline(0, () => null), /positive finite timeout/);

console.log('deferredDeadline.selftest: first-result and bounded fallback contracts passed');
