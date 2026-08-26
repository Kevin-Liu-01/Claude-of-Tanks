import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createDeploymentForwardWarmBatches,
  createIsolatedForwardWarmBatches,
} from './deploymentWarm.ts';

const scene = new THREE.Scene();
const world = new THREE.Group();
world.name = 'world';
const terrain = new THREE.Group();
terrain.name = 'terrain';
terrain.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
const props = new THREE.Group();
props.name = 'props';
for (let i = 0; i < 9; i++) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = `prop-${i}`;
  props.add(mesh);
}
world.add(terrain, props);

const player = new THREE.Group();
player.name = 'player';
for (let i = 0; i < 7; i++) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = `player-${i}`;
  player.add(mesh);
}
const lightRoot = new THREE.Group();
lightRoot.name = 'lights';
lightRoot.add(new THREE.DirectionalLight());
scene.add(world, player, lightRoot);

const shadow = { autoUpdate: true, needsUpdate: true };
let clock = 0;
let calls = 0;
const batches = [...createDeploymentForwardWarmBatches({
  scene,
  csmLights: [{ shadow }],
  worldGroup: world,
  playerRoot: player,
  now: () => { clock += 2; return clock; },
  warmRender() {
    calls += 1;
    assert.equal(shadow.autoUpdate, false, 'private binds do not refresh CSM');
    assert.equal(lightRoot.visible, true, 'lighting remains present for program keys');
  },
})];

assert.deepEqual(
  batches.filter((batch) => batch.label.startsWith('world:props')).map((batch) => batch.objects),
  [4, 4, 1],
  'props are split into bounded four-renderable cohorts',
);
assert.deepEqual(
  batches.filter((batch) => batch.label.startsWith('player:')).map((batch) => batch.objects),
  [3, 3, 1],
  'the player hierarchy is split into bounded three-renderable cohorts',
);
assert.equal(calls, batches.length);
assert.ok(batches.every((batch) => batch.ms === 2));
assert.equal(world.visible, true);
assert.equal(player.visible, true);
assert.ok([...world.children, ...player.children].every((object) => object.visible),
  'every temporary visibility change is restored before yielding');
assert.deepEqual(shadow, { autoUpdate: true, needsUpdate: true },
  'CSM latches are restored after the generator completes');

let isolatedCalls = 0;
const isolated = [...createIsolatedForwardWarmBatches({
  scene,
  root: player,
  cohortSize: 2,
  now: () => { clock += 3; return clock; },
  warmRender() {
    isolatedCalls += 1;
    assert.equal(lightRoot.visible, true, 'isolated binds retain the production light set');
    assert.equal(world.visible, false, 'unrelated scene content is hidden');
  },
})];
assert.deepEqual(isolated.map((batch) => batch.objects), [2, 2, 2, 1]);
assert.equal(isolatedCalls, 4);
assert.equal(world.visible, true);
assert.equal(player.visible, true);

console.log('deploymentWarm.selftest: bounded scene cohorts and exact restoration passed');
