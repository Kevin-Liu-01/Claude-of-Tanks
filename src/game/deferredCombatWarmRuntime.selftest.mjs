import assert from 'node:assert/strict';
import { createDeferredCombatWarmRuntime } from './deferredCombatWarmRuntime.ts';
import { ProgramUniformPreparationError } from '../engine/programWarm.ts';

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
  *warmVisionSteps() { events.push(pending ? 'vision-held' : 'vision'); yield; events.push('vision-step-2'); },
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
  createYielder: () => async (force) => { events.push(force ? 'yield-forced' : 'yield'); },
});

const first = owner.schedule(3);
assert.equal(owner.schedule(3), first, 'one battle generation owns one warm promise');
await first;
assert.equal(pending, false, 'completed deployment warm releases rollout gate');
assert.equal(owner.isActive(), false, 'completed queue releases its ownership slot');
assert.deepEqual(events.slice(0, 4), ['first-frame', 'enemy-visuals', 'yield-forced', 'opening']);
assert.deepEqual(events.slice(events.indexOf('rare')), ['rare', 'yield-forced', 'vision', 'yield-forced', 'vision-step-2'],
  'the vision programs warm last, after the countdown\'s hold is released, one real frame a step');
assert.equal(globalThis.__BATTLE_DEFERRED_WARM.releasedBeforeRollout, true, 'the hold was released before the count ran out');
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

// Exercise the production defaults rather than injecting a no-op yielder.
// A real rAF callback and its microtasks are still before paint; neither the
// first actor nor a later forced batch may resume until the following task.
async function withPaintHost(run) {
  const keys = ['document', 'requestAnimationFrame', 'cancelAnimationFrame',
    'setTimeout', 'clearTimeout', 'scheduler'];
  const prior = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = [], tasks = [], timers = [], listeners = new Set();
  const ports = {
    document: { hidden: false,
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); } },
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    cancelAnimationFrame() {},
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {},
    scheduler: { yield: () => new Promise(resolve => tasks.push(resolve)) },
  };
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, {
      configurable: true, writable: true, value: ports[key],
    });
    await run({ frames, tasks, timers, listeners });
  } finally {
    for (const key of keys) {
      if (prior.get(key)) Object.defineProperty(globalThis, key, prior.get(key));
      else delete globalThis[key];
    }
  }
}

async function drainMicrotasks() {
  for (let index = 0; index < 20; index++) await Promise.resolve();
}

for (const cancelAt of [null, 'initial', 'batch']) {
  await withPaintHost(async ({ frames, tasks, listeners }) => {
    let current = 40;
    const prepared = [], released = [];
    const runtime = createDeferredCombatWarmRuntime({
      game, renderer, camera: { position: {} },
      getBattleVisuals: () => ({ async stream(_predicate, yieldForBudget) {
        prepared.push('first');
        await yieldForBudget(true);
        prepared.push('second');
      } }),
      combatWarm: { cancelRare() {}, async warmOpeningChunked() {}, async warmRareChunked() {} },
      warmBattleTerrainTiles: async () => {}, getWorld: () => null,
      getGeneration: () => current, setPending: value => released.push(value),
      prepareNextOpeningRoute: () => false,
    });
    const pendingWarm = runtime.schedule(current);
    assert.equal(frames.length, 1);
    assert.deepEqual(prepared, [], 'no hidden actor work before the first animation callback');
    frames[0]();
    await drainMicrotasks();
    assert.equal(tasks.length, 1);
    assert.deepEqual(prepared, [], 'first actor cannot extend the render callback before paint');
    if (cancelAt === 'initial') current++;
    tasks[0]();
    await drainMicrotasks();
    if (cancelAt === 'initial') {
      await pendingWarm;
      assert.deepEqual(prepared, [], 'stale first paint wait cannot start actor work');
    } else {
      assert.deepEqual(prepared, ['first']);
      assert.equal(frames.length, 2, 'forced batches use the production paint-sensitive budget yielder');
      frames[1]();
      await drainMicrotasks();
      assert.equal(tasks.length, 2);
      assert.deepEqual(prepared, ['first'], 'later actor batch cannot extend the render callback before paint');
      if (cancelAt === 'batch') current++;
      tasks[1]();
      await pendingWarm;
      assert.deepEqual(prepared, cancelAt ? ['first'] : ['first', 'second']);
    }
    assert.equal(runtime.isActive(), false);
    assert.deepEqual(released, cancelAt ? [] : [false], 'only the current generation releases rollout');
    assert.equal(listeners.size, 0, 'settled paint waits leave no visibility handlers');
  });
}

