import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../vehicles/tankFactory.js';
import { MODULE_IDS } from '../sim/moduleCatalog.js';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.js';
import { createInspectionOverlay } from './overlays.js';

function visualRoot() {
  const root = new THREE.Group();
  root.name = 'tank';
  const turret = new THREE.Group();
  turret.name = 'rig_turret';
  root.add(turret);
  return { root };
}

function anatomyMeshes(picker) {
  const meshes = [];
  picker.userData.inspectionVisual.traverse((object) => {
    if (object.isMesh && object !== picker) meshes.push(object);
  });
  return meshes;
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
  era: 'modern',
  gun: { shells: [{ caliberMm: 120 }] },
  armor: {
    hullPlates: [plate],
    turretPlates: [],
    collisionShells: { hull: [collisionCell], turret: [] },
    modules: [{
      module: 'engine', min: [-1, 0, -1], max: [1, 1, 1], turretLocal: false,
      shapes: [
        { kind: 'ellipsoid', center: [0, 0.3, -0.4], radii: [0.8, 0.2, 0.3] },
        { kind: 'ellipsoid', center: [0, 0.7, 0.4], radii: [0.8, 0.2, 0.3] },
      ],
    }],
    crew: [{
      crew: 'driver', min: [-0.4, 0, -0.4], max: [0.4, 1.4, 0.4], turretLocal: false,
      shapes: [
        { kind: 'ellipsoid', center: [0, 0.4, 0], radii: [0.3, 0.4, 0.3] },
        { kind: 'ellipsoid', center: [0, 1.0, 0], radii: [0.15, 0.15, 0.15] },
      ],
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
assert.equal(modules.count, 1,
  'shape segmentation never duplicates one canonical module model');
const engineModel = modules.pickables[0].userData.inspectionVisual;
assert.deepEqual(engineModel.userData.internalAnatomy, { type: 'module', key: 'engine' });
assert.ok(anatomyMeshes(modules.pickables[0]).length > 12,
  'Gallery uses the recognizable kill-cam engine assembly');
const moduleLines = [];
engineModel.traverse((object) => {
  if (object.isLineSegments) moduleLines.push(object);
});
assert.ok(moduleLines.length > 12, 'kill-cam model receives a detailed Gallery line treatment');
assert.ok(moduleLines.every((line) => line.material.isLineDashedMaterial),
  'Gallery anatomy uses dashed diagnostic lines');
modules.clear();

const canonicalModuleIds = MODULE_IDS.filter((module) => module !== 'trackL' && module !== 'trackR');
const fleetModuleSpec = {
  era: 'modern',
  gun: { shells: [{ caliberMm: 120 }] },
  armor: {
    modules: MODULE_IDS.map((module, index) => ({
      module,
      min: [index * 2 - 0.8, 0.1, -0.7],
      max: [index * 2 + 0.8, 0.9, 0.7],
      turretLocal: false,
      shapes: [
        { kind: 'ellipsoid', center: [index * 2, 0.35, 0], radii: [0.8, 0.2, 0.7] },
        { kind: 'ellipsoid', center: [index * 2, 0.65, 0], radii: [0.8, 0.2, 0.7] },
      ],
    })),
  },
};
const fleetModules = createInspectionOverlay(fleetModuleSpec, visualRoot(), 'modules');
assert.equal(fleetModules.count, canonicalModuleIds.length,
  'every internal canonical module receives exactly one kill-cam model');
fleetModules.pickables.forEach((picker, index) => {
  assert.equal(picker.userData.inspectionVisual.userData.internalAnatomy.key, canonicalModuleIds[index]);
});
fleetModules.clear();

const ringSpec = {
  era: 'modern',
  armor: {
    modules: [{
      module: 'turretRing', min: [-1, 1, -1], max: [1, 1.2, 1], turretLocal: false,
      shapes: [1, 2, 3, 4].map((offset) => ({
        kind: 'ellipsoid', center: [0, 1 + offset * 0.02, 0], radii: [1, 0.04, 1],
      })),
    }],
  },
};
const ring = createInspectionOverlay(ringSpec, visualRoot(), 'modules');
assert.equal(ring.count, 1, 'four fitted ring shapes still render one turret ring');
assert.equal(anatomyMeshes(ring.pickables[0]).filter((mesh) => mesh.geometry.type === 'TorusGeometry').length, 1,
  'the one canonical turret ring contains one ring mesh');
ring.clear();

const crew = createInspectionOverlay(spec, visual, 'crew');
assert.equal(crew.count, 1, 'shape segmentation never duplicates one crew station');
assert.deepEqual(anatomyMeshes(crew.pickables[0]).map((mesh) => mesh.name).sort(),
  [
    'crew_arm_left', 'crew_arm_right', 'crew_head', 'crew_helmet',
    'crew_leg_left', 'crew_leg_right', 'crew_shin_left', 'crew_shin_right',
    'crew_shoulders', 'crew_torso',
  ],
  'crew uses the kill-cam seated human silhouette, not combat-shape blobs');
crew.clear();

let auditedModules = 0;
let auditedCrew = 0;
for (const id of ALL_TANK_IDS) {
  const tankSpec = getSpec(id);
  const moduleVolumes = tankSpec.armor?.modules || [];
  const expectedModules = moduleVolumes
    .filter((volume) => volume.module !== 'trackL' && volume.module !== 'trackR')
    .reduce((sum, volume) => sum + (volume.parts?.length || 1), 0);
  const moduleOverlay = createInspectionOverlay(tankSpec, visualRoot(), 'modules');
  assert.equal(moduleOverlay.count, expectedModules,
    `${id}: module overlay cardinality follows kill-cam parts, not fitted shapes`);
  const ringVolumes = moduleVolumes.filter((volume) => volume.module === 'turretRing');
  const renderedRings = moduleOverlay.pickables.filter((picker) =>
    picker.userData.inspectionVisual.userData.internalAnatomy.key === 'turretRing');
  assert.equal(renderedRings.length, ringVolumes.length,
    `${id}: each turret-ring module renders exactly once`);
  auditedModules += moduleOverlay.count;
  moduleOverlay.clear();

  const crewVolumes = tankSpec.armor?.crew || [];
  const crewOverlay = createInspectionOverlay(tankSpec, visualRoot(), 'crew');
  assert.equal(crewOverlay.count, crewVolumes.length,
    `${id}: each crew station renders exactly once`);
  for (const picker of crewOverlay.pickables) {
    assert.equal(anatomyMeshes(picker).filter((mesh) => mesh.name.startsWith('crew_')).length, 10,
      `${id}: every crew station keeps the articulated human silhouette`);
  }
  auditedCrew += crewOverlay.count;
  crewOverlay.clear();
}

console.log(`overlays.selftest: kill-cam anatomy parity passed (${ALL_TANK_IDS.length} tanks, ${auditedModules} module models, ${auditedCrew} crew models)`);
