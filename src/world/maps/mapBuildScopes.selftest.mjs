// mapBuildScopes.selftest.mjs — (2026-11-02 audit R1) the map build's ambient slots and the latches that crossed builds.
// 1. The kits' ten module-level build slots are declared in one registry (buildScopes.ts); none is open outside a build,
//    an open one is named at a pacing yield, and the real props pacer (props.ts createPropsAsync) asserts at every slice.
// 2. Every light kind's build leaves the structure kit's part tag as it found it, a throw mid-tag included.
// 3. The facade craft's switch is scoped: a receipt's build that throws cannot leave it off for the process.
// 4. A market stall's wreck is its own build's stall: another world's stall built between the pool's intact and broken
//    builds (the pool yields there) no longer becomes this world's wreck.
// 5. A set piece skipped after its collision went in (a throw in its description) takes its records back out.
// 6. An aircraft wreck build that throws after its hull lofts leaves no hull for the next wreck's metal bucket.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';

installWorldBuildFixture();
const { assertNoBuildScopeOpen, buildScopeNames, openBuildScopes, registerBuildScope } = await import('./buildScopes.ts');
await import('./regional/index.ts');
const { withWear } = await import('./regional/house.ts');
const { DESTRUCTIBLE_BUILDING_TYPES } = await import('./structureKit.ts');
const { DESTRUCTIBLE_TYPES } = await import('./inhabitKit.ts');
const { facadeOn, withFacade, withFacadeCraft } = await import('./regional/facade.ts');
const { composeLandmarks } = await import('../landmarks/compose.ts');
const { aircraftWreck } = await import('../landmarks/wrecks.ts');
const { PartSink } = await import('./regional/geometry.ts');

