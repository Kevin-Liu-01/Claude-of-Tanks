// Receipt for the swap after the reveal (wreck-bake-after-reveal-278, src/world/deferredWrecks.ts), on small stand-in
// geometry and a scripted bake client: each bake key bakes once, the key with the hulk nearest the focus first; each
// key's hulks swap in as it lands (a mesh a hulk over the bake's one geometry, posed by its matrix as props.ts commitWreck
// poses it) and the stand-ins are redrawn without them, then leave the scene; a bake that fails keeps its hulk's stand-in;
// a cancel (the world's dispose) stops the client and swaps nothing; a second call returns the first run's stats.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeDeferredWrecks, deferredBakeOrder, deferredHulkMatrix } from './deferredWrecks.ts';

const box = (w, colour) => {
  const g = new THREE.BoxGeometry(w, 1, w).toNonIndexed();
  g.deleteAttribute('uv');
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(colour), 3));
  return g;
};
const hulk = (specId, seed, x, { standIn = true, lean = [0, 0, 0, 1] } = {}) => ({
  specId, options: { seed, state: 'burnt_out', remnant: 0 }, yaw: 0.7, quaternion: lean, position: [x, 2, 5],
  standIn: standIn ? box(0.5, 0.06).translate(x, 2, 5) : null,
});
function makePlan(hulks, focus = null) {
  // a world group as map.ts leaves it: placed (a parent's offset here), its matrices composed once, then frozen
  const world = new THREE.Group();
  world.position.set(0, 0.5, 0);
  const group = new THREE.Group();
  world.add(group);
  world.updateMatrixWorld(true);
  group.updateMatrixWorld = () => {};
  world.updateMatrixWorld = () => {};
  const mesh = new THREE.Mesh(new THREE.BufferGeometry()), shadow = new THREE.Mesh(new THREE.BufferGeometry());
  group.add(mesh, shadow);
  const swaps = [];
  const plan = {
    hulks, mesh, shadow, focus, state: 'pending', setShadowProfile() {},
    makeHulk(geo, shadowGeo, matrix, specId) {
      const m = new THREE.Mesh(geo); m.name = 'hulk'; m.userData.specId = specId; m.matrixAutoUpdate = false; m.matrix.copy(matrix);
      swaps.push(specId);
      return shadowGeo ? [m, Object.assign(new THREE.Mesh(shadowGeo), { name: 'hulk-shadow' })] : [m];
    },
  };
  return { plan, group, swaps };
}
const bakeOf = (w) => ({ geo: box(w, 0.2), shadowGeo: box(w * 0.9, 0), solids: [], hx: w / 2, hz: w / 2, h: 1, tris: 12 });
const client = (calls, fail = null) => () => ({
  async bake(specId, options) { calls.push(`${specId}|${options.seed}`); if (specId === fail) throw new Error('worker failed'); return bakeOf(specId === 'a' ? 2 : 3); },
  dispose() {},
});

