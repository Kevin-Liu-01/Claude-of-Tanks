import assert from 'node:assert/strict';
import { createBootLifecycle } from './bootLifecycle.ts';

let nowMs = 120;
let yields = 0;
const events = [];
const lifecycle = createBootLifecycle({
  screen: {
    begin: (stage) => events.push(`begin:${stage}`),
    end: (stage) => events.push(`end:${stage}`),
  },
  yieldFrame: async () => { yields++; nowMs += 5; },
  now: () => nowMs,
  heavyStageMs: 20,
});

assert.equal(lifecycle.startedAt, 120);
assert.equal(lifecycle.timings.imports, 120);

events.push('renderer-work');
nowMs += 12;
lifecycle.completeManualStage('renderer');
assert.equal(lifecycle.timings.renderer, 12);

nowMs += 4;
const fastResult = await lifecycle.run('fast', () => {
  nowMs += 8;
  return 'ready';
});
assert.equal(fastResult, 'ready');
assert.equal(lifecycle.timings['gap>fast'], 4);
assert.equal(lifecycle.timings.fast, 8);
assert.equal(yields, 1, 'a fast stage only yields before its work');

nowMs += 3;
await lifecycle.run('heavy', async () => { nowMs += 21; });
assert.equal(lifecycle.timings['gap>heavy'], 3);
assert.equal(lifecycle.timings.heavy, 21);
assert.equal(yields, 3, 'a heavy stage yields before and after its work');
assert.deepEqual(events, [
  'renderer-work', 'end:renderer',
  'begin:fast', 'end:fast',
  'begin:heavy', 'end:heavy',
]);

assert.throws(() => createBootLifecycle({
  screen: null,
  yieldFrame: async () => {},
}), /progress screen/);

console.log('bootLifecycle.selftest: stage attribution and bounded paint yields passed');