function stream(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- 1. one registry, nothing open outside a build, an open slot named at a yield, the props pacer asserts
const SLOTS = ['house.wear', 'house.plans', 'house.member', 'facade', 'shell.ruinWalls', 'lattice', 'openings.sillShadow',
  'hessian.palette', 'structureKit.craftCapture', 'structureKit.partTag'];
assert.deepEqual(SLOTS.filter((name) => !buildScopeNames().includes(name)), [], 'every kit slot is declared in the registry');
assert.deepEqual(openBuildScopes(), [], 'no slot is open outside a build');
assert.doesNotThrow(() => assertNoBuildScopeOpen('outside'));
withWear({ amount: 0.2, rng: stream(1) }, () => {
  assert.throws(() => assertNoBuildScopeOpen('a yield inside the wear scope'), /house\.wear build scope is open/);
  assert.doesNotThrow(() => assertNoBuildScopeOpen('a nested build', ['house.wear']), 'a caller\'s own outer scope stays allowed');
});
assert.deepEqual(openBuildScopes(), [], 'and closed again after it');
{
  const propsSource = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
  const start = propsSource.indexOf('export async function createPropsAsync(');
  const end = propsSource.indexOf('\nfunction* propsBuildSteps(', start);
  const wrapper = stripTypeScriptTypes(propsSource.slice(start, end)).replace('export ', '');
  let open = false;
  registerBuildScope('selftest.slot', () => open);
  const createPropsAsync = new Function('propsBuildSteps', 'Worker', 'createWreckBakeClient', 'assertNoBuildScopeOpen',
    wrapper + '\nreturn createPropsAsync;')(function* () {
    yield { fine: true, stage: 'first' };
    open = true; // a builder that opened its slot and then yielded
    yield { fine: true, stage: 'inside' };
    open = false;
    return {};
  }, undefined, () => null, assertNoBuildScopeOpen);
  await assert.rejects(createPropsAsync({}, {}, 2002, null, () => {}, true), /selftest\.slot build scope is open at a pacing yield/,
    'the real props pacer refuses a slice with a slot open');
  open = false;
}

// ---- 2. the part tag: a light kind that throws mid-tag leaves no tag behind, orbital builds included
for (const [id, type] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) {
  for (const throwAt of [3, 40, 400]) {
    let draws = 0;
    const poisoned = () => { if (++draws === throwAt) throw new Error('poisoned stream'); return 0.37; };
    try { type.build(poisoned)?.dispose?.(); } catch { /* the poisoned build */ }
    assert.deepEqual(openBuildScopes(), [], `${id}: a build that threw at draw ${throwAt} leaves every slot closed`);
  }
}

// ---- 3. the facade craft's switch is scoped
withFacade({ tier: 'desktop', rng: stream(2) }, () => {
  assert.equal(facadeOn(), true);
  assert.throws(() => withFacadeCraft(false, () => { assert.equal(facadeOn(), false); throw new Error('a receipt build failed'); }));
  assert.equal(facadeOn(), true, 'a receipt that throws inside the plain build leaves the craft on');
});

// ---- 4. the stall's wreck is its own build's stall
{
  const positions = (geometry) => Array.from(geometry.getAttribute('position').array);
  const stall = DESTRUCTIBLE_TYPES.stall;
  const alone = stream(11);
  stall.build(alone).dispose();
  const expected = positions(stall.broken(alone));
  const mine = stream(11), other = stream(29);
  stall.build(mine).dispose();
  stall.build(other).dispose(); // another world's build between this pool's intact and broken builds
  assert.deepEqual(positions(stall.broken(mine)), expected, 'the wreck is tipped from this build\'s own stall');
  stall.broken(other).dispose();
}

// ---- 5. a set piece skipped after its collision went in takes its records back out
{
  const flat = { getHeightAt: () => 0, getWaterMaskAt: () => 0, _roadDist: (x, z) => Math.abs(z - 200) };
  const obstacles = [], colliders = [];
  let index = 0;
  const ctx = {
    mapId: 'selftest', heightField: flat, spawns: [{ x: -400, z: -400 }, { x: 400, z: 400 }], obstacles, colliders,
    architecture: null, snowCap: false, seed: 2002, tier: 'desktop', merge() {}, reserve() {}, publish() {}, addDestructible() {},
    structureIndex: () => index++,
    describeStructure: () => { throw new Error('the description failed'); },
    landmarks: [{ kind: 'granary', x: 0, z: 120, yawDeg: 0, ground: 'veto', name: 'the store' }],
  };
  const steps = composeLandmarks(ctx);
  let step = steps.next();
  while (!step.done) step = steps.next();
  const entry = step.value.pieces.find((piece) => piece.name === 'the store');
  assert.equal(entry?.status, 'skipped', 'the piece whose description threw is skipped');
  assert.equal(obstacles.length + colliders.length, 0, 'and leaves no collision record standing');
}

// ---- 6. an aircraft wreck that throws after its hulls are lofted leaves none behind
{
  const context = () => ({
    kind: 'aircraftWreck', params: { width: 110, depth: 100, strip: 0 }, rng: stream(9), variant: stream(5), age: stream(6),
    tier: 'desktop', groundFall: 0, ground: () => 0, water: () => 0, mapId: 'selftest',
  });
  const metalCount = () => aircraftWreck(context()).parts.structureMetal.length;
  const clean = metalCount();
  // the sink's own finish throws once: after every loft, before finishWreck hands the hulls over
  const finish = PartSink.prototype.finish;
  PartSink.prototype.finish = function () { PartSink.prototype.finish = finish; throw new Error('the part sink failed'); };
  try { assert.throws(() => aircraftWreck(context()), /the part sink failed/); } finally { PartSink.prototype.finish = finish; }
  assert.equal(metalCount(), clean, 'the next wreck\'s metal bucket holds its own hulls only');
}

console.log('mapBuildScopes.selftest: ten kit slots in one registry (none open outside a build, named at a yield, the props pacer asserts each slice), the part tag closed after a thrown build, a scoped facade craft switch, the stall wreck from its own build, a skipped set piece without records, an aircraft wreck without leaked hulls PASS');