// (2026-10-16, the perf lane) enemy programs still linking when their five-second window closes leave the rest of the
// warm running: vision, the opening effects, the routes, the terrain and the rare effects all still warm, and the trace
// says how many links were unfinished; a stale battle still stops the warm
for (const staleDuringEnemies of [false, true]) {
  const steps = [];
  let current = 60, tick = 0;
  const KHR = { COMPLETION_STATUS_KHR: 0x91b1 };
  const linkingGl = { getExtension: (name) => (name === 'KHR_parallel_shader_compile' ? KHR : null),
    getProgramParameter: () => false, isContextLost: () => false };
  const linking = { info: { programs: [] }, getContext: () => linkingGl };
  const runtime = createDeferredCombatWarmRuntime({
    game, renderer: linking, camera: { position: {} },
    getBattleVisuals: () => ({ async stream() {
      for (let k = 0; k < 3; k++) linking.info.programs.push({ id: 900 + k, program: {}, getUniforms: () => ({}), getAttributes: () => ({}) });
      steps.push('enemy-visuals');
    } }),
    *warmVisionSteps() { steps.push('vision'); },
    combatWarm: {
      cancelRare() {},
      async warmOpeningChunked() { steps.push('opening'); },
      async warmRareChunked() { steps.push('rare'); },
    },
    async warmBattleTerrainTiles() { steps.push('terrain-grid'); },
    getWorld: () => null,
    getGeneration: () => current,
    setPending() {},
    prepareNextOpeningRoute: () => { steps.push('route'); return false; },
    now: () => (tick += 250),
    yieldFrame: async () => {},
    createYielder: () => async () => { if (staleDuringEnemies && steps.length === 1) current++; },
  });
  const warned = [];
  const warn = console.warn;
  console.warn = (...args) => { warned.push(args.join(' ')); };
  try { await runtime.schedule(current); } finally { console.warn = warn; }
  const trace = globalThis.__BATTLE_DEFERRED_WARM;
  if (staleDuringEnemies) {
    assert.deepEqual(steps, ['enemy-visuals'], 'a battle gone stale while its enemies link stops the warm');
  } else {
    assert.deepEqual(steps, ['enemy-visuals', 'opening', 'route', 'terrain-grid', 'rare', 'vision'],
      'unfinished enemy links leave every later stage warming');
    assert.equal(trace.error, undefined, 'no failed-warm warning');
    assert.deepEqual(warned, []);
    assert.equal(trace.unfinishedLinks.enemyVisuals.reason, 'budget');
    assert.equal(trace.unfinishedLinks.enemyVisuals.pending, 3, 'the trace counts the unfinished links');
    assert.equal(trace.done, true);
  }
}

// the vision programs (the thermal variants' strict drain) unfinished: the opening, routes, terrain and rare go on;
// another error still fails the warm
for (const thrown of ['budget', 'other']) {
  const steps = [];
  const runtime = createDeferredCombatWarmRuntime({
    game, renderer, camera: { position: {} },
    getBattleVisuals: () => ({ async stream() { steps.push('enemy-visuals'); } }),
    *warmVisionSteps() {
      steps.push('vision');
      yield;
      if (thrown === 'budget') throw new ProgramUniformPreparationError({ status: 'incomplete', reason: 'budget', pending: 4 });
      throw new Error('vision broke');
    },
    combatWarm: { cancelRare() {}, async warmOpeningChunked() { steps.push('opening'); }, async warmRareChunked() { steps.push('rare'); } },
    async warmBattleTerrainTiles() { steps.push('terrain-grid'); },
    getWorld: () => null, getGeneration: () => 70, setPending() {},
    prepareNextOpeningRoute: () => false, now: () => ++clock,
    yieldFrame: async () => {}, createYielder: () => async () => {},
  });
  const warn = console.warn;
  console.warn = () => {};
  try { await runtime.schedule(70); } finally { console.warn = warn; }
  const trace = globalThis.__BATTLE_DEFERRED_WARM;
  if (thrown === 'budget') {
    assert.deepEqual(steps, ['enemy-visuals', 'opening', 'terrain-grid', 'rare', 'vision'], 'unfinished vision links end the warm cleanly');
    assert.deepEqual(trace.unfinishedLinks.visionPrograms, { reason: 'budget', pending: 4 });
    assert.equal(trace.error, undefined);
  } else {
    assert.deepEqual(steps, ['enemy-visuals', 'opening', 'terrain-grid', 'rare', 'vision'], 'any other failure still fails the warm');
    assert.match(trace.error, /vision broke/);
  }
}

delete globalThis.__COMBAT_RARE_WARM;
delete globalThis.__BATTLE_DEFERRED_WARM;
console.log('deferredCombatWarmRuntime.selftest: staged work, cancellation, revision ownership, and warming on past a stage\'s unfinished links (enemy uniforms, vision) passed');
