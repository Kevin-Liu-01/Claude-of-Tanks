import assert from 'node:assert/strict';
import { createDeferredCombatWarmRuntime } from './deferredCombatWarmRuntime.ts';

let clock = 0;
let generation = 3;
let pending = true;
let routeJobs = 2;
let terrainJobs = 2;
const events = [];
const game = { phase: 'battle', preBattleS: 4 };
const gl = { getExtension: () => null };
const renderer = { info: { programs: [] }, getContext: () => gl };

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

{
  let activeGeneration = 20;
  let rareCancels = 0;
  let rareWarms = 0;
  const waiting = [];
  const uniformEvents = [];
  const pendingEvents = [];
  const warmRenderer = { info: { programs: [] }, getContext: () => gl };
  const warmOwner = createDeferredCombatWarmRuntime({
    game, renderer: warmRenderer, camera: { position: {} },
    getBattleVisuals: () => ({ async stream() {
      const captured = activeGeneration;
      warmRenderer.info.programs.push({ program: {},
        getUniforms() { uniformEvents.push(captured); return {}; }, getAttributes: () => ({}) });
    } }),
    combatWarm: {
      cancelRare() { rareCancels += 1; },
      async warmOpeningChunked() {},
      async warmRareChunked() { rareWarms += 1; },
    },
    warmBattleTerrainTiles: async () => {}, getWorld: () => null,
    getGeneration: () => activeGeneration,
    setPending(value) { pendingEvents.push(value); },
    prepareNextOpeningRoute: () => false,
    now: () => 0,
    yieldFrame: async () => {},
    createYielder: () => (force) => {
      assert.equal(force, true, 'uniform readiness checkpoints actually yield');
      return new Promise((resolve) => waiting.push(resolve));
    },
  });
  const waitForUniformCheckpoint = async (count) => {
    for (let i = 0; i < 20 && waiting.length < count; i += 1) await Promise.resolve();
    assert.equal(waiting.length, count, 'the actual uniform drain reached its forced scheduler wait');
  };
  const oldWarm = warmOwner.schedule(20);
  await waitForUniformCheckpoint(1);
  activeGeneration = 21;
  warmOwner.cancel();
  const successor = warmOwner.schedule(21);
  await waitForUniformCheckpoint(2);
  waiting[0]();
  await oldWarm;
  assert.equal(warmOwner.isActive(), true, 'old uniform wait rejection cannot clear the successor promise');
  assert.equal(warmOwner.schedule(21), successor, 'successor remains coalesced after stale catch/finally');
  assert.equal(rareCancels, 1, 'stale rejection cannot cancel the successor rare-work owner');
  assert.deepEqual(pendingEvents, [], 'stale rejection cannot release the successor rollout gate');
  assert.deepEqual(uniformEvents, [], 'old generation cannot reflect after its wait resumes');
  waiting[1]();
  await successor;
  assert.deepEqual(uniformEvents, [21]);
  assert.equal(rareWarms, 1);
  assert.deepEqual(pendingEvents, [false]);
  assert.equal(globalThis.__BATTLE_DEFERRED_WARM.generation, 21);
  assert.equal(globalThis.__BATTLE_DEFERRED_WARM.doneBeforeRollout, true);
}

delete globalThis.__COMBAT_RARE_WARM;
delete globalThis.__BATTLE_DEFERRED_WARM;
console.log('deferredCombatWarmRuntime.selftest: staged work, cancellation, and revision ownership passed');
