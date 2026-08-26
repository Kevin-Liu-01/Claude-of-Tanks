import assert from 'node:assert/strict';
import { createCombatWarmCoordinator } from './combatWarmCoordinator.ts';

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

console.log('combatWarmCoordinator.selftest: resumable, reset, drain, and cancellation passed');
