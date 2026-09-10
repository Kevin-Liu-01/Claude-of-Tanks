import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeploymentShadowWarmOwner } from './deploymentShadowWarm.ts';

function preparable(render) {
  return Object.assign(render, { *prepareProgramsSteps() { return { status: 'complete', pending: 0 }; } });
}

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2_000);
const world = new THREE.Group();
world.name = 'world';
for (let index = 0; index < 5; index += 1) {
  const cohort = new THREE.Group();
  cohort.name = `world-${index}`;
  const caster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  caster.castShadow = true;
  cohort.add(caster);
  world.add(cohort);
}
const actors = new THREE.Group();
actors.name = 'actors';
const actor = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
actor.castShadow = true;
actors.add(actor);
const lightRoot = new THREE.Group();
const lights = [new THREE.DirectionalLight(), new THREE.DirectionalLight()];
for (const light of lights) {
  light.castShadow = true;
  light.shadow.autoUpdate = true;
  light.shadow.needsUpdate = true;
  lightRoot.add(light);
}
scene.add(world, actors, lightRoot);

let clock = 0;
let forwardRenders = 0;
let shadowRenders = 0;
let disposed = false;
let updateFovCalls = 0;
let updateCalls = 0;
let preserveCalls = 0;
let primedFov = 0;
const shadowWarm = Object.assign(() => { shadowRenders += 1; }, {
  dispose() { disposed = true; },
});
const lighting = {
  csm: { lights },
  updateFov() { updateFovCalls += 1; },
  update(force, dt) {
    updateCalls += 1;
    assert.equal(force, true);
    assert.equal(dt, 1 / 60);
  },
  preservePrimedCascadesForNextFrame() {
    preserveCalls += 1;
    for (const light of lights) {
      light.shadow.autoUpdate = false;
      light.shadow.needsUpdate = false;
    }
  },
};
const owner = createDeploymentShadowWarmOwner({
  renderer: {},
  scene,
  camera,
  lighting,
  warmRender: preparable(() => {
    forwardRenders += 1;
    if (forwardRenders === 1) {
      assert.equal(scene.overrideMaterial?.name, 'DeploymentBufferUpload',
        'geometry upload uses the one shared unlit material');
    }
  }),
  getWorldGroup: () => world,
  noteFovPrimed(fov) { primedFov = fov; },
  simDt: 1 / 60,
  now: () => { clock += 2; return clock; },
  shadowOnlyWarmRender: shadowWarm,
});

const yieldFlags = [];
const receipt = await owner.prime(async (covered) => { yieldFlags.push(covered); });
assert.equal(receipt.cascades, 2);
assert.equal(receipt.casterCount, 6);
assert.equal(receipt.casterBatches, 1);
assert.equal(shadowRenders, 3, 'one caster batch plus two exact cascades render');
assert.equal(updateFovCalls, 1);
assert.equal(updateCalls, 1);
assert.equal(preserveCalls, 1);
assert.equal(primedFov, camera.fov);
assert.deepEqual(yieldFlags, [true, true, true, true, true, true]);
assert.equal(receipt.uploadProgramPreparation.variants, 1);
assert.equal(receipt.geometryUploadBatchMs.length, 1);
assert.equal(receipt.geometryUploadMs, receipt.geometryUploadBatchMs[0]);
assert.ok([world, actors, ...world.children].every((object) => object.visible));
assert.ok([actor, ...world.children.map((group) => group.children[0])]
  .every((object) => object.castShadow), 'all exact casters are restored');
assert.equal(receipt.drawAttribution.renders.length, 4);
assert.ok(receipt.drawAttribution.renders.every(sample =>
  !sample.available && sample.unavailableReason === 'missing-method'),
'injected renderers without renderBufferDirect retain an explicit unavailable receipt');

const farCamera = lights.at(-1).shadow.camera;
const savedFrustum = {
  left: farCamera.left,
  right: farCamera.right,
  top: farCamera.top,
  bottom: farCamera.bottom,
  near: farCamera.near,
  far: farCamera.far,
};
const depthSteps = [...owner.warmDepthProgramSteps()];
assert.equal(depthSteps.length, 4,
  'five world children form four bounded cohorts plus one actor root');
