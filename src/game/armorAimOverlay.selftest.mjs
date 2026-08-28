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
assert.equal(hull.getObjectByName('armor_flashlight_hull'), undefined,
  'battle cleanup detaches generated overlay meshes');
assert.equal(secondHull.getObjectByName('armor_flashlight_hull'), undefined,
  'battle cleanup detaches every generated overlay mesh');
overlay.dispose();

console.log('armorAimOverlay.selftest: scope-owned multi-target visibility, bounded sampling and cleanup passed');
