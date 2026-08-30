import assert from 'node:assert/strict';
import { createDeferredCombatWarmRuntime } from './deferredCombatWarmRuntime.ts';

let clock = 0;
let generation = 3;
let pending = true;
let routeJobs = 2;
let terrainJobs = 2;
const events = [];
const game = { phase: 'battle', preBattleS: 4 };
const renderer = { info: { programs: [] } };

globalThis.__COMBAT_RARE_WARM = { stages: { rarePrograms: 7 } };
const owner = createDeferredCombatWarmRuntime({
  game,
  renderer,
  camera: { position: { x: 1, y: 2, z: 3 } },
  getBattleVisuals: () => ({
    async stream(predicate, yieldForBudget, _progress, keepDetached) {
      assert.equal(predicate({ team: 'enemy' }), true);
      assert.equal(predicate({ team: 'player' }), false);
      assert.equal(keepDetached, true);
      events.push('enemy-visuals');
      await yieldForBudget(true);
    },
  }),
  combatWarm: {
    cancelRare() { events.push('cancel-rare'); },
    async warmOpeningChunked(_budget, yieldForBudget) {
      events.push('opening');
      await yieldForBudget(true);
    },
    async warmRareChunked(_budget, yieldForBudget) {
      events.push('rare');
      await yieldForBudget(true);
    },
  },
  async warmBattleTerrainTiles(yieldForBudget) {
    events.push('terrain-grid');
    await yieldForBudget(true);
  },
  getWorld: () => ({
    warmTerrainLookahead() {
      events.push('terrain-lookahead');
      return terrainJobs-- > 0 ? 1 : 0;
    },
  }),
  getGeneration: () => generation,
  setPending(value) { pending = value; },
  prepareNextOpeningRoute() {
    events.push('route');
    return routeJobs-- > 0;
  },
  now: () => ++clock,
  yieldFrame: async () => { events.push('first-frame'); },
  createYielder: () => async () => { events.push('yield'); },
});

const first = owner.schedule(3);
assert.equal(owner.schedule(3), first, 'one battle generation owns one warm promise');
await first;
assert.equal(pending, false, 'completed deployment warm releases rollout gate');
assert.equal(owner.isActive(), false, 'completed queue releases its ownership slot');
assert.deepEqual(events.slice(0, 4), ['first-frame', 'enemy-visuals', 'yield', 'opening']);
assert.equal(events.filter((event) => event === 'route').length, 3,
  'route preparation drains until the first empty job');
assert.equal(events.filter((event) => event === 'terrain-lookahead').length, 3,
  'far terrain lookahead drains one bounded band at a time');
assert.equal(globalThis.__BATTLE_DEFERRED_WARM.done, true);
assert.equal(globalThis.__BATTLE_DEFERRED_WARM.doneBeforeRollout, true);
assert.equal(globalThis.__BATTLE_DEFERRED_WARM.stages.rarePrograms, 7,
  'rare-program diagnostics survive the typed owner boundary');

pending = true;
await owner.schedule(Number.NaN);
assert.equal(pending, false, 'invalid/stale generations cannot hold rollout');

const frameResolvers = [];
generation = 10;
let cancellationCount = 0;
const revisionOwner = createDeferredCombatWarmRuntime({
  game,
  renderer,
  camera: { position: {} },
  getBattleVisuals: () => ({ async stream() {} }),
  combatWarm: {
    cancelRare() { cancellationCount += 1; },
    async warmOpeningChunked() {},
    async warmRareChunked() {},
  },
  async warmBattleTerrainTiles() {},
  getWorld: () => null,
  getGeneration: () => generation,
  setPending() {},
  prepareNextOpeningRoute: () => false,
  now: () => ++clock,
  yieldFrame: () => new Promise((resolve) => frameResolvers.push(resolve)),
  createYielder: () => async () => {},
});

const oldRound = revisionOwner.schedule(10);
generation = 11;
revisionOwner.cancel();
const newRound = revisionOwner.schedule(11);
assert.equal(frameResolvers.length, 2, 'successor starts without waiting for stale round');
frameResolvers[0]();
await oldRound;
assert.equal(revisionOwner.isActive(), true,
  'stale round settlement cannot clear the successor ownership slot');
frameResolvers[1]();
await newRound;
assert.equal(revisionOwner.isActive(), false);
assert.equal(cancellationCount, 1, 'explicit revision cancellation releases rare warm work');

delete globalThis.__COMBAT_RARE_WARM;
delete globalThis.__BATTLE_DEFERRED_WARM;
console.log('deferredCombatWarmRuntime.selftest: staged work, cancellation, and revision ownership passed');