assert.deepEqual({
  left: farCamera.left,
  right: farCamera.right,
  top: farCamera.top,
  bottom: farCamera.bottom,
  near: farCamera.near,
  far: farCamera.far,
}, savedFrustum, 'the production far-cascade camera is restored exactly');
assert.ok(lights.every((light) => light.shadow.needsUpdate),
  'every cascade requests a fresh live map after program warming');

owner.dispose();
assert.equal(disposed, true);

for (const failureStage of [null, 'upload', 'yield']) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const light = new THREE.DirectionalLight();
  light.shadow.autoUpdate = true;
  light.shadow.needsUpdate = true;
  const meshes = Array.from({ length: 27 }, () => new THREE.Mesh(
    new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(light, ...meshes);
  const masks = meshes.map(mesh => mesh.layers.mask);
  const priorOverride = new THREE.MeshBasicMaterial();
  scene.overrideMaterial = priorOverride;
  let batches = 0, yields = 0, shadowCalls = 0, preserved = false;
  const seen = [];
  const failure = new Error(`upload ${failureStage}`);
  const owner = createDeploymentShadowWarmOwner({
    renderer: {}, scene, camera,
    lighting: { csm: { lights: [light] }, updateFov() {}, update() {},
      preservePrimedCascadesForNextFrame() { preserved = true; } },
    warmRender: preparable(() => {
      assert.equal(scene.overrideMaterial.name, 'DeploymentBufferUpload');
      const selected = meshes.filter(mesh => mesh.layers.test(camera.layers));
      assert.ok(selected.length > 0 && selected.length <= 12);
      seen.push(...selected);
      if (++batches === 1 && failureStage === 'upload') throw failure;
    }),
    shadowOnlyWarmRender() { shadowCalls++; },
    getWorldGroup: () => scene, noteFovPrimed() {}, simDt: 1 / 60,
  });
  try {
    const prime = owner.prime(async covered => {
      assert.equal(covered, true);
      assert.equal(scene.overrideMaterial, priorOverride);
      assert.deepEqual(meshes.map(mesh => mesh.layers.mask), masks);
      if (++yields === 2 && failureStage === 'yield') throw failure;
    });
    if (failureStage) {
      await assert.rejects(prime, error => error === failure);
      assert.equal(shadowCalls, 0);
      assert.equal(preserved, false);
      assert.equal(light.shadow.autoUpdate, true);
      assert.equal(light.shadow.needsUpdate, true);
    } else {
      const receipt = await prime;
      assert.equal(batches, 3, '27 visible objects cannot be uploaded in one blocking render');
      assert.deepEqual(seen, meshes, 'batching preserves every production object and ordering');
      assert.equal(receipt.geometryUploadBatchMs.length, batches);
      assert.equal(receipt.geometryUploadMs, receipt.geometryUploadBatchMs.reduce((a, b) => a + b, 0));
      assert.equal(receipt.geometryUploadBatchMaxMs, Math.max(...receipt.geometryUploadBatchMs));
      assert.equal(shadowCalls, 1);
      assert.equal(preserved, true);
    }
    assert.equal(scene.overrideMaterial, priorOverride);
    assert.deepEqual(meshes.map(mesh => mesh.layers.mask), masks);
  } finally {
    owner.dispose(); priorOverride.dispose();
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
}

function observationFixture({ inherited = false, locked = false, fail = '',
  replace = false, callsPerRender = 3, casterCount = 1 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const otherCamera = new THREE.PerspectiveCamera();
  const light = new THREE.DirectionalLight();
  light.castShadow = true;
  light.shadow.autoUpdate = true;
  light.shadow.needsUpdate = true;
  scene.add(light);
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const depth = new THREE.MeshDepthMaterial();
  depth.name = 'actual-depth';
  const object = new THREE.InstancedMesh(geometry, material, 4);
  object.count = 3;
  object.castShadow = true;
  object.customDepthMaterial = depth;
  object.name = 'actual-caster';
  scene.add(object);
  for (let index = 1; index < casterCount; index++) {
    const additional = new THREE.Mesh(geometry, material);
    additional.castShadow = true;
    scene.add(additional);
  }
  const group = { start: 3, count: 6, materialIndex: 0 };
  const failure = new Error(`original ${fail}`);
  const result = {};
  let clock = 0, renders = 0, draws = 0, yields = 0;
  let replacementInstalled = false, replacementDescriptor;
  let priorTarget = null;
  const received = [];
  function original(...args) {
    assert.equal(this, receiver, 'original direct draw retains its exact receiver');
    received.push(args);
    draws++;
    clock += [7, 5, 3][(draws - 1) % 3];
    renderer.info.programs.push({});
    if (!scene.overrideMaterial) {
      if (replace && !replacementInstalled) {
        renderer.renderBufferDirect = replacement;
        replacementInstalled = true;
        replacementDescriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect');
      }
      if (fail === 'draw') throw failure;
    }
    return result;
  }
  function replacement(...args) { return original.apply(this, args); }
  const renderer = inherited ? Object.create({ renderBufferDirect: original }) : { renderBufferDirect: original };
  if (locked) Object.defineProperty(renderer, 'renderBufferDirect', {
    value: original, writable: false, configurable: false,
  });
  Object.assign(renderer, {
    info: { programs: [{}, {}] },
    properties: { get() { assert.fail('diagnostic must not allocate renderer property bags'); } },
    getContext() { assert.fail('diagnostic must not query GL'); },
    getDrawingBufferSize(size) { return size.set(128, 128); },
    getRenderTarget() { return priorTarget; },
    setRenderTarget(target) { priorTarget = target; },
    render(actualScene, forwardCamera) {
      assert.equal(actualScene, scene);
      renders++;
      if (locked) assert.equal(renderer.renderBufferDirect, original);
      clock += 3;
      for (let index = 0; index < callsPerRender; index++) {
        const selectedCamera = scene.overrideMaterial ? forwardCamera : [light.shadow.camera, forwardCamera, otherCamera][index % 3];
        const args = [selectedCamera, index === 1 ? scene : null, geometry, scene.overrideMaterial ?? depth, object, group];
        const value = renderer.renderBufferDirect.apply(receiver, args);
        assert.equal(value, result, 'the observer preserves the original return value');
        assert.deepEqual(received.at(-1), args);
        for (let arg = 0; arg < args.length; arg++) assert.equal(received.at(-1)[arg], args[arg]);
        if (index === 0) clock += 2;
        if (index === 1) clock += 1;
      }
      if (fail === 'render' && !scene.overrideMaterial) throw failure;
      clock += 4;
    },
  });
  const receiver = Object.create(renderer);
  const descriptor = Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect');
  const warm = createDeploymentShadowWarmOwner({
    renderer, scene, camera,
    lighting: { csm: { lights: [light] }, updateFov() {}, update() {}, preservePrimedCascadesForNextFrame() {} },
    warmRender: preparable(() => { renderer.render(scene, camera); }),
    getWorldGroup: () => scene, noteFovPrimed() {}, simDt: 1 / 60, now: () => clock,
  });
  const assertRestored = () => {
    assert.equal(renderer.renderBufferDirect, replacementInstalled ? replacement : original);
    assert.deepEqual(Object.getOwnPropertyDescriptor(renderer, 'renderBufferDirect'),
      replacementInstalled ? replacementDescriptor : descriptor,
      'restore the original own/inherited property contract');
  };
  return {
    scene, object, geometry, depth, renderer, failure, assertRestored,
    get draws() { return draws; }, get renders() { return renders; },
    prime: () => warm.prime(async covered => {
      assert.equal(covered, true);
      assertRestored();
      yields++;
      if (fail === 'yield' && yields === 4) throw failure;
    }),
    dispose() { warm.dispose(); geometry.dispose(); material.dispose(); depth.dispose(); },
  };
}

for (const inherited of [false, true]) {
  const f = observationFixture({ inherited });
  try {
    const receipt = await f.prime();
    f.assertRestored();
    assert.equal(f.renders, 3, 'one unchanged upload, caster batch and cascade');
    const samples = receipt.drawAttribution.renders;
    assert.deepEqual(samples.map(sample => [sample.phase, sample.index]),
      [['geometry-upload', 0], ['caster-batch', 0], ['cascade', 0]]);
    assert.ok(samples.every(sample => sample.available));
    assert.ok(samples[0].draws.every(draw => draw.camera === 'forward'
      && draw.materialName === 'DeploymentBufferUpload'), 'upload draws use the actual main camera and override material');
    const sample = samples[1];
    assert.equal(sample.totalMs, 25);
    assert.equal(sample.beforeFirstDrawMs, 3);
    assert.equal(sample.directDrawMs, 15);
    assert.equal(sample.residualMs, 7);
    assert.deepEqual([sample.programsBefore, sample.programsAfter], [5, 8]);
    assert.deepEqual(sample.draws.map(draw => draw.camera), ['shadow', 'forward', 'other'],
      'off-frustum forward/other draws remain visible, never mislabeled as shadow casters');
    assert.deepEqual(sample.draws.map(draw => draw.elapsedMs), [7, 5, 3]);
    assert.deepEqual(sample.draws.map(draw => [draw.programsBefore, draw.programsAfter]), [[5, 6], [6, 7], [7, 8]]);
    const draw = sample.draws[0];
    assert.deepEqual([draw.objectId, draw.objectName, draw.objectType], [f.object.id, 'actual-caster', 'Mesh']);
    assert.deepEqual([draw.materialUuid, draw.materialName, draw.materialType, draw.customDepthMaterial],
      [f.depth.uuid, 'actual-depth', 'MeshDepthMaterial', true]);
    assert.deepEqual([draw.geometryId, draw.vertices, draw.indices, draw.instances, draw.groupStart, draw.groupCount],
      [f.geometry.id, 24, 36, 3, 3, 6]);
  } finally { f.dispose(); }
}

for (const fail of ['draw', 'render', 'yield']) {
  const f = observationFixture({ fail });
  try {
    await assert.rejects(f.prime(), error => error === f.failure, 'preserve the exact original failure');
    f.assertRestored();
    assert.equal(f.renders, 2, 'failure/cancellation cannot enter the following warm render');
    assert.equal(f.object.castShadow, true);
    assert.equal(f.scene.children[0].shadow.autoUpdate, true);
    assert.equal(f.scene.children[0].shadow.needsUpdate, true);
  } finally { f.dispose(); }
}

{
  const f = observationFixture({ locked: true });
  try {
    const receipt = await f.prime();
    f.assertRestored();
    assert.equal(f.draws, 9);
    assert.ok(receipt.drawAttribution.renders.every(sample =>
      !sample.available && sample.unavailableReason === 'unwrappable-method'));
  } finally { f.dispose(); }
}

{
  const f = observationFixture({ callsPerRender: 140 });
  try {
    const receipt = await f.prime();
    const attribution = receipt.drawAttribution;
    assert.equal(f.draws, 420, 'sample caps cannot drop actual submissions');
    assert.equal(attribution.renders.reduce((sum, sample) => sum + sample.draws.length, 0), 256);
    assert.equal(attribution.drawsDropped, 164);
    assert.equal(attribution.renders.reduce((sum, sample) => sum + sample.drawCount, 0), 420);
    f.assertRestored();
  } finally { f.dispose(); }
}

{
  const f = observationFixture({ casterCount: 769, callsPerRender: 0 });
  try {
    const receipt = await f.prime();
    const attribution = receipt.drawAttribution;
    assert.equal(f.renders, receipt.casterBatches + receipt.geometryUploadBatchMs.length + 1);
    assert.equal(attribution.renders.length, 57);
    assert.deepEqual(['geometry-upload', 'caster-batch', 'cascade'].map(phase =>
      attribution.renders.filter(sample => sample.phase === phase).length), [32, 24, 1],
    'large geometry uploads cannot consume the later shadow observation budget');
    assert.equal(attribution.rendersDropped, f.renders - attribution.renders.length);
    assert.ok(attribution.renders.every(sample => sample.beforeFirstDrawMs === null && sample.directDrawMs === 0));
    f.assertRestored();
  } finally { f.dispose(); }
}

for (const fail of ['', 'draw']) {
  const f = observationFixture({ replace: true, fail });
  try {
    if (fail) await assert.rejects(f.prime(), error => error === f.failure);
    else {
      const receipt = await f.prime();
      const interrupted = receipt.drawAttribution.renders[1];
      assert.equal(interrupted.available, false);
      assert.equal(interrupted.unavailableReason, 'ownership-lost');
      assert.equal(interrupted.drawCount, 1, 'partial observation is never reported as complete');
    }
    f.assertRestored(); // A hook's replacement, never our saved original, remains installed.
  } finally { f.dispose(); }
}

console.log('deploymentShadowWarm.selftest: exact cascades, bounded casters, and restoration passed');
