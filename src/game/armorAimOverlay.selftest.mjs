import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArmorAimOverlay } from './armorAimOverlay.ts';

const plate = {
  name: 'test_glacis', kind: 'main', physicalMm: 50, keMm: 50, ceMm: 50,
  verts: [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]],
};
const vertices = [
  [-1, 0, -1], [1, 0, -1], [1, 2, -1], [-1, 2, -1],
  [-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1],
];
const quads = [
  [[4, 5, 6], [4, 6, 7], [0, 3, 2], [0, 2, 1]],
  [[1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]],
  [[3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4]],
];
const faces = quads.flat().map((indices) => {
  const a = new THREE.Vector3().fromArray(vertices[indices[0]]);
  const b = new THREE.Vector3().fromArray(vertices[indices[1]]);
  const c = new THREE.Vector3().fromArray(vertices[indices[2]]);
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  return {
    indices,
    normal: normal.toArray(),
    constant: -normal.dot(a),
    center: a.add(b).add(c).multiplyScalar(1 / 3).toArray(),
    plate,
    internal: false,
  };
});

const root = new THREE.Group();
root.visible = true;
const hull = new THREE.Group();
hull.name = 'rig_hull';
const turret = new THREE.Group();
turret.name = 'rig_turret';
root.add(hull, turret);
const target = {
  id: 'overlay-test',
  state: {
    pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0,
    turretYaw: 0, gunPitch: 0,
  },
  combat: { destroyed: false, eraSpent: new Set() },
  visual: { root },
  spec: {
    armor: {
      turretPivot: [0, 0, 0], gunPivot: [0, 0, 0],
      hullPlates: [plate], turretPlates: [], modules: [], crew: [],
      collisionShells: {
        hull: [{ min: [-1, 0, -1], max: [1, 2, 1], vertices, faces }],
        turret: [],
      },
    },
  },
};
const secondRoot = root.clone(true);
const secondHull = secondRoot.getObjectByName('rig_hull');
const secondTarget = {
  ...target,
  id: 'overlay-test-2',
  state: { ...target.state, pos: new THREE.Vector3(4, 0, 0) },
  combat: { destroyed: false, eraSpent: new Set() },
  visual: { root: secondRoot },
};
const shellSpec = {
  name: 'test AP', type: 'AP', caliberMm: 100,
  pen100Mm: 150, pen1000Mm: 100,
};

const overlay = createArmorAimOverlay();
const entry = overlay.prime(target);
const secondEntry = overlay.prime(secondTarget);
assert(entry && entry.frames.length === 1, 'closed hull shell creates one articulated overlay mesh');
assert(secondEntry && secondEntry.frames.length === 1, 'every scoped enemy receives its own overlay mesh');
assert(entry.frames.every((frame) => !frame.mesh.visible), 'primed meshes stay hidden before entering scope');

// 243: the shell is the cells' outer skin, evenly lifted: closed and outward (its area-weighted normals cancel), every
// vertex 5-9 cm off the box, crease outlines marked, every vertex painted by its panel's one sample.
{
  const frame = entry.frames[0];
  const position = frame.geometry.getAttribute('position');
  const closure = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 3) {
    a.fromBufferAttribute(position, vertex); b.fromBufferAttribute(position, vertex + 1); c.fromBufferAttribute(position, vertex + 2);
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(new THREE.Vector3(0, 1, 0));
    assert.ok(normal.dot(centroid) > 0, 'every flashlight triangle faces out of the cell');
    closure.add(normal);
  }
  assert.ok(closure.length() < 1e-3, `the lifted skin is closed (area-weighted normals sum to ${closure.length()})`);
  for (let vertex = 0; vertex < position.count; vertex++) {
    a.fromBufferAttribute(position, vertex);
    const out = Math.max(Math.abs(a.x) - 1, Math.abs(a.y - 1) - 1, Math.abs(a.z) - 1);
    assert.ok(out > 0.05 && out < 0.09, `skin vertex ${vertex} stands ${out.toFixed(3)} m off the armour`);
  }
  const border = frame.geometry.getAttribute('aSkinBorder');
  let outlined = 0;
  for (let index = 0; index < border.array.length; index++) outlined += border.array[index];
  assert.ok(outlined > 0, 'the box edges are panel outlines');
  const painted = new Uint8Array(position.count);
  for (const sample of frame.samples) for (let index = sample.start; index < sample.end; index++) painted[frame.targets[index]]++;
  assert.ok(painted.every((count) => count === 1), 'every skin vertex takes exactly one panel sample');
  assert.ok(secondEntry.frames[0].geometry.getAttribute('position') === position, 'vehicles of one spec share the shell');
  assert.notEqual(secondEntry.frames[0].color, frame.color, 'each vehicle paints its own colours');
}

const restoreWarm = overlay.warm();
assert(entry.frames.every((frame) => frame.mesh.visible), 'warm exposes overlay shaders under the loading veil');
restoreWarm();
assert(entry.frames.every((frame) => !frame.mesh.visible), 'warm visibility is restored before reveal');

overlay.update({
  enabled: true,
  scoped: true,
  targets: [target, secondTarget],
  target: null,
  shellSpec,
  muzzle: new THREE.Vector3(0, 1, 4),
  nowMs: 0,
});
assert(entry.frames.every((frame) => frame.mesh.visible),
  'scope enables armor highlighting without a direct reticle target');
assert(secondEntry.frames.every((frame) => frame.mesh.visible),
  'scope keeps every visible enemy armor overlay active');
assert(entry.frames[0].color.version > 0, 'penetration samples update vertex colors');
assert.equal(secondEntry.frames[0].color.version, 0,
  'one update retains the original single-batch penetration-query budget');

overlay.update({
  enabled: true,
  scoped: false,
  targets: [target, secondTarget],
  shellSpec,
  nowMs: 100,
});
assert(entry.frames.every((frame) => !frame.mesh.visible), 'leaving scope hides armor highlighting');
assert(secondEntry.frames.every((frame) => !frame.mesh.visible), 'scope exit hides every enemy overlay');

overlay.update({
  enabled: true,
  scoped: true,
  targets: [target, secondTarget],
  shellSpec,
  muzzle: new THREE.Vector3(0, 1, 4),
  nowMs: 150,
});

overlay.update({ enabled: false, scoped: true, targets: [target, secondTarget], shellSpec, nowMs: 200 });
assert(entry.frames.every((frame) => !frame.mesh.visible), 'setting disables the overlay immediately');
assert(secondEntry.frames.every((frame) => !frame.mesh.visible), 'setting hides every scoped overlay');
overlay.clear();
assert.ok(hull.getObjectByName('armor_flashlight_hull') === undefined,
  'battle cleanup detaches generated overlay meshes');
assert.ok(secondHull.getObjectByName('armor_flashlight_hull') === undefined,
  'battle cleanup detaches every generated overlay mesh');
overlay.dispose();

console.log('armorAimOverlay.selftest: scope-owned multi-target visibility, bounded sampling and cleanup passed');
