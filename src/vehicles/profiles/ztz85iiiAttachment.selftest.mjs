import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const near = (value, target, epsilon = 1e-6) => Math.abs(value - target) <= epsilon;

const tank = createTank('ztz85_iii', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  assert.ok(hullRig && turretRig && gunRig, 'ZTZ-85-III retains articulated hull, turret and gun rigs');

  const receipt = turretRig.userData.ztz85iiiAttachmentReceipt;
  assert.ok(receipt, 'ZTZ-85-III exposes its turret attachment receipt');
  assert.ok(near(receipt.shellLengthM, 4.55), 'welded turret body spans 4.55 metres');
  assert.ok(receipt.lengthRatio >= 1.99 && receipt.lengthRatio <= 2.01,
    `turret body is twice its former length (${receipt.lengthRatio.toFixed(3)}x)`);
  assert.ok(receipt.gunMountOverlapM >= 0.45,
    `gun saddle enters the turret nose by at least 450 mm (${receipt.gunMountOverlapM.toFixed(3)} m)`);
  assert.ok(receipt.bustleRackFloorY - receipt.bustleCrownY <= 0.17,
    'bustle rack floors remain within their planted support height');
  assert.ok(receipt.rearBasketZ < receipt.shellRearZ,
    'rear basket closes immediately behind the extended turret shell');

  const racks = receipt.bustleRackNames.map((name) => turretRig.getObjectByName(name));
  assert.ok(racks.every(Boolean), 'both named bustle rack assemblies are present');
  for (const rack of racks) {
    assert.equal(rack.parent, turretRig, `${rack.name} is directly turret-owned`);
    assert.equal(hullRig.getObjectByName(rack.name), undefined,
      `${rack.name} no longer remains stranded on the hull`);
  }

  tank.root.updateMatrixWorld(true);
  const turretShell = turretRig.getObjectByName('turret');
  const gunMount = gunRig.getObjectByName('gunMount');
  assert.ok(turretShell && gunMount, 'welded shell and gun saddle meshes are present');
  const shellBounds = new THREE.Box3().setFromObject(turretShell);
  const gunMountBounds = new THREE.Box3().setFromObject(gunMount);
  assert.ok(shellBounds.intersectsBox(gunMountBounds),
    'gun saddle physically overlaps the welded turret nose');

  const rackLocalPositions = racks.map((rack) => rack.position.clone());
  turretRig.rotation.y = Math.PI / 2;
  tank.root.updateMatrixWorld(true);
  for (let i = 0; i < racks.length; i++) {
    assert.ok(racks[i].position.equals(rackLocalPositions[i]),
      `${racks[i].name} keeps its turret-local seat through yaw`);
  }
} finally {
  tank.dispose();
}

console.log('ztz85iiiAttachment.selftest: doubled welded turret, planted twin bustle racks and recessed gun verified');
