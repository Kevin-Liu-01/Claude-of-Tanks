import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('t90sm', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const turretRig = tank.root.getObjectByName('rig_turret');
  const turret = turretRig?.getObjectByName('turret');
  const turretDark = turretRig?.getObjectByName('turretDark');
  assert.ok(turretRig && turret?.isMesh && turretDark?.isMesh,
    'T-90SM keeps its structural and dark turret geometry under rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const familyGun = gunRig?.userData.t90FamilyGunReceipt;
  assert.equal(familyGun?.referenceFamily, 't90m-2a46m5-thermal-jacket-r1',
    'T-90SM adopts the T-90M 2A46M-5 visual family');
  assert.ok(Math.abs(familyGun?.sleeveRadiusM - 0.108) < 1e-6,
    'T-90SM thermal sleeve uses the T-90M radius');
  assert.ok(Math.abs(familyGun?.forwardRadiusM - 0.102) < 1e-6,
    'T-90SM no longer collapses to a pencil-thin forward tube');
  assert.ok(Math.abs(familyGun?.boreRadiusM - 0.062) < 1e-6,
    'T-90SM muzzle bore follows the shared family proportion');
  assert.ok(Math.abs(familyGun?.muzzleZ - 4.97) < 1e-6,
    'T-90SM retains its accepted longitudinal muzzle station');
  assert.equal(familyGun?.assemblyRaiseM, 0,
    'T-90SM keeps its accepted trunnion height while adopting the heavier tube');

  const collectVertices = (mesh) => {
    const position = mesh.geometry.attributes.position;
    const vertices = [];
    for (let index = 0; index < position.count; index += 1) {
      vertices.push(new THREE.Vector3().fromBufferAttribute(position, index));
    }
    return vertices;
  };
  const vertices = collectVertices(turret);
  const darkVertices = collectVertices(turretDark);
  const near = (value, target, epsilon = 1e-3) => Math.abs(value - target) < epsilon;
  const hasVertexIn = (list, [x, y, z]) => list.some(vertex => near(vertex.x, x)
    && near(vertex.y, y) && near(vertex.z, z));
  const hasVertex = (anchor) => hasVertexIn(vertices, anchor);

  const lowerRingAnchors = [
    [-1.565, 0.080, 1.18],
    [1.565, 0.080, 1.18],
    [-1.42, 0.080, 0.14],
    [1.42, 0.080, 0.14],
  ];
  for (const anchor of lowerRingAnchors) {
    assert.ok(hasVertex(anchor),
      `mirrored cheek lower ring remains raised at ${anchor.join(',')}`);
  }

  const formerDeckAnchors = [
    [-1.565, -0.005, 1.18],
    [1.565, -0.005, 1.18],
    [-1.42, 0.000, 0.14],
    [1.42, 0.000, 0.14],
  ];
  for (const anchor of formerDeckAnchors) {
    assert.equal(hasVertex(anchor), false,
      `marked cheek lower ring must not remain on the hull deck at ${anchor.join(',')}`);
  }

  const removedOuterCheekAnchors = [
    [-1.86, 0.02, 0.5765],
    [-1.86, 0.02, 1.0165],
    [1.82, 0.02, 0.7115],
    [1.82, 0.02, 0.9915],
  ];
  for (const anchor of removedOuterCheekAnchors) {
    assert.equal(hasVertex(anchor), false,
      `owner-selected outer cheek protrusion is absent at ${anchor.join(',')}`);
  }

  for (const s of [-1, 1]) {
    for (const [x, z, depth] of [
      [1.12, -1.17, 0.38],
      [1.24, -0.90, 0.32],
      [1.3725, -0.56, 0.33],
    ]) {
      const removedBackingCorner = [s * (x + 0.0125), 0.1624, z - depth * 0.45];
      assert.equal(hasVertexIn(darkVertices, removedBackingCorner), false,
        `owner-selected gray bustle backing is absent at ${removedBackingCorner.join(',')}`);
    }

    const aftDepth = s < 0 ? 0.90 : 0.78;
    const aftZ = s < 0 ? -1.63 : -1.57;
    const preservedBackingCorner = [s * 0.9975, 0.1624, aftZ - aftDepth * 0.45];
    assert.ok(hasVertexIn(darkVertices, preservedBackingCorner),
      `aft bustle closure remains at ${preservedBackingCorner.join(',')}`);
  }

  const fitReceipt = turretRig.userData.t90smFitReceipt;
  assert.deepEqual({
    outerCheekProtrusionsRemoved: fitReceipt?.outerCheekProtrusionsRemoved,
    outerCheekEndCapsRemoved: fitReceipt?.outerCheekEndCapsRemoved,
    markedBustleBackingsRemoved: fitReceipt?.markedBustleBackingsRemoved,
    preservedAftBustleBackings: fitReceipt?.preservedAftBustleBackings,
  }, {
    outerCheekProtrusionsRemoved: true,
    outerCheekEndCapsRemoved: 2,
    markedBustleBackingsRemoved: 6,
    preservedAftBustleBackings: 2,
  }, 'T-90SM fit receipt records the selected removals');

  const ring = fitReceipt?.turretRing;
  assert.deepEqual(ring, {
    topRadiusM: 1.08,
    bottomRadiusM: 1.14,
    heightM: 0.12,
    yM: 0.02,
    zM: -0.06,
  }, 'T-90SM turret ring receipt remains dimensionally stable');
  assert.ok(vertices.some((vertex) => near(vertex.y, ring.yM - ring.heightM / 2)
    && near(Math.hypot(vertex.x, vertex.z - ring.zM), ring.bottomRadiusM)),
  'T-90SM turret ring lower edge is present in structural turret geometry');

  for (const yaw of [0, Math.PI / 2]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    for (const anchor of lowerRingAnchors) {
      const world = turret.localToWorld(new THREE.Vector3(...anchor));
      assert.ok(world.y >= 1.475,
        `cheek lower ring clears the hull deck through yaw ${yaw}: ${world.y}`);
    }
  }
} finally {
  tank.dispose();
}

console.log('t90SMTurretClearance.selftest: cheek removals, bustle cleanup, and turret ring verified');
