import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const CASES = {
  stb1: {
    family: 'stb-leopard-generation-cast',
    planStations: 18,
    width: [2.58, 2.66],
    depth: [3.12, 3.22],
    shellHeightM: 0.535,
  },
  type74: {
    family: 'type74-leopard-generation-cast',
    planStations: 18,
    width: [2.24, 2.32],
    depth: [3.50, 3.60],
    shellHeightM: 0.48,
  },
};

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);

  const hull = tank.root.getObjectByName('hull');
  const turret = tank.root.getObjectByName('turret');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunMount = tank.root.getObjectByName('gunMount');
  assert.ok(hull && turret && turretRig && gunMount, `${id}: articulated armor and mantlet remain complete`);

  assert.deepEqual(turretRig.userData.japaneseCastTurretReceipt, {
    family: expected.family,
    planStations: expected.planStations,
    verticalRings: 5,
    cheekBreaksPerSide: 4,
    flatCrown: true,
    circularLathe: false,
    creaseAngleDeg: 40,
    heightScale: 0.5,
    shellHeightM: expected.shellHeightM,
    roofEquipment: { cupolas: 2, machineGuns: 1, markerLights: 2, opticHeads: 1 },
  }, `${id}: publishes the shared polygonal-cast turret construction receipt`);

  const hullBounds = new THREE.Box3().setFromObject(hull);
  const turretBounds = new THREE.Box3().setFromObject(turret);
  const mountBounds = new THREE.Box3().setFromObject(gunMount);
  const turretSize = turretBounds.getSize(new THREE.Vector3());
  assert.ok(turretSize.x >= expected.width[0] && turretSize.x <= expected.width[1],
    `${id}: clipped cheek envelope stays deliberate (${turretSize.x.toFixed(3)} m)`);
  assert.ok(turretSize.z >= expected.depth[0] && turretSize.z <= expected.depth[1],
    `${id}: tapered cast rear shoulder stays deliberate (${turretSize.z.toFixed(3)} m)`);
  assert.ok(turretBounds.min.y <= hullBounds.max.y,
    `${id}: tucked bearing overlaps the hull deck instead of floating`);
  assert.ok(mountBounds.min.z < turretBounds.max.z && mountBounds.max.z > turretBounds.max.z,
    `${id}: mantlet stays buried in the polygonal fore-cheeks while projecting forward`);

  const normal = turret.geometry.getAttribute('normal');
  assert.ok(normal?.count > 0, `${id}: cast shell retains generated surface normals`);
  const obliqueNormals = new Set();
  for (let index = 0; index < normal.count; index++) {
    const x = normal.getX(index);
    const y = normal.getY(index);
    const z = normal.getZ(index);
    if (Math.abs(x) < 0.12 || Math.abs(y) < 0.08 || Math.abs(z) < 0.08) continue;
    obliqueNormals.add(`${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`);
  }
  assert.ok(obliqueNormals.size >= 16,
    `${id}: mixed rounded transitions and polygonal armor planes survive geometry merging`);

  tank.dispose();
}

console.log('japaneseCastTurrets.selftest: STB-1 and Type 74 use seated Leopard-generation polygonal cast shells');
