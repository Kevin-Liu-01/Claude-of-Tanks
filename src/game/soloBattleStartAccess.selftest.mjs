import assert from 'node:assert/strict';
import { createSoloBattleStartAccess } from './soloBattleStartAccess.ts';

let loads = 0;
let optionReads = 0;
let fail = true;
const starts = [];
const runtime = { start: (...args) => starts.push(args) };
const access = createSoloBattleStartAccess({
  options: () => { optionReads++; return { marker: true }; },
  load: async () => {
    loads++;
    if (fail) throw new Error('start chunk failed');
    return {
      createSoloBattleStartRuntime(options) {
        assert.deepEqual(options, { marker: true });
        return runtime;
      },
    };
  },
});

assert.throws(() => access.start('m1a2'), /not ready/);
await assert.rejects(access.preload(), /start chunk failed/);
fail = false;
const requests = [access.preload(), access.preload()];
assert.strictEqual(requests[0], requests[1]);
assert.strictEqual(await requests[0], runtime);
assert.equal(loads, 2);
assert.equal(optionReads, 1);
access.start('m1a2', 'winter', { deferVisuals: true });
assert.deepEqual(starts, [['m1a2', 'winter', { deferVisuals: true }]]);

console.log('soloBattleStartAccess.selftest: retry, coalescing, and sync handoff pass');
