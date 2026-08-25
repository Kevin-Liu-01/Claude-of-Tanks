import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArmorAimOverlay } from './armorAimOverlay.js';

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
const shellSpec = {
  name: 'test AP', type: 'AP', caliberMm: 100,
  pen100Mm: 150, pen1000Mm: 100,
};

const overlay = createArmorAimOverlay();
const entry = overlay.prime(target);
assert(entry && entry.frames.length === 1, 'closed hull shell creates one articulated overlay mesh');
assert(entry.frames.every((frame) => !frame.mesh.visible), 'primed meshes stay hidden before scoped aim');

const restoreWarm = overlay.warm();
assert(entry.frames.every((frame) => frame.mesh.visible), 'warm exposes overlay shaders under the loading veil');
restoreWarm();
assert(entry.frames.every((frame) => !frame.mesh.visible), 'warm visibility is restored before reveal');

overlay.update({
  enabled: true,
  scoped: true,
  target,
  shellSpec,
  muzzle: new THREE.Vector3(0, 1, 4),
  nowMs: 0,
});
assert(entry.frames.every((frame) => frame.mesh.visible), 'scoped target enables the armor flashlight');
assert(entry.frames[0].color.version > 0, 'penetration samples update vertex colors');

overlay.update({ enabled: false, scoped: true, target, shellSpec, nowMs: 200 });
assert(entry.frames.every((frame) => !frame.mesh.visible), 'setting disables the overlay immediately');
overlay.clear();
assert.equal(hull.getObjectByName('armor_flashlight_hull'), undefined,
  'battle cleanup detaches generated overlay meshes');
overlay.dispose();

console.log('armorAimOverlay.selftest: default scoped visibility, shader warmup, sampling and cleanup passed');
