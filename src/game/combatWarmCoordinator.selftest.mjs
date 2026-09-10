import assert from 'node:assert/strict';
import { COMBAT_WARM_PROGRAM_CHECKPOINT, createCombatWarmCoordinator } from './combatWarmCoordinator.ts';

const events = [];
let openingRuns = 0;
let rareRuns = 0;
let yields = 0;
let coordinator;

function* openingSteps() {
  openingRuns += 1;
  events.push('opening:1');
  yield;
  events.push('opening:2');
  coordinator.markOpeningReady();
}

function* rareSteps() {
  rareRuns += 1;
  if (!coordinator.isOpeningReady()) yield* openingSteps();
  events.push('rare:1');
  yield;
  events.push('rare:2');
  coordinator.markRareReady();
}

coordinator = createCombatWarmCoordinator({
  createOpening: openingSteps,
  createRare: rareSteps,
  createYielder: () => async () => { yields += 1; },
});

await coordinator.warmOpeningChunked();
assert.deepEqual(events, ['opening:1', 'opening:2']);
assert.equal(yields, 1, 'one cooperative checkpoint follows one opening step');
assert.equal(coordinator.isOpeningReady(), true);
await coordinator.warmOpeningChunked();
assert.equal(openingRuns, 1, 'completed opening work is idempotent');

coordinator.drain();
assert.deepEqual(events, ['opening:1', 'opening:2', 'rare:1', 'rare:2']);
assert.equal(coordinator.isRareReady(), true);

coordinator.reset();
assert.equal(coordinator.isOpeningReady(), false);
assert.equal(coordinator.isRareReady(), false);
coordinator.drain();
assert.equal(openingRuns, 2, 'a new round receives a fresh opening receipt');
assert.equal(rareRuns, 2, 'a new round receives a fresh rare receipt');

coordinator.reset();
let releaseYield;
const blockedYield = () => new Promise((resolve) => { releaseYield = resolve; });
const pending = coordinator.warmRareChunked(6, blockedYield);
await Promise.resolve();
coordinator.cancelRare();
releaseYield();
await pending;
assert.equal(coordinator.isRareReady(), false,
  'a cancelled countdown cannot publish a stale rare receipt');

{
  const contexts = [], checkpoints = [], closed = [], completed = [];
  let serial = 0, current;
  current = createCombatWarmCoordinator({
    createOpening: function* () {},
    createRare: function* (execution) {
      const id = ++serial;
      contexts.push(execution);
      try {
        yield COMBAT_WARM_PROGRAM_CHECKPOINT;
        completed.push(id);
        current.markRareReady();
      } finally { closed.push(id); }
    },
  });
  const failed = new Error('paint scheduler rejected');
  await assert.rejects(current.warmRareChunked(6, async force => {
    checkpoints.push(force); throw failed;
  }), error => error === failed);
  assert.deepEqual(checkpoints, [true], 'program checkpoints force the caller scheduler');
  assert.deepEqual(closed, [1], 'a rejected rare wait closes its suspended helper');
  assert.deepEqual(completed, []);
  await current.warmRareChunked(6, async () => {});
  assert.deepEqual(completed, [2], 'retry creates a fresh rare job after rejection');
  assert.equal(contexts[0].cooperative, true);
  current.reset();
  let rejectOld, releaseNew;
  const old = current.warmRareChunked(6, () => new Promise((_resolve, reject) => { rejectOld = reject; }));
  current.cancelRare();
  const next = current.warmRareChunked(6, () => new Promise(resolve => { releaseNew = resolve; }));
  rejectOld(failed);
  await assert.rejects(old, error => error === failed);
  assert.deepEqual(closed, [1, 2, 3], 'old rejection must not close its replacement');
  releaseNew(); await next;
  assert.deepEqual(completed, [2, 4]);
  assert.equal(current.isRareReady(), true);
  current.reset();
  let releaseDrain;
  const draining = current.warmRareChunked(6, () => new Promise(resolve => { releaseDrain = resolve; }));
  current.drain();
  assert.equal(contexts.at(-1).cooperative, false, 'drain switches the exact in-flight execution context');
  releaseDrain(); await draining;
  assert.deepEqual(completed, [2, 4, 5], 'old continuation cannot run the synchronously drained job twice');
  current.reset(); current.drain();
  assert.equal(contexts.at(-1), undefined, 'fresh synchronous drain preserves the default factory contract');
}

console.log('combatWarmCoordinator.selftest: resumable, reset, drain, and cancellation passed');
