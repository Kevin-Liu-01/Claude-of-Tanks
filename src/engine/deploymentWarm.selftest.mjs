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

function nestedFixture(onlyTerrain = false) {
  const scene = new THREE.Scene(), world = new THREE.Group(), camera = new THREE.Camera();
  world.name = 'world';
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const mesh = name => { const object = new THREE.Mesh(geometry, material); object.name = name; return object; };
  const terrain = new THREE.Group(); terrain.name = 'terrain'; terrain.layers.set(7);
  const parent = mesh('terrain-parent');
  for (let i = 0; i < 4; i++) parent.add(mesh(`terrain-child-${i}`));
  terrain.add(parent);
  for (let i = 0; i < 4; i++) terrain.add(mesh(`terrain-other-${i}`));
  terrain.children.at(-1).layers.enable(29);
  const hidden = new THREE.Group(); hidden.visible = false; hidden.add(mesh('hidden-terrain'));
  terrain.add(hidden);
  world.add(terrain);
  const vegetation = new THREE.Group(); vegetation.name = 'vegetation';
  const lod = new THREE.LOD();
  const near = mesh('near-leaves'), far = mesh('hidden-far-leaves');
  lod.addLevel(near, 0); lod.addLevel(far, 100); far.visible = false;
  let lodUpdates = 0;
  lod.update = () => { lodUpdates++; near.visible = false; far.visible = true; };
  vegetation.add(lod);
  for (let i = 0; i < 8; i++) vegetation.add(mesh(`leaves-${i}`));
  if (!onlyTerrain) world.add(vegetation);
  const lights = new THREE.Group(); lights.add(new THREE.DirectionalLight(), new THREE.AmbientLight());
  scene.add(world, lights);
  const shadows = Array.from({ length: 4 }, (_, i) => ({ autoUpdate: i % 2 === 0, needsUpdate: i < 2 }));
  const shadowBefore = shadows.map(s => ({ ...s }));
  const original = [];
  scene.traverse(object => original.push({ object, visible: object.visible, mask: object.layers.mask }));
  const expected = [];
  world.traverseVisible(object => { if (object.isMesh && object.layers.test(camera.layers)) expected.push(object); });
  const observations = [];
  const failure = new Error('intentional warm failure');
  let throwRender = false;
  const render = () => {
    const drawn = [];
    scene.traverseVisible(object => {
      if (object.isLOD && object.autoUpdate) object.update(camera);
      if (object.isMesh && object.layers.test(camera.layers)) drawn.push(object);
    });
    observations.push({ drawn, lightsVisible: lights.visible,
      shadows: shadows.map(s => ({ ...s })), lodAutoUpdate: lod.autoUpdate });
    if (throwRender) throw failure;
  };
  const steps = () => createDeploymentForwardWarmBatches({ scene, worldGroup: world,
    csmLights: shadows.map(shadow => ({ shadow })), warmRender: render });
  const restored = () => {
    for (const state of original) {
      assert.equal(state.object.visible, state.visible, `${state.object.name}: original visibility`);
      assert.equal(state.object.layers.mask, state.mask, `${state.object.name}: exact layer mask`);
    }
    assert.equal(lod.autoUpdate, true); assert.equal(lodUpdates, 0, 'warm renders cannot overwrite resolved LOD selection');
    assert.deepEqual(shadows, shadowBefore, 'all four CSM latches restore before each observable yield');
  };
  return { scene, world, camera, terrain, vegetation, parent, lod, lights, shadows,
    geometry, material, expected, observations, failure, render, steps, restored,
    fail() { throwRender = true; }, dispose() { geometry.dispose(); material.dispose(); } };
}

for (const onlyTerrain of [false, true]) {
  const f = nestedFixture(onlyTerrain);
  try {
    const actual = [], batches = [];
    for (const batch of f.steps()) {
      f.restored(); batches.push(batch);
      const observed = f.observations.at(-1);
      assert.equal(observed.lightsVisible, true);
      assert.ok(observed.shadows.every(s => !s.autoUpdate && !s.needsUpdate));
      assert.ok(observed.drawn.length <= 4, `${batch.label}: at most four selected renderables`);
      actual.push(...observed.drawn);
    }
    assert.deepEqual(batches.filter(b => b.label.startsWith('world:terrain')).map(b => b.objects), [4, 4, 1]);
    if (!onlyTerrain) assert.deepEqual(batches.filter(b => b.label.startsWith('world:vegetation')).map(b => b.objects), [4, 4, 1]);
    assert.deepEqual(actual, f.expected, 'every originally visible selected draw runs once, including a child whose parent belongs to another cohort');
  } finally { f.dispose(); }
}

for (const terminal of ['return', 'throw', 'render']) {
  const f = nestedFixture();
  try {
    if (terminal === 'render') f.fail();
    const steps = f.steps(); assert.equal(steps.next().done, false); f.restored();
    if (terminal === 'throw') assert.throws(() => steps.throw(f.failure), error => error === f.failure);
    else steps.return();
    f.restored(); assert.equal(f.observations.length, 1, 'iterator closure never submits later cohorts');
  } finally { f.dispose(); }
}

// The isolated FX path shares descendant-safe masking without changing its
// existing error propagation or its temporary root-visibility policy.
for (const fail of [false, true]) {
  const f = nestedFixture(true);
  try {
    f.scene.remove(f.world); f.scene.add(f.terrain);
    f.terrain.visible = false;
    const nestedLight = new THREE.PointLight(); f.parent.add(nestedLight);
    const unrelated = new THREE.Group(); unrelated.add(new THREE.Mesh(f.geometry, f.material)); f.scene.add(unrelated);
    let nestedLightVisible = false;
    const drawn = [];
    const steps = createIsolatedForwardWarmBatches({ scene: f.scene, root: f.terrain, cohortSize: 4,
      warmRender() {
        assert.equal(unrelated.visible, false); assert.equal(f.lights.visible, true);
        f.scene.traverseVisible(object => {
          if (object === nestedLight) nestedLightVisible = true;
          if (object.isMesh && object.layers.test(f.camera.layers)) drawn.push(object);
        });
        if (fail) throw f.failure;
      } });
    if (fail) assert.throws(() => steps.next(), error => error === f.failure);
    else {
      for (const _ of steps) {
        assert.equal(f.terrain.visible, false); assert.equal(unrelated.visible, true);
        assert.ok(f.expected.every(object => object.visible));
      }
      assert.deepEqual(drawn, f.expected);
    }
    assert.equal(nestedLightVisible, true, 'masking a renderable parent retains its nested light');
    assert.equal(f.terrain.visible, false); assert.equal(unrelated.visible, true);
    assert.equal(f.parent.layers.mask, 1); assert.equal(f.terrain.children.at(-2).layers.mask, 1 | (1 << 29));
  } finally { f.dispose(); }
}

console.log('deploymentWarm.selftest: bounded terrain/vegetation/props/player cohorts, descendant-safe masks, LOD/light/CSM restoration and iterator cleanup passed');
