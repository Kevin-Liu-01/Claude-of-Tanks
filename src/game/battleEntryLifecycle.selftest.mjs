import assert from 'node:assert/strict';
import { createBattleEntryLifecycle } from './battleEntryLifecycle.ts';

let nowMs = 100;
let frames = 0;
const receipts = [];
let lifecycle;
lifecycle = createBattleEntryLifecycle({
  now: () => nowMs,
  nextFrame: async () => {
    nowMs += 16;
    frames += 1;
    lifecycle.noteBattleFrame();
  },
  getRevealContext: () => ({ phase: 'battle', loaderVisible: true }),
  onReveal: (receipt) => receipts.push(receipt),
});

let releaseEntry;
const firstEntry = lifecycle.run(async () => {
  lifecycle.coverRendering();
  await new Promise((resolve) => { releaseEntry = resolve; });
  return 'entered';
}, 'busy');
assert.equal(lifecycle.pending, true);
assert.equal(lifecycle.renderingCovered, true);
assert.equal(await lifecycle.run(async () => 'overlap', 'busy'), 'busy',
  'all entry modes share one critical section');
releaseEntry();
assert.equal(await firstEntry, 'entered');
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false,
  'a completed entry cannot strand the render loop behind the cover');

await assert.rejects(
  lifecycle.run(async () => {
    lifecycle.coverRendering();
    throw new Error('entry failed');
  }, 'busy'),
  /entry failed/,
);
assert.equal(lifecycle.pending, false);
assert.equal(lifecycle.renderingCovered, false,
  'a failed entry releases both lifecycle gates');

lifecycle.coverRendering();
const receipt = await lifecycle.primeReveal();
assert.equal(frames, 1);
assert.equal(lifecycle.renderingCovered, false);
assert.deepEqual(receipt, {
  primed: true,
  frameSerial: 1,
  waitMs: 16,
  phase: 'battle',
  loaderVisible: true,
});
assert.deepEqual(receipts, [receipt]);

let stalledNow = 0;
const stalled = createBattleEntryLifecycle({
  now: () => stalledNow,
  revealTimeoutMs: 20,
  nextFrame: async () => { stalledNow += 11; },
});
stalled.coverRendering();
await assert.rejects(stalled.primeReveal(), /did not present/);
assert.equal(stalled.renderingCovered, false,
  'a reveal timeout still releases covered rendering for recovery');

assert.throws(
  () => createBattleEntryLifecycle({ nextFrame: async () => {}, revealTimeoutMs: 0 }),
  /positive and finite/,
);

console.log('battleEntryLifecycle.selftest: exclusivity and covered reveal passed');
