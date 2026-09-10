import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { box, jitterUV } from './propGeometry.ts';

// Execute the actual public scheduling wrapper with an owned generator fixture.
// Geometry/output equivalence is separately checked by the whole-world profile;
// this test isolates awaited failure and IteratorClose propagation.
const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('export async function createPropsAsync(');
const end = source.indexOf('\nfunction* propsBuildSteps(', start);
assert.ok(start >= 0 && end > start);
const wrapper = stripTypeScriptTypes(source.slice(start, end)).replace('export ', '');
function fixture(steps, acquire = async () => {}, close = () => {}, workerClient = null,
  now = () => performance.now()) {
  const events = [], runtime = {}, args = [];
  const nested = (function* () {
    try {
      for (const step of steps) { events.push(['work', step]); yield step; }
      events.push(['complete']);
      return runtime;
    } finally { events.push(['closed']); close(); }
  })();
  function* build(...values) {
    args.push(values);
    return yield* nested;
  }
  const run = new Function('propsBuildSteps', 'ensureTankBuilder', 'Worker', 'createWreckBakeClient', 'performance',
    wrapper + '\nreturn createPropsAsync;')(build, acquire,
    workerClient ? function Worker() {} : undefined, () => workerClient, { now });
  return { run, events, runtime, args };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

// All clocks are page-clock elapsed intervals, not CPU samples. The worker
// interval includes its checkpoint; adding the two would double-count 7ms.
{
  let clock = 100, disposed = 0;
  const sliceTick = deferred(), beforeCheckpoint = deferred(), checkpointTick = deferred();
  const afterCheckpoint = deferred(), enteredBake = deferred(), enteredCheckpoint = deferred();
  const request = { specId: 't90m', options: {}, result: null }, baked = {};
  const client = {
    prepare() {}, dispose() { disposed++; },
    async bake(id, options, checkpoint) {
      enteredBake.resolve();
      await beforeCheckpoint.promise;
      const pending = checkpoint();
      assert.equal(pending, checkpointTick.promise, 'observer retains original pacing promise identity');
      enteredCheckpoint.resolve();
      await pending;
      await afterCheckpoint.promise;
      return baked;
    },
  };
  const steps = { *[Symbol.iterator]() {
    clock += 2; yield { fine: true };
    clock += 3; yield { fine: true, progress: false, wreckBake: request };
    clock += 2;
  } };
  const f = fixture(steps, undefined, undefined, client, () => clock);
  const ticks = [];
  const result = f.run({}, {}, 2002, null, i => {
    ticks.push(i);
    if (ticks.length === 1) return sliceTick.promise;
    if (ticks.length === 2) return checkpointTick.promise;
    clock += 4;
  }, true);
  assert.equal(clock, 102);
  clock = 107; sliceTick.resolve();
  await enteredBake.promise;
  assert.equal(clock, 110);
  clock = 130; beforeCheckpoint.resolve();
  await enteredCheckpoint.promise;
  clock = 137; checkpointTick.resolve();
  await flush();
  assert.equal(request.result, null, 'held bake never advances the generator');
  clock = 150; afterCheckpoint.resolve();
  const runtime = await result;
  const timing = runtime._buildDetail.awaitTimings;
  assert.equal(runtime._buildDetail.synchronousMs, 7);
  assert.deepEqual(timing.sliceTicks, { count: 2, totalMs: 9, maxMs: 5 });
  assert.deepEqual(timing.wreckCheckpoints, { count: 1, totalMs: 7, maxMs: 7 });
  assert.deepEqual(timing.wreckBakes, { count: 1, totalMs: 40, maxMs: 40 });
  assert.deepEqual(timing.builderImports, { count: 0, totalMs: 0, maxMs: 0 });
  assert.deepEqual(timing.wreckRows, [{ specId: 't90m', startMs: 110, endMs: 150,
    elapsedMs: 40, includedCheckpointMs: 7 }]);
  assert.equal(timing.wreckRowsDropped, 0);
  assert.equal(clock - 100, 7 + timing.sliceTicks.totalMs + timing.wreckBakes.totalMs);
  assert.deepEqual(ticks, [1, 1, 1]);
  assert.equal(request.result, baked);
  assert.equal(disposed, 1);
}
{
  let clock = 20;
  const imported = deferred();
  const f = fixture([{ tankBuilder: 't90m', fine: true }], () => imported.promise,
    undefined, null, () => clock);
  const pending = f.run({}, {}, 2002, null, () => { clock += 2; }, true);
  assert.deepEqual(f.events.map(([kind]) => kind), ['work']);
  clock = 33; imported.resolve();
  const runtime = await pending;
  assert.deepEqual(runtime._buildDetail.awaitTimings.builderImports, { count: 1, totalMs: 13, maxMs: 13 });
  assert.deepEqual(runtime._buildDetail.awaitTimings.sliceTicks, { count: 1, totalMs: 2, maxMs: 2 });
  assert.deepEqual(runtime._buildDetail.awaitTimings.wreckRows, []);
}
{
  let clock = 0;
  const client = { prepare() {}, dispose() {}, async bake(_id, _options, checkpoint) {
    clock += 3; await checkpoint(); return null;
  } };
  const requests = Array.from({ length: 35 }, (_, i) => ({ fine: true,
    wreckBake: { specId: `fixture-${i}`, options: {}, result: null } }));
  const f = fixture(requests, undefined, undefined, client, () => clock);
  const timing = (await f.run({}, {}, 2002, null, null, true))._buildDetail.awaitTimings;
  assert.deepEqual(timing.wreckBakes, { count: 35, totalMs: 105, maxMs: 3 });
  assert.equal(timing.wreckRowsLimit, 32);
  assert.equal(timing.wreckRows.length, 32);
  assert.equal(timing.wreckRowsDropped, 3);
  assert.deepEqual(timing.wreckCheckpoints, { count: 0, totalMs: 0, maxMs: 0 }, 'absent tick is not pacing');
  assert.deepEqual(timing.sliceTicks, { count: 0, totalMs: 0, maxMs: 0 });
}
{
  let clock = 0, index = 0;
  const values = [undefined, null, false, 0, 7, 'ignored', { then: 3 }];
  const f = fixture(values.map(() => ({ fine: true })), undefined, undefined, null, () => clock);
  const runtime = await f.run({}, {}, 2002, null, () => { clock += 2; return values[index++]; }, true);
  assert.equal(index, values.length, 'void callbacks may return ignored synchronous values');
  assert.deepEqual(runtime._buildDetail.awaitTimings.sliceTicks, { count: 7, totalMs: 14, maxMs: 2 });
}
for (const failureAt of ['tick', 'bake', 'import']) {
  let disposed = 0;
  const rejection = deferred();
  const client = { prepare() {}, dispose() { disposed++; }, bake: () => rejection.promise };
  const steps = failureAt === 'bake'
    ? [{ wreckBake: { specId: 't90m', options: {}, result: null } }]
    : [{ tankBuilder: 't90m' }];
  const f = fixture(steps, () => rejection.promise, undefined, failureAt === 'import' ? null : client);
  const pending = f.run({}, {}, 2002, null, () => rejection.promise, true);
  rejection.reject(0);
  await assert.rejects(pending, error => error === 0, 'timing cannot replace falsy rejections');
  assert.equal(f.runtime._buildDetail, undefined);
  assert.equal(f.args[0][6].signal.aborted, true);
  assert.equal(disposed, failureAt === 'import' ? 0 : 1);
  assert.deepEqual(f.events.map(([kind]) => kind), ['work', 'closed']);
}

// Execute the actual map wrapper: the archive request begins before independent
// work, but only time spent at its existing consumer await is reported.
{
  const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const begin = mapSource.indexOf('export async function createMapAsync(');
  const end = mapSource.indexOf('\n/**', begin);
  assert.ok(begin > 0 && end > begin);
  const code = stripTypeScriptTypes(mapSource.slice(begin, end)).replace('export ', '');
  for (const fail of [false, true]) {
    let clock = 0, cancelled = 0;
    const events = [], archive = deferred(), props = { _buildDetail: {} }, world = {};
    const height = { _layout: { spawns: { player: {} } } };
    const ports = {
      getMapConfig: () => ({ id: 'urban', splat: {} }),
      preloadPropModels: () => { events.push('archive-request'); return archive.promise; },
      prepareSourcedTerrain: () => ({ cancel() { cancelled++; } }),
      createHeightFieldAsync: async () => { clock += 10; return height; },
      createHeightField: () => assert.fail('fine path stays async'),
      requireTerrainRoot: value => value,
      buildTerrainMeshesAsync: async () => { clock += 20; return { userData: {} }; },
      createVegetationAsync: async () => { clock += 30; return {}; },
      createPropsAsync: async () => { events.push('props'); clock += 5; return props; },
      assembleWorld: () => { events.push('assemble'); return world; },
      performance: { now: () => clock },
    };
    const run = new Function(...Object.keys(ports), code + '\nreturn createMapAsync;')(...Object.values(ports));
    const pending = run({}, { mapId: 'urban' }, label => { clock++; events.push(label); }, { fineSlices: true });
    await flush();
    assert.equal(clock, 64);
    assert.equal(events[0], 'archive-request');
    assert.equal(events.includes('props'), false);
    clock = 164;
    if (fail) {
      archive.reject(0);
      await assert.rejects(pending, error => error === 0);
      assert.equal(cancelled, 1);
      assert.equal(events.includes('props'), false);
      assert.equal(events.includes('assemble'), false);
    } else {
      archive.resolve();
      assert.equal(await pending, world);
      assert.equal(cancelled, 0);
      assert.deepEqual(world._buildDetail.props.propModelsAwait,
        { count: 1, totalMs: 100, maxMs: 100, startMs: 64, endMs: 164 });
    }
  }
}

{
  const calls = [], request = { specId: 't90m', options: { seed: 2002, pop: true }, result: null };
  const baked = {};
  const client = {
    prepare() {},
    async bake(id, options, checkpoint) {
      calls.push([id, options]);
      await checkpoint(); await checkpoint();
      return baked;
    },
    dispose() { calls.push('disposed'); },
  };
  const f = fixture([{ fine: true, tankBuilder: 't90m' },
    { fine: true, progress: false, wreckBake: request }],
  () => { throw new Error('worker path must not load a main-thread donor'); }, () => {}, client);
  const ticks = [];
  await f.run({}, {}, 2002, null, value => ticks.push(value), true);
  assert.equal(f.args[0][5], true, 'browser wrapper selects remote generator seam');
  assert.equal(f.args[0][6].worker, true);
  assert.equal(f.args[0][6].signal.aborted, false, 'successful build retains pending source settlement');
  assert.equal(request.result, baked);
  assert.deepEqual(ticks, [1, 1, 1, 1], 'worker waits check ownership without fake progress');
  assert.deepEqual(calls, [['t90m', request.options], 'disposed']);
}
{
  const failure = new Error('worker transfer failed');
  let disposed = 0;
  const client = { prepare() {}, async bake() { throw failure; }, dispose() { disposed++; } };
  const f = fixture([{ fine: true, wreckBake: { specId: 'k2', options: {}, result: null } }],
    undefined, undefined, client);
  await assert.rejects(f.run({}, {}, 2002, null, null, true), error => error === failure);
  assert.equal(disposed, 1);
  assert.deepEqual(f.events.map(([event]) => event), ['work', 'closed']);
  assert.equal(f.args[0][6].signal.aborted, true, 'failed worker await cancels this build source consumer');
}
for (const props of [{ wrecks: 0 }, { tankWrecks: { count: 0 } }]) {
  const client = { prepare() { assert.fail('empty wreck cast must not start a worker'); },
    dispose() { assert.fail('no worker owner was admitted'); } };
  const f = fixture([], undefined, undefined, client);
  await f.run({}, {}, 2002, { props });
  assert.equal(f.args[0][5], false);
}

for (const failureAt of ['tick', 'import', 'generator']) {
  const failure = new Error(`cancel ${failureAt}`);
  const steps = failureAt === 'generator' ? {
    *[Symbol.iterator]() { yield undefined; throw failure; },
  } : [failureAt === 'import' ? { tankBuilder: 'k2', fine: true } : undefined];
  const f = fixture(steps, async () => { throw failure; });
  await assert.rejects(f.run({}, {}, 2002, null,
    failureAt === 'tick' ? () => { throw failure; } : null, true), error => error === failure);
  assert.equal(f.args[0][6].signal.aborted, true, `${failureAt}: cancel only the failed build source lease`);
}
{
  const failure = new Error('first generator advance failed');
  let disposed = 0;
  const client = { prepare() { assert.fail('first advance never completed'); }, dispose() { disposed++; } };
  const steps = { *[Symbol.iterator]() { throw failure; } };
  const f = fixture(steps, undefined, undefined, client);
  await assert.rejects(f.run({}, {}, 2002, null, null, true), error => error === failure);
  assert.equal(f.args[0][6].signal.aborted, true, 'first advance failure cancels newly launched source work');
  assert.equal(disposed, 1, 'first advance failure releases the admitted wreck worker');
  assert.deepEqual(f.events, [['closed']]);
}

// Execute the real remote bake/cache seam and close it at the transfer/tick
// boundary. A result cannot leak while waiting to enter the map-owned cache.
{
  const begin = source.indexOf('      function* bakeFor(');
  const end = source.indexOf('\n      function* placeWreck(', begin);
  assert.ok(begin > 0 && end > begin);
  const code = stripTypeScriptTypes(source.slice(begin, end));
  const make = (cache, disposed) => new Function('bakeCache', 'workerWrecks', 'seed', 'disposeWreckGeometry',
    code + '\nreturn bakeFor;')(cache, true, 2002, geo => disposed.push(geo));
  const cache = new Map(), disposed = [], geo = {}, shadowGeo = {};
  const bake = make(cache, disposed);
  const abandoned = bake('k2', true);
  const step = abandoned.next().value;
  assert.deepEqual(step.wreckBake.options, { seed: 2002, pop: true });
  step.wreckBake.result = { geo, shadowGeo };
  abandoned.return();
  assert.deepEqual(disposed, [geo, shadowGeo]);
  assert.equal(cache.size, 0);
  disposed.length = 0;
  const adopted = bake('k2', true);
  adopted.next().value.wreckBake.result = { geo, shadowGeo };
  assert.deepEqual(adopted.next(), { done: true, value: { geo, shadowGeo } });
  assert.deepEqual(disposed, [], 'cache owns successful transfer');
  assert.equal(cache.size, 1);
  assert.equal(bake('k2', true).next().done, true, 'cached recipe never queues a duplicate worker job');
}

{
  const f = fixture([{ fine: true, stage: 'first' }, undefined, { fine: true, stage: 'last' }]);
  const ticks = [], height = {}, engine = {}, config = {}, vegetation = {};
  const result = await f.run(height, engine, 82, config,
    (done, total) => ticks.push([done, total]), true, vegetation);
  assert.equal(result, f.runtime);
  assert.deepEqual(f.args, [[height, engine, 82, config, vegetation, false, f.args[0][6]]]);
  assert.equal(f.args[0][6].worker, true);
  assert.equal(f.args[0][6].signal.aborted, false);
  assert.deepEqual(ticks, [[1, 180], [2, 180], [3, 180]]);
  assert.equal(result._buildDetail.sliceCount, 4);
  assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
  assert.equal(f.events.at(-2)[0], 'complete');
}
{
  const f = fixture([{ fine: true }, undefined, { stage: 'coarse' }]);
  const ticks = [];
  await f.run({}, {}, 2002, null, (done, total) => ticks.push([done, total]), false);
  assert.deepEqual(ticks, [[1, 9], [2, 9]], 'legacy coarse callers keep their paint cadence');
}
{
  const f = fixture([{ fine: true, tankBuilder: 't90m' },
    ...Array.from({ length: 300 }, () => ({ fine: true, progress: false, stage: 'vertex-batch' })),
    { fine: true, stage: 'placed' }]);
  const ticks = [];
  const runtime = await f.run({}, {}, 2002, null, done => ticks.push(done), true);
  assert.equal(ticks.length, 302, 'every internal batch still reaches the task/paint scheduler');
  assert.deepEqual(ticks.slice(0, -1), Array(301).fill(1));
  assert.equal(ticks.at(-1), 2, 'micro-batches cannot prematurely fill the structure loading bar');
  assert.equal(runtime._buildDetail.sliceCount, 303, 'timing records every actual batch');
}
for (const failureStage of ['tick', 'builder']) {
  const failure = new Error('original ' + failureStage + ' rejection');
  const f = fixture([{ fine: true, tankBuilder: 't90m' }, { fine: true }],
    async () => { if (failureStage === 'builder') throw failure; });
  await assert.rejects(f.run({}, {}, 2002, null, async () => { throw failure; }, true),
    error => error === failure);
  assert.deepEqual(f.events.map(([event]) => event), ['work', 'closed'],
    'awaited rejection reaches the delegated producer finally, without another construction step');
  assert.equal(f.runtime._buildDetail, undefined, 'partial runtime is never published');
}
{
  const failure = new Error('original tick failure');
  const f = fixture([{ stage: 'owned' }], async () => {}, () => { throw new Error('disposer failed'); });
  await assert.rejects(f.run({}, {}, 2002, null, async () => { throw failure; }, true),
    error => error === failure, 'IteratorClose cannot mask the original failure');
}
{
  const helperStart = source.indexOf('      function disposeWreckBakeCache()');
  const helperEnd = source.indexOf('\n      try {\n        yield* placeAuthoredWrecks();', helperStart);
  assert.ok(helperStart > 0 && helperEnd > helperStart);
  const helpers = stripTypeScriptTypes(source.slice(helperStart, helperEnd));
  const seen = [];
  const geometry = name => ({ dispose() { seen.push(name); if (name === 'failed') throw new Error(name); } });
  const cache = new Map([['first', { geo: geometry('failed'), shadowGeo: geometry('shadow') }],
    ['empty', null], ['last', { geo: geometry('last') }]]);
  const drain = new Function('bakeCache', helpers + '\nreturn { cache: disposeWreckBakeCache, placed: disposePlacedWreckGeometries };')(cache);
  drain.cache(); drain.cache();
  assert.equal(cache.size, 0);
  assert.deepEqual(seen, ['failed', 'shadow', 'last'], 'failed disposal cannot strand the remaining cache');
  seen.length = 0;
  const placed = [geometry('last'), geometry('failed')];
  drain.placed(placed); drain.placed(placed);
  assert.equal(placed.length, 0);
  assert.deepEqual(seen, ['failed', 'last'], 'ownership removed before each disposer; never double-dispose');
}
{
  let release, entered;
  const boundary = new Promise(resolve => { release = resolve; });
  const paused = new Promise(resolve => { entered = resolve; });
  const failure = new Error('abandoned loading ownership');
  const f = fixture([{ stage: 'owned-wreck' }, { stage: 'must-not-start' }]);
  const pending = f.run({}, {}, 2002, null, async () => {
    entered(); await boundary; throw failure;
  }, true);
  const rejected = assert.rejects(pending, error => error === failure);
  await paused;
  assert.deepEqual(f.events.map(([event]) => event), ['work']);
  release(); await rejected;
  assert.deepEqual(f.events.map(([event]) => event), ['work', 'closed']);
}

// Exercise the actual nested placement generator. Only geometry/terrain/bake
// dependencies are small fixtures; donor selection and success/rejection
// ordering below are production source, not a second selection algorithm.
const placementStart = source.indexOf('      function* placeWreck(');
const placementEnd = source.indexOf('\n      let placedW = 0;', placementStart);
assert.ok(placementStart > 0 && placementEnd > placementStart);
const placementSource = stripTypeScriptTypes(source.slice(placementStart, placementEnd));
const wreckCast = ['m551_sheridan', 'marder1a3', 'leo2a7v', 'm1a1', 't90a'];

function placementFixture({ authored = true, random = () => 0.25, code = placementSource } = {}) {
  const state = { nullBake: false, maxEmbed: 0, bakes: [], bakeDrains: 0, randomCalls: 0 };
  const outputs = { wreckGeos: [], wreckShadowGeos: [], obstacles: [], colliders: [],
    wreckScorch: [], tankWreckSpots: [], decorationGroundingReceipts: [] };
  const geometry = { clone: () => ({ rotateY() {}, applyQuaternion() {}, translate() {} }) };
  const baked = { geo: geometry, shadowGeo: geometry, tris: 12, hx: 2, hz: 3, h: 2 };
  const dependencies = {
    ...outputs, pool: wreckCast,
    wCfg: { debris: false, ...(authored ? { ids: wreckCast } : {}) },
    wrng() { state.randomCalls++; return random(); },
    *bakeFor(specId, pop) {
      state.bakes.push({ specId, pop });
      try { yield { fine: true, stage: 'fixture-bake' }; return state.nullBake ? null : baked; }
      finally { state.bakeDrains++; }
    },
    planGroundedObbPose: () => ({ y: 0, normalX: 0, normalY: 1, normalZ: 0,
      min: 0, max: 0, spread: 0, maxEmbed: state.maxEmbed, maxFloat: 0 }),
    heightField: {}, _quat: { setFromUnitVectors() {} }, _upAxis: {},
    _posv: { set() { return this; } },
    setObbShape: record => record, cloneCollisionRecord: record => structuredClone(record),
  };
  const api = new Function('dependencies', `
    const { ${Object.keys(dependencies).join(', ')} } = dependencies;
    let bakedTris = 0, wreckSerial = 0, wreckPickSerial = 0;
    ${code}
    return { placeWreck, selectedSlots: () => wreckPickSerial, triangles: () => bakedTris };
  `)(dependencies);
  return { ...api, state, outputs };
}

function attemptWreck(f) {
  const steps = f.placeWreck(12, 24, 0.3), checkpoints = [];
  try {
    let step = steps.next();
    while (!step.done) { checkpoints.push(step.value); step = steps.next(); }
    return { placed: step.value, selected: checkpoints[0].tankBuilder };
  } finally { steps.return(); }
}

function assertNoPlacement(f) {
  assert.equal(f.selectedSlots(), 0, 'failed/cancelled attempt does not consume an authored donor');
  assert.equal(f.triangles(), 0);
  for (const output of Object.values(f.outputs)) assert.equal(output.length, 0,
    'failed/cancelled attempt publishes no placement, collision, shadow or grounding record');
}

function assertRejectedWreckRetry(code = placementSource) {
  const f = placementFixture({ code });
  f.state.maxEmbed = 2;
  assert.deepEqual(attemptWreck(f), { placed: false, selected: wreckCast[0] });
  assertNoPlacement(f);
  f.state.maxEmbed = 0; f.state.nullBake = true;
  assert.deepEqual(attemptWreck(f), { placed: false, selected: wreckCast[0] },
    'null bake retries the same donor after rejected terrain');
  assertNoPlacement(f);
  f.state.nullBake = false;
  for (const [index, id] of wreckCast.entries()) {
    assert.deepEqual(attemptWreck(f), { placed: true, selected: id });
    assert.equal(f.selectedSlots(), index + 1, 'only a completed placement consumes one slot');
  }
  assert.deepEqual(f.outputs.tankWreckSpots.map(spot => spot.specId), wreckCast,
    'a count-sized authored cast places every donor once despite earlier rejections');
  assert.equal(f.outputs.wreckGeos.length, wreckCast.length);
  assert.equal(f.outputs.wreckShadowGeos.length, wreckCast.length);
  assert.equal(f.outputs.colliders.length, wreckCast.length);
}
assertRejectedWreckRetry();

// Restore the observed defect in memory: selection itself consumed the slot.
// The same functional assertion must reject this exact old ordering.
const selection = 'pool[wreckPickSerial % pool.length]';
const commitSelection = '        wreckPickSerial++;';
assert.equal(placementSource.split(selection).length, 2);
assert.equal(placementSource.split(commitSelection).length, 2);
const rejectedSelectionControl = placementSource.replace(selection,
  'pool[wreckPickSerial++ % pool.length]').replace(commitSelection, '');
assert.throws(() => assertRejectedWreckRetry(rejectedSelectionControl), assert.AssertionError,
  'pre-fix attempt-based selection fails the actual placement regression');

for (const cancelAt of ['builder', 'bake']) {
  const f = placementFixture(), steps = f.placeWreck(12, 24, 0.3);
  assert.equal(steps.next().value.tankBuilder, wreckCast[0]);
  if (cancelAt === 'bake') assert.equal(steps.next().value.stage, 'fixture-bake');
  steps.return();
  assertNoPlacement(f);
  assert.equal(f.state.bakeDrains, cancelAt === 'bake' ? 1 : 0,
    'IteratorClose drains an entered bake before a later placement attempt');
  assert.deepEqual(attemptWreck(f), { placed: true, selected: wreckCast[0] },
    `${cancelAt}: cancellation before placement preserves the authored slot`);
}

const rngStart = source.indexOf('export function mulberry32(');
const rngEnd = source.indexOf('\nfunction clamp(', rngStart);
assert.ok(rngStart > 0 && rngEnd > rngStart);
const seededRandom = new Function(stripTypeScriptTypes(source.slice(rngStart, rngEnd))
  .replace('export ', '') + '\nreturn mulberry32;')();
{
  const random = seededRandom(2911), expectedRandom = seededRandom(2911);
  const f = placementFixture({ authored: false, random }), expected = [];
  for (let i = 0; i < 8; i++) {
    const specId = wreckCast[(expectedRandom() * wreckCast.length) | 0];
    expected.push({ specId, pop: expectedRandom() < 0.45 });
    assert.deepEqual(attemptWreck(f), { placed: true, selected: specId });
  }
  assert.deepEqual(f.state.bakes, expected, 'unauthored donors and pop poses retain seeded RNG order');
  assert.equal(f.state.randomCalls, 16, 'fallback consumes one selection draw and one pose draw');
}

// Execute the entire unchanged decal owner, including conformed geometry,
// seeded scars and churn alpha processing. Canvas commands use deterministic
// spies, not native rasterization; no WebGL, image loading or timers are needed.
const groundStart = source.indexOf('  function* placeGroundBlendDecals()');
const groundEnd = source.indexOf('\n  yield* placeGroundBlendDecals();', groundStart);
assert.ok(groundStart > 0 && groundEnd > groundStart);
const groundCandidate = source.slice(groundStart, groundEnd);
const groundOriginal = groundCandidate
  .replace('function* placeGroundBlendDecals(): Generator<PropsBuildSlice, void, void>',
    'function placeGroundBlendDecals(): void')
  .replace(/function\* (collectFoundationDecals|collectCourtyardDecals|placeFoundationDecals)(\([\s\S]*?\)): Generator<PropsBuildSlice, void, void>/g,
    'function $1$2: void')
  .replace(/yield\* (collectFoundationDecals|collectCourtyardDecals|placeFoundationDecals)\(/g, '$1(')
  .replace(/\n        yield \{ fine: true, progress: false, stage: 'ground-foundation-instances' \};/g, '')
  .replace(/      let collected = false;\n      try \{\n([\s\S]*?)        collected = true;\n      } finally \{[\s\S]*?^      }\n/m,
    (_owner, collection) => collection.replace(/^  /gm, ''))
  .replace(/\n    \/\/ Yield only after a complete family transfers its meshes to the props\n    \/\/ group\. Foundation inputs above stay private until collection completes\./, '')
  .replace(/\n    yield \{ fine: true, progress: false, stage: 'ground-(foundations|scars)' \};/g, '');
// Frozen pre-change body: reconstructing the synchronous control above must
// remove only scheduling, never silently share a changed formula with control.
assert.equal(createHash('sha256').update(groundOriginal).digest('hex'),
  '5f9a3ac81e2135e1204c95e3cf62bab5dd3d4a884530b245bda2072ff2f0791e');
const mathStart = source.indexOf('function clamp('), mathEnd = source.indexOf('\n// ---', mathStart);
const rubbleStart = source.indexOf('  const _rubbleOff ='), rubbleEnd = source.indexOf('\n  function addRubblePile(', rubbleStart);
assert.ok(mathEnd > mathStart && rubbleEnd > rubbleStart);
const groundHelpers = source.slice(mathStart, mathEnd) + source.slice(rubbleStart, rubbleEnd);

function groundFixture(code = groundCandidate, streetRows = true, foundry = false, {
  buildings = 1, crushables = 1, stacks = 1, rejectCourtyards = false, disposeFailureAt = -1,
} = {}) {
  const group = new THREE.Group(), buckets = { stone: [] }, commands = [], randoms = [], textures = [];
  const inputs = [], disposedInputs = [], heightQueries = [], privateRandoms = [];
  class InputGeometry extends THREE.BufferGeometry {
    constructor() {
      super();
      const index = inputs.length;
      inputs.push(this);
      this.addEventListener('dispose', () => {
        disposedInputs.push(this);
        if (index === disposeFailureAt) throw new Error('input disposal failed');
      });
    }
  }
  const buildingFeatures = Array.from({ length: buildings }, (_, index) =>
    ({ x: 38 + index * 10, z: 40, w: 6, d: 9, rot: 0.35 }));
  const random = seededRandom(2002);
  const canvas = {};
  const ctx = {
    clearRect(...args) { commands.push(['clear', ...args]); },
    createLinearGradient(...args) {
      const gradient = { stops: [], addColorStop(...stop) { this.stops.push(stop); } };
      commands.push(['gradient', ...args, gradient.stops]); return gradient;
    },
    fillRect(...args) { commands.push(['fill', typeof this.fillStyle === 'string' ? this.fillStyle : this.fillStyle.stops, ...args]); },
    getImageData(_x, _y, width, height) {
      return { data: Uint8ClampedArray.from({ length: width * height * 4 }, (_, index) => index % 251) };
    },
    putImageData(image) { canvas.pixels = image.data; },
  };
  const dependencies = {
    THREE: { ...THREE, BufferGeometry: InputGeometry }, mergeGeometries, box, jitterUV, group, buckets, buildingFeatures,
    rng() { const value = random(); randoms.push(value); return value; },
    mulberry32(seed) {
      const next = seededRandom(seed);
      return () => { const value = next(); privateRandoms.push([seed, value]); return value; };
    },
    seed: 2002, aniso: 4, noi: { noise: (x, y) => Math.sin(x + y) * 0.5 },
    document: { createElement(tag) { assert.equal(tag, 'canvas'); return canvas; } },
    canvas2d() { return ctx; },
    engineCtx: { setupShadowMaterial() {} },
    makeGroundDecalTexture(_noise, anisotropy, kind) {
      const texture = new THREE.Texture(); texture.name = kind; texture.anisotropy = anisotropy;
      textures.push(texture); commands.push(['texture', kind]); return texture;
    },
    P: { streetRows, townCraters: true, craters: 8 },
    L: { spawns: { player: { x: -100, z: -100 }, enemies: [{ x: 100, z: 100 }] } },
    v: { cx: 10, cz: 40, x0: -65, x1: 65, z0: -65, z1: 65 },
    heightField: { getHeightAt(x, z) { heightQueries.push([x, z]); return x * 0.001 + z * 0.002; },
      _roadDist: () => 10, getGroundType: () => 'hard', getNormalAt: () => ({ y: 1 }) },
    noVeg: () => rejectCourtyards, placedB: [],
    crushables: Array.from({ length: crushables }, (_, index) => ({ x: 12 + index, z: 18 })),
    stackSpots: Array.from({ length: stacks }, (_, index) => ({ x: 8 + index, z: 16, r: 2 })), wreckScorch: [[-20, 50]],
    foundryDonors: foundry ? [{ feature: buildingFeatures[0] }] : null,
  };
  const api = new Function(...Object.keys(dependencies), stripTypeScriptTypes(
    groundHelpers + '\nlet reconformFoundryFoundations = null;\n' + code)
    + '\nreturn { run: placeGroundBlendDecals, reconform: () => reconformFoundryFoundations?.() };')(...Object.values(dependencies));
  const geometry = geo => ({ index: geo.index ? Array.from(geo.index.array) : null,
    attributes: Object.fromEntries(Object.entries(geo.attributes).map(([name, attr]) => [name, Array.from(attr.array)])) });
  return { ...api, group, buckets, randoms, commands, buildingFeatures, inputs, disposedInputs,
    foundationCount: buildings + crushables + stacks + (streetRows && !rejectCourtyards ? 84 : 0),
    kinds: () => group.children.map(mesh => mesh.userData.terrainDecalKind),
    snapshot: () => ({ randoms, privateRandoms, heightQueries, commands, pixels: canvas.pixels, clods: buckets.stone.map(geometry),
      meshes: group.children.map(mesh => ({ geometry: geometry(mesh.geometry), data: mesh.userData,
        receiveShadow: mesh.receiveShadow, castShadow: mesh.castShadow, order: mesh.renderOrder,
        map: mesh.material.map.name, transparent: mesh.material.transparent, depthWrite: mesh.material.depthWrite })) }),
    dispose() {
      for (const mesh of group.children) {
        mesh.geometry.dispose(); textures.push(mesh.material.map); mesh.material.dispose();
      }
      for (const geo of buckets.stone) geo.dispose();
      for (const texture of new Set(textures)) texture.dispose();
    },
  };
}

function advanceFoundationInputs(h, iterator) {
  for (let index = 0; index < h.foundationCount; index++) {
    assert.deepEqual(iterator.next(), { done: false,
      value: { fine: true, progress: false, stage: 'ground-foundation-instances' } });
    assert.equal(h.inputs.length, index + 1, 'only one complete instance precedes each private checkpoint');
    const geometry = h.inputs[index];
    assert.ok(geometry.index && geometry.getAttribute('position') && geometry.getAttribute('normal'));
    assert.deepEqual(h.kinds(), [], 'no partially collected foundation mesh is published');
    assert.deepEqual(h.commands, [], 'no texture or Canvas work begins during collection');
    assert.deepEqual(h.disposedInputs, [], 'private inputs remain available until resume or cancellation');
  }
}

for (const [streetRows, foundry, options] of [
  [true, false, {}], [false, true, { buildings: 5, crushables: 3, stacks: 2 }],
  [true, false, { buildings: 2, rejectCourtyards: true }],
]) {
  const before = groundFixture(groundOriginal, streetRows, foundry, options);
  const after = groundFixture(groundCandidate, streetRows, foundry, options);
  try {
    before.run();
    const iterator = after.run();
    advanceFoundationInputs(after, iterator);
    assert.deepEqual(iterator.next(), { done: false, value: { fine: true, progress: false, stage: 'ground-foundations' } });
    assert.deepEqual(after.kinds(), streetRows ? ['ground-contact', 'apron'] : ['ground-contact']);
    assert.equal(after.randoms.length, 0, 'scar RNG has not started at the first boundary');
    assert.deepEqual(iterator.next(), { done: false, value: { fine: true, progress: false, stage: 'ground-scars' } });
    assert.equal(after.kinds().includes('crater'), !options.rejectCourtyards);
    assert.ok(after.kinds().includes('scorch'));
    assert.equal(after.commands.some(command => command[0] === 'clear'), false, 'churn painter has not started');
    assert.equal(iterator.next().done, true);
    assert.equal(after.kinds().includes('churn'), !options.rejectCourtyards);
    assert.equal(after.buckets.stone.length > 0, !options.rejectCourtyards);
    assert.ok(after.randoms.length > 0);
    assert.deepEqual(after.snapshot(), before.snapshot(), 'exact geometry, RNG, material policy and canvas command/alpha parity');
    if (foundry) {
      before.buildingFeatures[0].x += 4; after.buildingFeatures[0].x += 4;
      before.reconform(); after.reconform();
      assert.deepEqual(after.snapshot(), before.snapshot(), 'foundry retains the same merged foundation geometry and vertex windows');
    }
  } finally { before.dispose(); after.dispose(); }
}

// Real async wrapper must pace both new boundaries without advancing coarse
// progress. Rejection closes the delegated iterator before another family runs.
for (const cancelAt of ['ground-foundations', 'ground-scars', null]) {
  const h = groundFixture(), iterator = h.run(), failure = new Error('cancel decal family'), ticks = [];
  const steps = (function* () { yield* iterator; yield { fine: true, stage: 'ground-decals' }; })();
  const f = fixture(steps);
  try {
    const pending = f.run({}, {}, 2002, { props: { wrecks: 0 } }, (done, total) => {
      ticks.push([done, total]);
      if (f.events.at(-1)[1]?.stage === cancelAt) throw failure;
    }, true);
    if (cancelAt === null) {
      await pending;
      assert.deepEqual(ticks, [...Array.from({ length: h.foundationCount }, () => [0, 180]),
        [0, 180], [0, 180], [1, 180]]);
      assert.ok(h.kinds().includes('churn'));
    } else {
      await assert.rejects(pending, error => error === failure);
      assert.equal(iterator.next().done, true);
      assert.equal(h.kinds().includes('crater'), cancelAt === 'ground-scars');
      assert.equal(h.kinds().includes('churn'), false);
      assert.equal(h.commands.some(command => command[0] === 'clear'), false);
      assert.equal(f.runtime._buildDetail, undefined, 'cancelled props cannot publish a runtime');
      assert.equal(f.args[0][6].signal.aborted, true);
    }
    assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
  } finally { h.dispose(); }
}

// Cancel at first/last building, last crushable/stack and first/last courtyard.
// The real public wrapper closes both delegated collectors, including when an
// individual disposer throws; no later instance, Canvas command or runtime runs.
for (const cancelAt of [0, 2, 4, 6, 7, 90]) {
  const h = groundFixture(groundCandidate, true, false,
    { buildings: 3, crushables: 2, stacks: 2, disposeFailureAt: cancelAt === 7 ? 0 : -1 });
  const iterator = h.run(), f = fixture(iterator), failure = new Error('cancel private foundation'), ticks = [];
  try {
    await assert.rejects(f.run({}, {}, 2002, { props: { wrecks: 0 } }, (done, total) => {
      ticks.push([done, total]);
      if (ticks.length - 1 === cancelAt) return Promise.reject(failure);
    }, true), error => error === failure);
    assert.equal(h.inputs.length, cancelAt + 1);
    assert.deepEqual(new Set(h.disposedInputs), new Set(h.inputs), 'release every completed private input');
    assert.equal(h.disposedInputs.length, h.inputs.length, 'dispose each input exactly once');
    assert.deepEqual(h.commands, []);
    assert.deepEqual(h.kinds(), []);
    assert.deepEqual(h.randoms, []);
    assert.deepEqual(ticks, Array.from({ length: cancelAt + 1 }, () => [0, 180]));
    assert.equal(iterator.next().done, true);
    assert.equal(f.runtime._buildDetail, undefined);
    assert.equal(f.args[0][6].signal.aborted, true);
    assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
  } finally { h.dispose(); }
}
{
  const h = groundFixture(), iterator = h.run(), f = fixture(iterator);
  const failure = new Error('held foundation checkpoint rejected');
  let rejectTick;
  const heldTick = new Promise((_resolve, reject) => { rejectTick = reject; });
  const pending = f.run({}, {}, 2002, { props: { wrecks: 0 } }, () => heldTick, true);
  try {
    assert.equal(h.inputs.length, 1, 'an unresolved tick holds exactly its completed instance');
    assert.deepEqual(h.commands, []);
    assert.deepEqual(h.kinds(), []);
    assert.deepEqual(h.disposedInputs, []);
    rejectTick(failure);
    await assert.rejects(pending, error => error === failure);
    assert.equal(h.inputs.length, 1);
    assert.deepEqual(h.disposedInputs, h.inputs);
    assert.equal(iterator.next().done, true);
    assert.equal(f.runtime._buildDetail, undefined);
  } finally { h.dispose(); }
}
{
  const before = groundFixture(groundOriginal, false), after = groundFixture(groundCandidate, false);
  const f = fixture(after.run()), ticks = [];
  try {
    before.run();
    await f.run({}, {}, 2002, { props: { wrecks: 0 } }, (...tick) => ticks.push(tick), false);
    assert.deepEqual(ticks, [], 'coarse callers gain no callbacks or awaited foundation boundary');
    assert.deepEqual(after.snapshot(), before.snapshot());
  } finally { before.dispose(); after.dispose(); }
}

// Freeze the entire original street block, not a second implementation of its
// geometry: only two completed-family yields may differ from base 03748e0b0.
const streetStart = source.indexOf('  function beginWaterworksRubbleCapture()');
const streetLast = "  yield { fine: true, stage: 'street-details' };\n";
const streetEnd = source.indexOf(streetLast, streetStart);
assert.ok(streetStart > 0 && streetEnd > streetStart);
const streetCandidate = source.slice(streetStart, streetEnd + streetLast.length);
const streetOriginal = streetCandidate.replace(
  /\n  yield \{ fine: true, progress: false, stage: 'street-(rubble|curbs)' \};/g, '');
assert.equal(createHash('sha256').update(streetOriginal).digest('hex'),
  '5f879376acf5557e58bf385034ca03d3e1d7666cc21e25c05fd77a43c34374b7');

function streetFixture(code = streetCandidate) {
  const completed = [], randoms = [], packets = [], random = seededRandom(2002);
  const complete = family => { completed.push(family); randoms.push(random()); };
  const operations = {
    beginWaterworksRubbleCapture() { return packets; },
    placeStreetRubble() { complete('rubble'); },
    placeStreetCurbs() { complete('curbs'); },
    placeCentralMonument() { complete('monument'); },
  };
  // The bodies above are hash-frozen. Replace only those declarations with
  // completed-operation spies; retain the actual caller/yield scheduling text.
  for (const name of Object.keys(operations)) {
    const declaration = new RegExp(`^  function ${name}\\([^\\n]*\\n[\\s\\S]*?^  }\\n`, 'm');
    assert.ok(declaration.test(code), name);
    code = code.replace(declaration, '');
  }
  const run = new Function(...Object.keys(operations),
    `return function* () {\n${code}\n};`)(...Object.values(operations));
  return { iterator: run(), completed, randoms };
}

const streetControl = streetFixture(streetOriginal);
assert.deepEqual([...streetControl.iterator], [{ fine: true, stage: 'street-details' }]);
for (const cancelAt of [0, 1, null]) {
  const h = streetFixture(), f = fixture(h.iterator), ticks = [];
  const failure = new Error('cancel street family');
  const pending = f.run({}, {}, 2002, { props: { wrecks: 0 } }, (done, total) => {
    ticks.push([done, total]);
    assert.deepEqual(h.completed, ['rubble', 'curbs', 'monument'].slice(0, ticks.length),
      'each checkpoint follows only its completed family');
    if (ticks.length - 1 === cancelAt) throw failure;
  }, true);
  if (cancelAt === null) {
    await pending;
    assert.deepEqual(ticks, [[0, 180], [0, 180], [1, 180]]);
    assert.deepEqual(h.completed, streetControl.completed);
    assert.deepEqual(h.randoms, streetControl.randoms, 'new waits preserve deterministic operation order');
    assert.deepEqual(f.events.filter(([event]) => event === 'work').map(([, step]) => step), [
      { fine: true, progress: false, stage: 'street-rubble' },
      { fine: true, progress: false, stage: 'street-curbs' },
      { fine: true, stage: 'street-details' },
    ]);
  } else {
    await assert.rejects(pending, error => error === failure);
    assert.deepEqual(ticks, Array.from({ length: cancelAt + 1 }, () => [0, 180]));
    assert.deepEqual(h.completed, streetControl.completed.slice(0, cancelAt + 1));
    assert.deepEqual(h.randoms, streetControl.randoms.slice(0, cancelAt + 1));
    assert.equal(h.iterator.next().done, true, 'IteratorClose prevents every later family');
    assert.equal(f.runtime._buildDetail, undefined, 'cancelled street work cannot publish a runtime');
    assert.equal(f.args[0][6].signal.aborted, true);
  }
  assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
}
{
  const h = streetFixture(), f = fixture(h.iterator), ticks = [];
  await f.run({}, {}, 2002, null, (...tick) => ticks.push(tick), false);
  assert.deepEqual(ticks, [], 'legacy coarse callers do not gain a new paint boundary');
  assert.deepEqual(h.completed, streetControl.completed);
  assert.deepEqual(h.randoms, streetControl.randoms);
}

// Each checkpoint follows completed work, before the next expensive owner;
// no geometry formula, RNG draw or source-acquisition order is rewritten.
for (const [operation, stage, next] of [
  ['yield* placeTankWrecks();', 'wrecks-finalized', 'function beginWaterworksRubbleCapture'],
  ['placeStreetRubble();', 'street-rubble', 'function placeStreetCurbs'],
  ['placeStreetCurbs();', 'street-curbs', 'function placeCentralMonument'],
  ['placeCentralMonument();', 'street-details', 'function* placeGroundBlendDecals'],
  ['yield* placeFoundationDecals();', 'ground-foundations', 'placeBattleScars(corridors);'],
  ['placeBattleScars(corridors);', 'ground-scars', 'placeTrackTears(corridors);'],
  ['yield* placeGroundBlendDecals();', 'ground-decals', 'let poleIM:'],
  ['  dressMapExtras({', 'map-extras', 'function composeAuthoredLoggingYard'],
]) {
  const op = source.indexOf(operation), checkpoint = source.indexOf("stage: '" + stage + "'", op);
  assert.ok(op > 0 && checkpoint > op && checkpoint < source.indexOf(next, op), stage);
}
assert.match(source, /baked = yield\* bakeTankWreckSteps/, 'headless path still uses the cooperative bake');
assert.match(source, /const baked = yield\* bakeFor\(specId, pop\)/);
assert.match(source, /finally \{[\s\S]*disposeWreckBakeCache\(\);/);
console.log('propsScheduling.selftest: real wrapper cadence, cleanup, completed-work boundaries and placement-committed wreck selection pass');
