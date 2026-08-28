import assert from 'node:assert/strict';
import {
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
} from 'three';
import {
  invalidateBattleWarmRuntime,
  stageCombatFxProgramSubmission,
  warmBattleTerrainTiles,
  warmNetworkOpeningEffects,
  warmNetworkWrecks,
  warmStudioEffects,
} from './battleWarmRuntime.ts';

let warmedTerrainPoints = null;
let terrainYieldCount = 0;
let presentationPrimeCount = 0;
await warmBattleTerrainTiles({
  game: {
    tanks: [
      {
        isPlayer: true,
        state: { pos: { x: 10, y: 2, z: 20 }, yaw: Math.PI / 2 },
      },
      {
        isPlayer: false,
        state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
        _openingRoute: [[25, 0], [50, 0], [75, 0], [100, 0], [125, 0]],
      },
    ],
    player: {
      state: { pos: { x: 10, y: 2, z: 20 }, yaw: Math.PI / 2 },
    },
  },
  world: {
    heightField: {
      * warmFastTilesAround(points) {
        warmedTerrainPoints = points;
        yield 'terrain-batch';
      },
    },
    update() { presentationPrimeCount += 1; },
  },
  yieldForBudget: async () => { terrainYieldCount += 1; },
});
assert.deepEqual(
  warmedTerrainPoints.slice(0, 4).map(({ x, z, radiusM }) => [Math.round(x), Math.round(z), radiusM]),
  [[10, 20, 64], [90, 20, 10], [122, 20, 10], [154, 20, 10]],
  'opening warm includes the player steering disc and narrow spawn-heading corridor',
);
assert.ok(warmedTerrainPoints.some(({ x, radiusM }) => x >= 100 && radiusM === 10),
  'bot terrain warming reaches the first 120 m of its opening route');
assert.equal(terrainYieldCount, 2, 'tile work and the presentation prime both yield cooperatively');
assert.equal(presentationPrimeCount, 1, 'the exact opening presentation is primed behind the veil');

function createFxProbe() {
  const group = new Group();
  group.visible = false;
  group.userData.softParticles = { layer: 27 };
  const textured = new Object3D();
  textured.material = { map: new Texture() };
  group.add(textured);
  const calls = [];
  return {
    calls,
    group,
    warmTexturesChunked: async (yieldForBudget) => {
      calls.push('textures');
      await yieldForBudget();
    },
    warmOpeningEffects: () => calls.push('opening'),
    impact: (kind) => calls.push(`impact:${kind}`),
    dust: () => calls.push('dust'),
    exhaust: () => calls.push('exhaust'),
    destruction: (_position, _source, kind) => calls.push(`destruction:${kind}`),
    armorScar: () => calls.push('armor-scar'),
    clearVehicleDecals: () => calls.push('clear-scars'),
    propBreak: (kind) => calls.push(`prop:${kind}`),
    propCrush: () => calls.push('crush'),
    update: (_dt, shells) => calls.push(`update:${shells.length}`),
    resetAll: () => calls.push('reset'),
  };
}

invalidateBattleWarmRuntime();
const studioFx = createFxProbe();
const studioCamera = new PerspectiveCamera();
const studioMask = studioCamera.layers.mask;
let prepared = 0;
let initializedPrograms = 0;
let initializedTextures = 0;
let clock = 0;
const progress = [];
const traces = [];
const studioOptions = {
  fx: studioFx,
  post: { prepareSoftParticles: () => { prepared += 1; } },
  renderer: { initTexture: () => { initializedTextures += 1; } },
  camera: studioCamera,
  * initializeForwardPrograms() {
    initializedPrograms += 1;
    yield;
  },
  isCombatPipelineWarmed: () => false,
  onProgress: (fraction, label) => progress.push([fraction, label]),
  onTrace: (trace) => traces.push(trace),
  now: () => clock += 10,
};

await Promise.all([
  warmStudioEffects(studioOptions),
  warmStudioEffects(studioOptions),
]);
assert.equal(studioFx.calls.filter((call) => call === 'textures').length, 1,
  'concurrent Studio callers share one exact warm');
assert.equal(initializedPrograms, 1);
assert.equal(initializedTextures, 1);
assert.equal(prepared, 1);
assert.equal(studioCamera.layers.mask, studioMask, 'Studio warm restores camera layers');
assert.equal(traces.length, 1);
assert.ok(progress.some(([fraction]) => fraction === 1));

await warmStudioEffects(studioOptions);
assert.equal(initializedPrograms, 1, 'a valid renderer receipt remains memoized');
invalidateBattleWarmRuntime();
await warmStudioEffects(studioOptions);
assert.equal(initializedPrograms, 2,
  'context invalidation forces Studio programs and textures through the owner again');

const combatFx = createFxProbe();
const combatCamera = new PerspectiveCamera();
combatCamera.layers.mask = 5;
const combatMask = combatCamera.layers.mask;
const game = {
  tanks: [],
  player: {
    state: { pos: { x: 12, y: 3, z: -8 } },
    spec: { gun: { shells: [{ caliberMm: 125 }] } },
    combat: { shellSlot: 0 },
  },
};
let shellOrigin = null;
const submission = stageCombatFxProgramSubmission({
  game,
  fx: combatFx,
  post: { prepareSoftParticles: () => combatFx.calls.push('soft') },
  camera: combatCamera,
  createShell: (_spec, _shooter, _isPlayer, position) => {
    shellOrigin = position.clone();
    return { pos: new Vector3(), prevPos: new Vector3() };
  },
});
assert.equal(submission.staged, true);
assert.deepEqual(shellOrigin?.toArray(), [12, 4.4, -4],
  'deployment FX stages around the exact player field');
