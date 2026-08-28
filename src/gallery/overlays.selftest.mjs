import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../vehicles/tankFactory.js';
import { MODULE_IDS } from '../sim/moduleCatalog.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.js';
import {
  CREW_ARMOR_CLEARANCE_M,
  CREW_STANDING_HEIGHT_M,
} from '../vehicles/internalAnatomyVisuals.js';
import { createInspectionOverlay } from './overlays.ts';

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

function capsuleJoint(mesh, side) {
  const halfHeight = mesh.geometry.parameters.height / 2;
  return new THREE.Vector3(0, side * halfHeight, 0)
    .applyQuaternion(mesh.quaternion)
    .add(mesh.position);
}

function assertCrewLegsAttached(model, label) {
  model.updateMatrixWorld(true);
  const torsoBounds = new THREE.Box3().setFromObject(model.getObjectByName('crew_torso'));
  for (const side of ['left', 'right']) {
    const thigh = model.getObjectByName(`crew_leg_${side}`);
    const shin = model.getObjectByName(`crew_shin_${side}`);
    assert.ok(capsuleJoint(thigh, 1).distanceTo(capsuleJoint(shin, 1)) < 1e-9,
      `${label}: ${side} thigh and shin share one knee joint`);
    assert.ok(torsoBounds.intersectsBox(new THREE.Box3().setFromObject(thigh)),
      `${label}: ${side} thigh remains attached at the hip`);
    assert.ok(new THREE.Box3().setFromObject(thigh).intersectsBox(new THREE.Box3().setFromObject(shin)),
      `${label}: ${side} knee geometry overlaps without a visible gap`);
  }
}

function crewSize(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.traverse((object) => {
    if (object.isMesh && object.name.startsWith('crew_')) bounds.expandByObject(object);
  });
  return bounds.getSize(new THREE.Vector3());
}

function crewBounds(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.traverse((object) => {
    if (object.isMesh && object.name.startsWith('crew_')) bounds.expandByObject(object);
  });
  return bounds;
}

function assertCrewInsideArmor(model, label) {
  const metadata = model.userData.internalAnatomy;
  assert.equal(metadata.visualAnchorPolicy, 'structuralArmorEnvelope',
    `${label}: visual station is resolved against structural armor`);
  assert.equal(metadata.armorClearanceM, CREW_ARMOR_CLEARANCE_M,
    `${label}: fleet-wide armor clearance`);
  const bounds = crewBounds(model);
  const compartment = metadata.compartmentBounds;
  assert.ok(bounds.min.y >= metadata.compartmentFloorY + CREW_ARMOR_CLEARANCE_M - 1e-8,
    `${label}: feet remain above the exact hull-shell floor`);
  assert.ok(bounds.max.y <= metadata.compartmentRoofY - CREW_ARMOR_CLEARANCE_M + 1e-8,
    `${label}: helmet remains below the local structural roof`);
  for (const axis of [0, 2]) {
    const span = compartment.max[axis] - compartment.min[axis];
    const bodySpan = bounds.max.getComponent(axis) - bounds.min.getComponent(axis);
    if (span + 1e-9 < bodySpan + CREW_ARMOR_CLEARANCE_M * 2) continue;
    assert.ok(bounds.min.getComponent(axis)
        >= compartment.min[axis] + CREW_ARMOR_CLEARANCE_M - 1e-8,
    `${label}: crew stays inside the structural ${axis === 0 ? 'side' : 'fore/aft'} limit`);
    assert.ok(bounds.max.getComponent(axis)
        <= compartment.max[axis] - CREW_ARMOR_CLEARANCE_M + 1e-8,
    `${label}: crew stays inside the structural ${axis === 0 ? 'side' : 'fore/aft'} limit`);
  }
}

function assertModuleAboveFloor(model, label) {
  const metadata = model.userData.internalAnatomy;
  if (!Number.isFinite(metadata.compartmentFloorY)) return;
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  model.traverse((object) => {
    if (object.isMesh && object.material?.colorWrite !== false) bounds.expandByObject(object);
  });
  assert.ok(bounds.min.y >= metadata.compartmentFloorY + CREW_ARMOR_CLEARANCE_M - 1e-8,
    `${label}: recognizable module remains above the exact hull-shell floor`);
}

function assertCanonicalCrewScale(model, expected, label) {
  const metadata = model.userData.internalAnatomy;
  assert.equal(metadata.standingHeightM, CREW_STANDING_HEIGHT_M,
    `${label}: five-foot standing-height reference`);
  assert.equal(metadata.scalePolicy, 'canonicalMeters', `${label}: canonical meter scale`);
  const size = crewSize(model);
  assert(size.y < CREW_STANDING_HEIGHT_M,
    `${label}: seated pose is shorter than its standing-height reference`);
  if (expected) {
    assert(size.distanceTo(expected) < 1e-9,
      `${label}: crew dimensions do not inherit the station damage volume`);
  }
  return size;
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
assert.equal(engineModel.userData.internalAnatomy.type, 'module');
assert.equal(engineModel.userData.internalAnatomy.key, 'engine');
assert.equal(engineModel.userData.internalAnatomy.visualAnchorPolicy, 'preciseCombatShapes',
  'internal module visuals use the same shell-fitted shapes as combat');
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
assertCrewLegsAttached(crew.pickables[0].userData.inspectionVisual, 'fixture driver');
const canonicalCrewSize = assertCanonicalCrewScale(
  crew.pickables[0].userData.inspectionVisual,
  null,
  'fixture driver',
);
const canonicalCrewSizes = new Map([['reclinedSeated', canonicalCrewSize]]);
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
  for (const picker of moduleOverlay.pickables) {
    const model = picker.userData.inspectionVisual;
    assertModuleAboveFloor(model, `${id}:${model.userData.internalAnatomy.key}`);
  }
  auditedModules += moduleOverlay.count;
  moduleOverlay.clear();

  const crewVolumes = tankSpec.armor?.crew || [];
  const crewOverlay = createInspectionOverlay(tankSpec, visualRoot(), 'crew');
  assert.equal(crewOverlay.count, crewVolumes.length,
    `${id}: each crew station renders exactly once`);
  for (const picker of crewOverlay.pickables) {
    assert.equal(anatomyMeshes(picker).filter((mesh) => mesh.name.startsWith('crew_')).length, 10,
      `${id}: every crew station keeps the articulated human silhouette`);
    assertCrewLegsAttached(
      picker.userData.inspectionVisual,
      `${id}:${picker.userData.inspectionVisual.userData.internalAnatomy.key}`,
    );
    const model = picker.userData.inspectionVisual;
    const pose = model.userData.internalAnatomy.pose;
    const size = assertCanonicalCrewScale(
      model,
      canonicalCrewSizes.get(pose) || null,
      `${id}:${model.userData.internalAnatomy.key}`,
    );
    if (!canonicalCrewSizes.has(pose)) canonicalCrewSizes.set(pose, size);
    assertCrewInsideArmor(
      picker.userData.inspectionVisual,
      `${id}:${picker.userData.inspectionVisual.userData.internalAnatomy.key}`,
    );
  }
  auditedCrew += crewOverlay.count;
  crewOverlay.clear();
}

console.log(`overlays.selftest: kill-cam anatomy parity passed (${ALL_TANK_IDS.length} tanks, ${auditedModules} module models, ${auditedCrew} crew models)`);