// 0. the pose matrix is commitWreck's three transforms (rotateY, the lean, the seat)
{
  const lean = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0.1, 0.99, 0.05).normalize());
  const h = hulk('a', 1, 10, { lean: [lean.x, lean.y, lean.z, lean.w] });
  const g = box(2, 0.2);
  const steps = g.clone().rotateY(h.yaw).applyQuaternion(lean).translate(...h.position);
  const posed = g.clone().applyMatrix4(deferredHulkMatrix(h));
  for (let i = 0; i < g.attributes.position.array.length; i++) {
    assert.ok(Math.abs(steps.attributes.position.array[i] - posed.attributes.position.array[i]) < 1e-5, 'the matrix poses as the props build does');
  }
}
// 1. the bake order: the key with the hulk nearest the focus first
assert.deepEqual(deferredBakeOrder([hulk('a', 1, 100), hulk('b', 2, 50), hulk('c', 3, 10), hulk('a', 1, 5)], [0, 5]), ['a|1|burnt_out', 'c|3|burnt_out', 'b|2|burnt_out']);
assert.deepEqual(deferredBakeOrder([hulk('a', 1, 100), hulk('b', 2, 50)], null), ['a|1|burnt_out', 'b|2|burnt_out'], 'seat order without a focus');
// 2. two hulks of one bake and one of another: two bakes, nearest first, three hulks swapped, the stand-ins gone
{
  const calls = [];
  const { plan, group, swaps } = makePlan([hulk('a', 1, 40), hulk('b', 2, 20), hulk('a', 1, 60)], [0, 5]);
  const standInCounts = [];
  const pace = () => { standInCounts.push(plan.hulks.filter((h) => h.standIn).length); return Promise.resolve(); };
  const stats = await bakeDeferredWrecks(plan, { makeClient: client(calls), pace });
  assert.deepEqual(calls, ['b|2', 'a|1'], 'each bake key bakes once, nearest the focus first');
  assert.deepEqual(swaps, ['b', 'a', 'a'], 'each key\'s hulks swap as it lands');
  assert.deepEqual(standInCounts, [3, 2], 'one landing at a time: the stand-ins still waiting before each');
  assert.equal(plan.state, 'done');
  assert.deepEqual({ hulks: stats.hulks, bakes: stats.bakes, baked: stats.baked, failed: stats.failed, swaps: stats.swapsMs.length },
    { hulks: 3, bakes: 2, baked: 2, failed: 0, swaps: 2 });
  const hulks = group.children.filter((o) => o.name === 'hulk');
  assert.equal(hulks.length, 3);
  assert.ok(hulks[1].geometry === hulks[2].geometry, 'a bake\'s hulks share its geometry');
  assert.ok(hulks.every((m) => Math.abs(m.matrix.elements[13] - 2) < 1e-9), 'each posed at its seat');
  // what the renderer reads: the world matrix, under a frozen world group (the browser's KV-2 drew nowhere without it)
  assert.ok(hulks.every((m) => Math.abs(m.matrixWorld.elements[13] - 2.5) < 1e-9 && Math.abs(m.matrixWorld.elements[12] - m.matrix.elements[12]) < 1e-9),
    'each hulk\'s world matrix is its pose under the frozen world');
  assert.equal(group.children.filter((o) => o.name === 'hulk-shadow').length, 3, 'each with its shadow proxy');
  assert.ok(plan.mesh.parent === null, 'the stand-ins left the scene');
  assert.ok(plan.shadow.parent === null, 'and their shadow');
  assert.ok(plan.hulks.every((h) => h.standIn === null), 'the stand-ins are released');
  assert.equal(await bakeDeferredWrecks(plan), stats, 'a second call returns the first run');
}
// 3. a failed bake keeps its hulk's stand-in drawn
{
  const { plan, group } = makePlan([hulk('a', 1, 10), hulk('b', 2, 20)]);
  const warn = console.warn; console.warn = () => {};
  let stats;
  try { stats = await bakeDeferredWrecks(plan, { makeClient: client([], 'b'), pace: () => Promise.resolve() }); } finally { console.warn = warn; }
  assert.equal(stats.failed, 1);
  assert.equal(plan.state, 'done');
  assert.equal(group.children.filter((o) => o.name === 'hulk').length, 1, 'the baked hulk swapped');
  assert.ok(plan.mesh.parent === group, 'the failed hulk\'s stand-in stays');
  assert.equal(plan.mesh.geometry.attributes.position.count, 36, 'and draws it alone');
}
// 4. a cancel while baking swaps nothing and stops the client
{
  const { plan, group } = makePlan([hulk('a', 1, 10), hulk('b', 2, 20)]);
  const before = plan.mesh.geometry;
  let stopped = false, release;
  const run = bakeDeferredWrecks(plan, {
    makeClient: () => ({
      bake: () => new Promise((resolve, reject) => { release = () => reject(new Error('Wreck worker disposed')); }),
      dispose() { stopped = true; release?.(); },
    }),
    pace: () => Promise.resolve(),
  });
  await Promise.resolve();
  plan.cancel();
  await run;
  assert.equal(plan.state, 'cancelled');
  assert.ok(stopped, 'the client is stopped');
  assert.ok(plan.mesh.geometry === before, 'the stand-ins stay drawn');
  assert.equal(group.children.filter((o) => o.name === 'hulk').length, 0, 'no hulk swapped');
}
console.log('deferredWrecks.selftest: nearest bake first, one bake a key, each key\'s hulks swapped as it lands; a failed bake keeps its stand-in; a cancel swaps nothing');
