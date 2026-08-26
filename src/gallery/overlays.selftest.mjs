import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MODULE_IDS } from '../sim/moduleCatalog.js';
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
assert.equal(modules.pickables[0].geometry.type, 'GalleryModuleGeometry',
  'module diagnostic renders a recognizable assembly instead of its collision primitive');
assert.equal(modules.pickables[0].geometry.userData.moduleForm, 'engine');
assert.ok(modules.pickables[0].geometry.attributes.position.count > 100,
  'engine form contains distinct block, bank and fan geometry');
assert.deepEqual(modules.pickables[0].position.toArray(), [0, 0.5, 0],
  'semantic form remains centered on the authoritative hit volume');
assert.deepEqual(modules.pickables[0].scale.toArray(), [1.6, 0.8, 1.4],
  'semantic form remains bounded by the authoritative hit volume');
modules.clear();

const fleetModuleSpec = {
  armor: {
    modules: MODULE_IDS.map((module, index) => ({
      module,
      min: [index * 2 - 0.8, 0.1, -0.7],
      max: [index * 2 + 0.8, 0.9, 0.7],
      turretLocal: false,
      shapes: [{
        kind: 'ellipsoid',
        center: [index * 2, 0.5, 0],
        radii: [0.8, 0.4, 0.7],
      }],
    })),
  },
};
const fleetModules = createInspectionOverlay(fleetModuleSpec, visualRoot(), 'modules');
assert.equal(fleetModules.count, MODULE_IDS.length, 'every canonical module receives a diagnostic form');
fleetModules.pickables.forEach((mesh, index) => {
  assert.equal(mesh.geometry.type, 'GalleryModuleGeometry',
    `${MODULE_IDS[index]} never falls back to a sphere or capsule`);
  assert.equal(mesh.geometry.userData.moduleForm, MODULE_IDS[index]);
  mesh.geometry.computeBoundingBox();
  const { min, max } = mesh.geometry.boundingBox;
  assert.ok(min.x >= -0.501 && min.y >= -0.501 && min.z >= -0.501,
    `${MODULE_IDS[index]} form stays inside its authoritative lower bounds`);
  assert.ok(max.x <= 0.501 && max.y <= 0.501 && max.z <= 0.501,
    `${MODULE_IDS[index]} form stays inside its authoritative upper bounds`);
});
fleetModules.clear();

const crew = createInspectionOverlay(spec, visual, 'crew');
assert.equal(crew.count, 1);
assert.equal(crew.pickables[0].geometry.type, 'CapsuleGeometry',
  'crew diagnostic renders its body capsule instead of an AABB');
crew.clear();

console.log('overlays.selftest: exact armor cells, recognizable modules and smooth crew volumes passed');
