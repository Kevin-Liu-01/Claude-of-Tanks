import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDeploymentShadowWarmOwner } from './deploymentShadowWarm.ts';

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
  warmRender() {
    forwardRenders += 1;
    if (forwardRenders === 1) {
      assert.equal(scene.overrideMaterial?.name, 'DeploymentBufferUpload',
        'geometry upload uses the one shared unlit material');
    }
  },
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
assert.deepEqual(yieldFlags, [true, true, true, true]);
assert.ok([world, actors, ...world.children].every((object) => object.visible));
assert.ok([actor, ...world.children.map((group) => group.children[0])]
  .every((object) => object.castShadow), 'all exact casters are restored');

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

console.log('deploymentShadowWarm.selftest: exact cascades, bounded casters, and restoration passed');
