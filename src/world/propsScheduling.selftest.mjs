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
function fixture(steps, acquire = async () => {}, close = () => {}, workerClient = null) {
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
  const run = new Function('propsBuildSteps', 'ensureTankBuilder', 'Worker', 'createWreckBakeClient',
    wrapper + '\nreturn createPropsAsync;')(build, acquire,
    workerClient ? function Worker() {} : undefined, () => workerClient);
  return { run, events, runtime, args };
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
  .replace(/\n    \/\/ Yield only after a complete family transfers its meshes to the props\n    \/\/ group\. Keep temporary geometry assembly and its exact RNG order atomic\./, '')
  .replace(/\n    yield \{ fine: true, progress: false, stage: 'ground-(foundations|scars)' \};/g, '');
// Frozen pre-change body: reconstructing the synchronous control above must
// remove only scheduling, never silently share a changed formula with control.
assert.equal(createHash('sha256').update(groundOriginal).digest('hex'),
  '5f9a3ac81e2135e1204c95e3cf62bab5dd3d4a884530b245bda2072ff2f0791e');
const mathStart = source.indexOf('function clamp('), mathEnd = source.indexOf('\n// ---', mathStart);
const rubbleStart = source.indexOf('  const _rubbleOff ='), rubbleEnd = source.indexOf('\n  function addRubblePile(', rubbleStart);
assert.ok(mathEnd > mathStart && rubbleEnd > rubbleStart);
const groundHelpers = source.slice(mathStart, mathEnd) + source.slice(rubbleStart, rubbleEnd);

function groundFixture(code = groundCandidate, streetRows = true, foundry = false) {
  const group = new THREE.Group(), buckets = { stone: [] }, commands = [], randoms = [], textures = [];
  const buildingFeatures = [{ x: 38, z: 40, w: 6, d: 9, rot: 0.35 }];
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
    THREE, mergeGeometries, box, jitterUV, group, buckets, buildingFeatures,
    rng() { const value = random(); randoms.push(value); return value; },
    mulberry32: seededRandom, seed: 2002, aniso: 4, noi: { noise: (x, y) => Math.sin(x + y) * 0.5 },
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
    heightField: { getHeightAt: (x, z) => x * 0.001 + z * 0.002,
      _roadDist: () => 10, getGroundType: () => 'hard', getNormalAt: () => ({ y: 1 }) },
    noVeg: () => false, placedB: [], crushables: [{ x: 12, z: 18 }],
    stackSpots: [{ x: 8, z: 16, r: 2 }], wreckScorch: [[-20, 50]],
    foundryDonors: foundry ? [{ feature: buildingFeatures[0] }] : null,
  };
  const api = new Function(...Object.keys(dependencies), stripTypeScriptTypes(
    groundHelpers + '\nlet reconformFoundryFoundations = null;\n' + code)
    + '\nreturn { run: placeGroundBlendDecals, reconform: () => reconformFoundryFoundations?.() };')(...Object.values(dependencies));
  const geometry = geo => ({ index: geo.index ? Array.from(geo.index.array) : null,
    attributes: Object.fromEntries(Object.entries(geo.attributes).map(([name, attr]) => [name, Array.from(attr.array)])) });
  return { ...api, group, buckets, randoms, commands, buildingFeatures,
    kinds: () => group.children.map(mesh => mesh.userData.terrainDecalKind),
    snapshot: () => ({ randoms, commands, pixels: canvas.pixels, clods: buckets.stone.map(geometry),
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

for (const [streetRows, foundry] of [[true, false], [false, true]]) {
  const before = groundFixture(groundOriginal, streetRows, foundry);
  const after = groundFixture(groundCandidate, streetRows, foundry);
  try {
    before.run();
    const iterator = after.run();
    assert.deepEqual(iterator.next(), { done: false, value: { fine: true, progress: false, stage: 'ground-foundations' } });
    assert.deepEqual(after.kinds(), streetRows ? ['ground-contact', 'apron'] : ['ground-contact']);
    assert.equal(after.randoms.length, 0, 'scar RNG has not started at the first boundary');
    assert.deepEqual(iterator.next(), { done: false, value: { fine: true, progress: false, stage: 'ground-scars' } });
    assert.ok(after.kinds().includes('crater') && after.kinds().includes('scorch'));
    assert.equal(after.commands.some(command => command[0] === 'clear'), false, 'churn painter has not started');
    assert.equal(iterator.next().done, true);
    assert.ok(after.kinds().includes('churn') && after.buckets.stone.length > 0 && after.randoms.length > 0);
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
for (const cancelAt of [0, 1, null]) {
  const h = groundFixture(), iterator = h.run(), failure = new Error('cancel decal family'), ticks = [];
  const steps = (function* () { yield* iterator; yield { fine: true, stage: 'ground-decals' }; })();
  const f = fixture(steps);
  try {
    const pending = f.run({}, {}, 2002, { props: { wrecks: 0 } }, (done, total) => {
      ticks.push([done, total]);
      if (ticks.length - 1 === cancelAt) throw failure;
    }, true);
    if (cancelAt === null) {
      await pending;
      assert.deepEqual(ticks, [[0, 180], [0, 180], [1, 180]]);
      assert.ok(h.kinds().includes('churn'));
    } else {
      await assert.rejects(pending, error => error === failure);
      assert.equal(iterator.next().done, true);
      assert.equal(h.kinds().includes('crater'), cancelAt === 1);
      assert.equal(h.kinds().includes('churn'), false);
      assert.equal(h.commands.some(command => command[0] === 'clear'), false);
      assert.equal(f.runtime._buildDetail, undefined, 'cancelled props cannot publish a runtime');
      assert.equal(f.args[0][6].signal.aborted, true);
    }
    assert.equal(f.events.filter(([event]) => event === 'closed').length, 1);
  } finally { h.dispose(); }
}

// Each checkpoint follows completed work, before the next expensive owner;
// no geometry formula, RNG draw or source-acquisition order is rewritten.
for (const [operation, stage, next] of [
  ['yield* placeTankWrecks();', 'wrecks-finalized', 'function beginWaterworksRubbleCapture'],
  ['placeCentralMonument();', 'street-details', 'function* placeGroundBlendDecals'],
  ['placeFoundationDecals();', 'ground-foundations', 'placeBattleScars(corridors);'],
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
