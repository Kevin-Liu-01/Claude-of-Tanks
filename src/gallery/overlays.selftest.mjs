import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createInspectionOverlay } from './overlays.js';

function visualRoot() {
  const root = new THREE.Group();
  root.name = 'tank';
  const turret = new THREE.Group();
  turret.name = 'rig_turret';
  root.add(turret);
  return { root };
}

const plate = {
  name: 'exact_front', kind: 'main', physicalMm: 100, keMm: 120, ceMm: 110,
  verts: [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]],
};
const collisionCell = {
  vertices: [[-1, 0, 1], [1, 0, 1], [1, 1, 1]],
  faces: [{ indices: [0, 1, 2], plate, internal: false }],
};
const spec = {
  armor: {
    hullPlates: [plate],
    turretPlates: [],
    collisionShells: { hull: [collisionCell], turret: [] },
    modules: [{
      module: 'engine', min: [-1, 0, -1], max: [1, 1, 1], turretLocal: false,
      shapes: [{ kind: 'ellipsoid', center: [0, 0.5, 0], radii: [0.8, 0.4, 0.7] }],
    }],
    crew: [{
      crew: 'driver', min: [-0.4, 0, -0.4], max: [0.4, 1.4, 0.4], turretLocal: false,
      shapes: [{ kind: 'capsule', a: [0, 0.35, 0], b: [0, 1.05, 0], radius: 0.28 }],
    }],
  },
};

const visual = visualRoot();
const armor = createInspectionOverlay(spec, visual, 'armor');
assert.equal(armor.count, 1, 'closed collision faces replace broad authored main plate geometry');
assert.equal(armor.pickables[0].geometry.attributes.position.count, 3,
  'gallery armor diagnostic uses the exact collision triangle');
armor.clear();

const modules = createInspectionOverlay(spec, visual, 'modules');
assert.equal(modules.count, 1);
assert.equal(modules.pickables[0].geometry.type, 'SphereGeometry',
  'module diagnostic renders its smooth ellipsoid instead of an AABB');
modules.clear();

const crew = createInspectionOverlay(spec, visual, 'crew');
assert.equal(crew.count, 1);
assert.equal(crew.pickables[0].geometry.type, 'CapsuleGeometry',
  'crew diagnostic renders its body capsule instead of an AABB');
crew.clear();

console.log('overlays.selftest: exact armor cells and smooth internal diagnostic volumes passed');
