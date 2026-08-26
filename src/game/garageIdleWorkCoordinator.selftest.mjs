import assert from 'node:assert/strict';
import { createGarageIdleWorkCoordinator } from './garageIdleWorkCoordinator.ts';

const owner = createGarageIdleWorkCoordinator();
const world = await owner.acquire('world');
assert(world, 'first valid lane acquires immediately');
assert.equal(owner.stats.current, 'world');

let dressingGranted = false;
const dressingP = owner.acquire('dressing').then((lease) => {
  dressingGranted = true;
  return lease;
});
const neighborsP = owner.acquire('pedestal-neighbors');
assert.equal(owner.stats.queued, 2);
assert.equal(dressingGranted, false, 'work lanes may never overlap');

world.release();
const neighbors = await neighborsP;
assert(neighbors, 'higher-priority neighbor paint wins the next lane');
assert.equal(owner.stats.current, 'pedestal-neighbors');
assert.equal(dressingGranted, false);

let stale = true;
const staleP = owner.acquire('world-intent', () => !stale);
neighbors.release();
assert.equal(await staleP, null, 'invalid queued intent is discarded at grant time');
const dressing = await dressingP;
assert(dressing);
assert.equal(owner.stats.current, 'dressing');
dressing.release();
await new Promise((resolve) => setImmediate(resolve));

assert.equal(owner.stats.current, null);
assert.equal(owner.stats.completed, 3);
assert.deepEqual(owner.stats.byKind, {
  'world-intent': 0,
  'pedestal-neighbors': 1,
  world: 1,
  dressing: 1,
});
assert.equal(owner.stats.maxQueued, 2);

console.log('garageIdleWorkCoordinator.selftest: priority, exclusion and stale work pass');
