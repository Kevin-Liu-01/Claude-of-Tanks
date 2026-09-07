import assert from 'node:assert/strict';
import {
  BoxGeometry,
  DirectionalLight,
  Frustum,
  Group,
  Mesh,
  MeshBasicMaterial,
  Matrix4,
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
import { createFx } from '../fx/effects.ts';
import { registerWorldDestructibles } from '../world/destructibles.ts';

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
    composeFiringMoment: () => calls.push('firing-moment'),
    warmProjectilePresentation: () => calls.push('projectile-presentation'),
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

// Exercise the real FX graph and its actual muzzle angle gate, frustum and
// tracer instance count. Canvas painting is immaterial to this Node contract;
// native GPU upload/compile coverage is verified by the covered browser draw.
function createCanvasProbe() {
  const canvas = { width: 0, height: 0 };
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  const context = new Proxy({
    canvas,
    createRadialGradient: gradient,
    createLinearGradient: gradient,
    getImageData: (_x, _y, width, height) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  }, { get: (target, key) => target[key] ?? noop });
  return Object.assign(canvas, { getContext: () => context });
}

const priorDocument = globalThis.document;
const priorWindow = globalThis.window;
try {
  globalThis.document = { createElement: createCanvasProbe };
  globalThis.window = {};
  const camera = new PerspectiveCamera(55, 1.6, 0.5, 2000);
  camera.position.set(125, 32, -205);
  camera.lookAt(150, 32, -190);
  camera.updateMatrixWorld(true);
  const initialMask = camera.layers.mask;
  const fxScene = new Scene();
  const scarRoot = new Group();
  scarRoot.position.set(12, 3, -24);
  scarRoot.rotation.set(0.1, 0.6, -0.05);
  scarRoot.scale.set(1.1, 0.9, 1.2);
  scarRoot.add(new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial()));
  scarRoot.visible = false;
  fxScene.add(scarRoot);
  const scarVisual = { root: scarRoot };
  const scarTransform = [scarRoot.position.toArray(), scarRoot.quaternion.toArray(), scarRoot.scale.toArray()];
  const fx = createFx({ camera, scene: fxScene }, { getHeightAt: () => 0 });
  fx.warmTextures = () => {};
  fx.group.visible = false;
  fxScene.add(fx.group);
  let gameplaySweeps = 0;
  let gameplayImpacts = 0;
  registerWorldDestructibles({
    key: 'covered-network-fx-warm-regression',
    isActive: () => true,
    sweep: () => { gameplaySweeps += 1; },
    impact: () => { gameplayImpacts += 1; },
  });
  const liveShell = {
    id: 'not-a-warm-shell', pos: new Vector3(5, 1, 5),
    prevPos: new Vector3(0, 1, 0), vel: new Vector3(0, 0, 100),
    spec: { tracer: 'APFSDS' },
  };
  const shells = Object.freeze([liveShell]);
  const liveShellBefore = JSON.stringify(liveShell);
  let nativeSubmissionCalls = 0;
  let submissionValidated = false;
  let stagedTracer = null;
  let compiledScarMesh = null;
  let submittedScarMesh = null;
  const guidedPools = fx.group.children.filter((mesh) => mesh.isInstancedMesh
    && (mesh.renderOrder === 25 || mesh.renderOrder === 26));
  assert.equal(guidedPools.length, 2, 'the real missile body and flare pools are present');
  const options = {
    fx,
    post: { prepareSoftParticles() {} },
    camera,
    shells,
    decalVisual: scarVisual,
    compilePrograms(root) {
      if (root === scarRoot) compiledScarMesh = root.getObjectByName('fx_impactDecals');
    },
    warmRender() {
      nativeSubmissionCalls += 1;
      assert.equal(fx.group.visible, true, 'the actual FX root is drawable during warm');
      assert.equal(fx.group.userData.softParticles.isActive(), true,
        'the real late-composite activity gate is open during submission');
      const drawnScars = [];
      fxScene.traverseVisible((object) => {
        if (object.name === 'fx_impactDecals') drawnScars.push(object);
      });
      assert.equal(drawnScars.length, 1,
        'the actual scene draw sees the compiled scar still attached under a visible vehicle');
      assert.equal(drawnScars[0] === compiledScarMesh, true,
        'the drawn scar is the same mesh prepared by the scoped compile');
      submittedScarMesh = drawnScars[0];
      assert.equal(submittedScarMesh.frustumCulled, false);
      fx.group.updateMatrixWorld(true);
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      const rings = fx.group.children.filter((mesh) =>
        mesh.geometry?.type === 'PlaneGeometry' && mesh.renderOrder === 23);
      assert.ok(rings.some((mesh) => mesh.visible && frustum.intersectsObject(mesh)),
        'a real muzzle ring passes BOTH the angle gate and production camera frustum');
      stagedTracer = fx.group.children.find((mesh) => mesh.geometry?.getAttribute('aA'));
      assert.ok(stagedTracer.geometry.instanceCount > 0,
        'the real tracer issues a nonzero instanced draw, not compile-only zero instances');
      for (const mesh of guidedPools) {
        assert.equal(mesh.count, 1, 'guided body AND flare issue a nonzero native draw');
        assert.equal(mesh.visible, true);
        assert.equal(mesh.frustumCulled, false);
        const matrix = new Matrix4();
        mesh.getMatrixAt(0, matrix);
        const position = new Vector3().setFromMatrixPosition(matrix);
        assert.ok(frustum.containsPoint(position), 'guided warm instance lies in the current view');
      }
      assert.equal(fx.getGuidedMissileDebug().trailSegments, 0,
        'guided pool staging creates no synthetic persistent trail');
      submissionValidated = true;
    },
  };
  invalidateBattleWarmRuntime();
  await warmNetworkOpeningEffects(options);
  assert.equal(nativeSubmissionCalls, 1);
  assert.equal(submissionValidated, true, 'real staged resources satisfy submission assertions');
  assert.equal(fx.group.visible, false);
  assert.equal(camera.layers.mask, initialMask);
  assert.equal(fx.group.userData.softParticles.isActive(), false);
  assert.equal(stagedTracer.geometry.instanceCount, 0, 'no warm tracer leaks into live battle');
  assert.ok(guidedPools.every((mesh) => mesh.count === 0), 'no warm missile survives reset');
  assert.equal(scarRoot.visible, false);
  assert.equal(scarRoot.getObjectByName('fx_impactDecals'), undefined);
  assert.deepEqual([scarRoot.position.toArray(), scarRoot.quaternion.toArray(), scarRoot.scale.toArray()],
    scarTransform, 'scar staging preserves the exact authored vehicle transform');
  assert.equal(fx.impactDecalStats().pooled, 1, 'one submitted scar returns to the shared pool');
  fx.armorScar(scarVisual, new Vector3(12, 4, -24), new Vector3(0, 1, 0), 120);
  assert.equal(scarRoot.getObjectByName('fx_impactDecals'), submittedScarMesh,
    'the first real impact reuses the exact submitted mesh, geometry and shared atlas');
  fx.clearVehicleDecals(scarVisual);
  submissionValidated = false;
  await warmNetworkOpeningEffects(options);
  assert.equal(nativeSubmissionCalls, 2,
    'returning from Garage restores resources again after phase GPU release');
  assert.equal(submissionValidated, true);
  assert.equal(gameplaySweeps, 0, 'warm never sweeps supplied live shells through world props');
  assert.equal(gameplayImpacts, 0, 'presentation-only staging never submits a gameplay impact');
  assert.equal(JSON.stringify(liveShell), liveShellBefore, 'live shell state remains untouched');

  const priorWarn = console.warn;
  try {
    console.warn = () => {};
    const realArmorScar = fx.armorScar;
    for (const initialVisibility of [false, true]) {
      scarRoot.visible = initialVisibility;
      for (const failureAt of ['stamp', 'compile', 'draw']) {
        let injected = false;
        fx.armorScar = (...args) => {
          realArmorScar(...args);
          if (failureAt === 'stamp') { injected = true; throw new Error('stamp failed after attachment'); }
        };
        await warmNetworkOpeningEffects({
          ...options,
          compilePrograms(root) {
            options.compilePrograms(root);
            if (failureAt === 'compile') { injected = true; throw new Error('compile failed'); }
          },
          warmRender() { injected = true; throw new Error('driver submission failed'); },
        });
        assert.equal(injected, true, `${failureAt} failure fixture reached its intended boundary`);
        assert.equal(scarRoot.visible, initialVisibility, `${failureAt} failure restores exact visibility`);
        assert.equal(scarRoot.parent === fxScene, true, `${failureAt} failure preserves scene ownership`);
        assert.equal(scarRoot.getObjectByName('fx_impactDecals'), undefined,
          `${failureAt} failure detaches the temporary scar`);
        assert.deepEqual([scarRoot.position.toArray(), scarRoot.quaternion.toArray(), scarRoot.scale.toArray()],
          scarTransform, `${failureAt} failure preserves the exact vehicle transform`);
        assert.equal(fx.impactDecalStats().pooled, 1, `${failureAt} failure retains one reusable mesh`);
        assert.equal(camera.layers.mask, initialMask);
        assert.equal(fx.group.visible, false);
        assert.equal(fx.group.userData.softParticles.isActive(), false);
      }
    }
    scarRoot.visible = false;
    fx.armorScar = realArmorScar;
  } finally {
    console.warn = priorWarn;
  }
  assert.equal(fx.group.visible, false, 'failed submission restores exact FX visibility');
  assert.equal(camera.layers.mask, initialMask, 'failed submission restores camera layers');
  assert.equal(fx.group.userData.softParticles.isActive(), false, 'failed warm clears staged FX');
  assert.ok(guidedPools.every((mesh) => mesh.count === 0), 'failed warm clears guided pools too');
  await warmNetworkOpeningEffects(options);
  assert.equal(nativeSubmissionCalls, 3, 'failed warm remains retryable on the next entry');

  const realClearDecals = fx.clearVehicleDecals;
  const realResetFx = fx.resetAll;
  let failedCleanupResets = 0;
  scarRoot.visible = true;
  try {
    fx.clearVehicleDecals = () => { throw new Error('decal cleanup failed'); };
    fx.resetAll = () => { failedCleanupResets += 1; realResetFx(); };
    await assert.rejects(warmNetworkOpeningEffects(options), /decal cleanup failed/);
    assert.equal(failedCleanupResets, 1, 'a throwing scar cleanup cannot skip final FX reset');
    assert.equal(scarRoot.visible, true, 'throwing cleanup restores an originally visible root');
    assert.equal(scarRoot.getObjectByName('fx_impactDecals'), undefined, 'FX reset removes the scar anyway');
    assert.equal(camera.layers.mask, initialMask);
    assert.equal(fx.group.visible, false);
  } finally {
    fx.clearVehicleDecals = realClearDecals;
    fx.resetAll = realResetFx;
    scarRoot.visible = false;
  }

  // The same matrix writer must still position a real moving missile, retain
  // real trails, honor the existing capacity and clear it all on round reset.
  const missile = {
    id: 'real-guided-regression', pos: new Vector3(20, 4, 8),
    prevPos: new Vector3(20, 4, 7), vel: new Vector3(30, 40, 50),
    spec: { guided: true, tracer: 'ATGM' },
  };
  const missileDirection = missile.vel.clone().normalize();
  for (let frame = 0; frame < 2; frame += 1) {
    fx.update(0.016, [missile], camera);
    for (let index = 0; index < guidedPools.length; index += 1) {
      const mesh = guidedPools[index];
      assert.equal(mesh.count, 1, 'live guided projection keeps one body/flare');
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      const actualPosition = new Vector3().setFromMatrixPosition(matrix);
      const expectedPosition = missile.pos.clone().addScaledVector(missileDirection,
        index === 0 ? -0.65 : -1.35);
      assert.ok(actualPosition.distanceTo(expectedPosition) < 2e-6,
        'live body and flare retain the exact authored direction offsets');
    }
    assert.ok(fx.getGuidedMissileDebug().trailSegments > 0, 'real missiles still retain trails');
    missile.prevPos.copy(missile.pos);
    missile.pos.addScaledVector(missileDirection, 2);
  }
  const capacity = guidedPools[0].instanceMatrix.count;
  const missiles = Array.from({ length: capacity + 2 }, (_, index) => ({
    ...missile, id: `capacity-${index}`, prevPos: missile.pos,
  }));
  fx.update(0.016, missiles, camera);
  assert.ok(guidedPools.every((mesh) => mesh.count === capacity), 'live guided pool cap is unchanged');
  fx.resetAll();
  assert.ok(guidedPools.every((mesh) => mesh.count === 0));
  assert.deepEqual(fx.getGuidedMissileDebug(), { bodies: 0, trailSegments: 0 });
} finally {
  if (priorDocument === undefined) delete globalThis.document;
  else globalThis.document = priorDocument;
  if (priorWindow === undefined) delete globalThis.window;
  else globalThis.window = priorWindow;
}

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