assert.equal(combatFx.group.visible, true);
assert.ok(combatFx.calls.includes('update:1'), 'the live tracer ribbon is allocated');
assert.ok(combatFx.calls.includes('prop:drumblast'), 'rare prop pools are included');
submission.restore();
assert.equal(combatFx.group.visible, false, 'FX root visibility is restored exactly');
assert.equal(combatCamera.layers.mask, combatMask, 'combat staging restores camera layers');
assert.equal(combatFx.calls.at(-1), 'reset');

invalidateBattleWarmRuntime();
const networkFx = createFxProbe();
const decalRoot = new Group();
decalRoot.visible = false;
let networkCompiles = 0;
await warmNetworkOpeningEffects({
  fx: networkFx,
  post: { prepareSoftParticles: () => networkFx.calls.push('soft') },
  camera: new PerspectiveCamera(),
  shells: [],
  decalVisual: { root: decalRoot },
  compilePrograms: () => { networkCompiles += 1; },
  warmRender: () => networkFx.calls.push('render'),
});
assert.ok(networkFx.calls.includes('armor-scar'),
  'network loading primes the pooled vehicle-owned impact decal');
assert.ok(networkFx.calls.includes('clear-scars'),
  'the warm scar is removed before battle reveal');
assert.equal(decalRoot.visible, false, 'decal warm restores vehicle visibility');
assert.equal(networkCompiles, 2, 'FX and vehicle-owned decal programs compile under cover');

const scene = new Scene();
const bridgeRoot = new Group();
const siblingBefore = new Object3D();
const wreckRoot = new Group();
const siblingAfter = new Object3D();
const intactMaterial = new MeshBasicMaterial({ name: 'intact' });
const fallbackMaterial = new MeshBasicMaterial({ name: 'cot:burnt', map: new Texture() });
const wreckMesh = new Mesh(new BoxGeometry(), intactMaterial);
wreckMesh.castShadow = true;
wreckMesh.frustumCulled = true;
wreckRoot.visible = false;
wreckRoot.add(wreckMesh);
bridgeRoot.add(siblingBefore, wreckRoot, siblingAfter);
let restoredDetails = 0;
let realWarmFrames = 0;
let compiledRoots = 0;
let wreckTexturesInitialized = 0;
const unrelatedSceneRoot = new Group();
const shadowLight = new DirectionalLight();
shadowLight.castShadow = true;
shadowLight.shadow.autoUpdate = false;
shadowLight.shadow.needsUpdate = false;
scene.add(unrelatedSceneRoot, shadowLight);
await warmNetworkWrecks({
  entities: [{
    specId: 'test-tank',
    camo: 'factory',
    visual: {
      root: wreckRoot,
      prewarmBurn() { return [wreckMesh]; },
      getWreckFallbackMaterial: () => fallbackMaterial,
      stageBattleDetailsForWarm() {
        return () => { restoredDetails += 1; };
      },
    },
  }],
  prebakeBurntSteps: function* () { yield; },
  anisotropy: 4,
  renderer: {
    info: { programs: [] },
    compile() { compiledRoots += 1; },
    initTexture() { wreckTexturesInitialized += 1; },
  },
  compilePrograms() { compiledRoots += 1; },
  scene,
  camera: new PerspectiveCamera(),
  warmRender() {
    realWarmFrames += 1;
    const probe = scene.getObjectByName('WreckFallbackWarmProbe:0');
    assert.ok(probe, 'one isolated fallback probe is mounted for the real draw');
    assert.equal(probe.frustumCulled, false);
    assert.equal(probe.material, fallbackMaterial);
    assert.equal(probe.castShadow, true);
    assert.equal(unrelatedSceneRoot.visible, false,
      'the fallback draw does not resubmit the complete battlefield');
    assert.equal(shadowLight.shadow.needsUpdate, true,
      'one production shadow light submits the generic wreck depth variant');
  },
});
assert.equal(realWarmFrames, 1);
assert.equal(wreckRoot.parent, bridgeRoot, 'bridge ownership is restored after warming');
assert.deepEqual(bridgeRoot.children, [siblingBefore, wreckRoot, siblingAfter],
  'temporary scene staging preserves exact sibling order');
assert.equal(wreckRoot.visible, false);
assert.equal(wreckMesh.frustumCulled, true);
assert.equal(wreckMesh.material, intactMaterial);
assert.equal(unrelatedSceneRoot.visible, true);
assert.equal(shadowLight.shadow.autoUpdate, false);
assert.equal(shadowLight.shadow.needsUpdate, false,
  'the production shadow scheduler state is restored exactly');
assert.equal(restoredDetails, 1, 'compile staging restores detail state once');
assert.equal(compiledRoots, 2, 'fielded burn hooks and the isolated fallback both compile');
assert.equal(wreckTexturesInitialized, 1, 'destroyed-only maps upload before first blood');

console.log('battleWarmRuntime.selftest: Studio invalidation and covered FX staging passed');
