import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const ids = ['leo2a4', 'leo2a4_otco'];
const EPS = 1e-9;

for (const id of ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    tank.root.updateMatrixWorld(true);
    const gunRig = tank.root.getObjectByName('rig_gun');
    const receipt = gunRig?.userData.leopard2A4GunSeatReceipt;
    assert.ok(gunRig && receipt, `${id}: raised A4 gun-seat receipt exists`);
    assert.equal(receipt.architecture, 'prototype-height-complete-gun-rig',
      `${id}: uses the prototype-height complete gun assembly`);
    assert.ok(Math.abs(gunRig.position.y - receipt.localY) <= EPS,
      `${id}: gun rig owns the complete 90 mm lift`);
    assert.equal(receipt.liftY, 0.09, `${id}: gun and housing are raised 90 mm`);
    assert.ok(Math.abs(receipt.mantletBottomY - receipt.chinTopY) <= EPS,
      `${id}: raised mantlet remains seated on the chin`);
    assert.ok(receipt.mantletTopY > receipt.browBottomY,
      `${id}: raised mantlet remains captured behind the brow`);
    assert.equal(receipt.inheritedByOtco, true,
      `${id}: OTCO inherits the same complete gun rig`);

    const worldSeat = gunRig.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(worldSeat.y - receipt.worldY) <= EPS,
      `${id}: world bore axis matches the Leopard prototype height`);
    assert.equal(gunRig.children.length, 6,
      `${id}: mantlet, tube, sleeve and muzzle remain one recoil assembly`);
  } finally {
    tank.dispose();
  }
}

console.log('Leopard 2A4/OTCO raised gun-seat self-test passed.');
