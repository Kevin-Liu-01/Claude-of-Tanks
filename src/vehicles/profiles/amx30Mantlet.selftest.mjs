import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const ids = ['amx30', 'amx30b2'];
const v = new THREE.Vector3();

for (const id of ids) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const gunRig = tank.root.getObjectByName('rig_gun');
  const recoilRig = tank.root.getObjectByName('rig_recoil');
  const mount = gunRig?.getObjectByName('gunMount');
  assert.ok(gunRig && recoilRig && mount?.geometry,
    `${id}: articulated gun and gun-owned mantlet geometry exist`);
  assert.equal(mount.parent, gunRig,
    `${id}: mantlet pitches with the gun instead of recoiling with the tube`);

  const position = mount.geometry.getAttribute('position');
  let leftShield = 0;
  let rightShield = 0;
  let buriedRear = 0;
  let proudFront = 0;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    if (Math.abs(v.y - 0.02) < 0.34 && v.z > -0.12 && v.z < 0.56) {
      if (v.x < -0.38 && v.x > -0.45) leftShield++;
      if (v.x > 0.38 && v.x < 0.45) rightShield++;
      if (v.z < 0) buriedRear++;
      if (v.z > 0.50) proudFront++;
    }
  }
  assert.ok(leftShield >= 12 && rightShield >= 12,
    `${id}: broad cast shield spans both trunnion shoulders`);
  assert.ok(buriedRear > 0 && proudFront > 0,
    `${id}: mantlet overlaps the turret nose and closes around the gun collar`);

  tank.dispose();
}

console.log('amx30Mantlet.selftest: both AMX-30 mantlets are broad, sealed, and gun-owned');
