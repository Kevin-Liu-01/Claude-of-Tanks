import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

for (const quality of ['high', 'low']) {
  const tank = createTank('t90a_vladimir_x', null, { proceduralOnly: true, geometryReceipt: true, quality });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('hull');
    const guards = tank.root.userData.mudguardFenderSeats.filter(s => s.label.includes('vladimir-x-rear'));
    assert.equal(guards.length, 4);
    assert.ok(guards.every(s => s.supported), `${quality}: every rear roof/return is structurally attached`);
    for (const side of [-1, 1]) {
      for (const [z, y] of [[-3.3, 1.248671], [-3.5, 1.224080], [-3.58, 1.216352]]) {
        const hits = new THREE.Raycaster(new THREE.Vector3(side*1.43, 2, z), new THREE.Vector3(0, -1, 0))
          .intersectObject(hull);
        assert.ok(Math.abs(hits[0]?.point.y-y) < .003, `${quality}: independent source rear crown ${z}`);
      }
      const obsolete = new THREE.Raycaster(new THREE.Vector3(side*1.43, .96, -3.7), new THREE.Vector3(0, 0, 1), 0, .22)
        .intersectObject(hull);
      assert.equal(obsolete.length, 0, `${quality}: removed low floating rear flap does not fill real air`);
    }
  } finally { tank.dispose(); }
}
console.log('t90VXRearGuards: supported folded rear crowns, source heights and recovery-log clearance pass high/low');
