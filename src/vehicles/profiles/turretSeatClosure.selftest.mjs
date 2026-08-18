import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

const CASES = [
  { id: 'leo2a6', y: [-0.125, -0.105], samples: [[0.92, 0.38], [-0.92, 0.38], [0.92, -0.72], [-0.92, -0.72]] },
  { id: 'leo2a6m', y: [-0.155, -0.135], samples: [[0.92, 0.38], [-0.92, 0.38], [0.92, -0.72], [-0.92, -0.72]] },
  { id: 'leo2a4m', y: [-0.130, -0.065], samples: [[0.82, 0.48], [-0.82, 0.48], [0.82, -0.72], [-0.82, -0.72]] },
  { id: 'm2a2_bradley', y: [-0.075, -0.055], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
  { id: 'm3a3_bradley', y: [-0.075, -0.055], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
  { id: 'ua_m2a3_bradley', y: [-0.075, -0.055], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
];

for (const { id, y: [minY, maxY], samples } of CASES) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const turretRig = visual.root.getObjectByName('rig_turret');
    const turret = turretRig?.getObjectByName('turret');
    assert.ok(turretRig && turret?.isMesh, `${id} keeps structural turret geometry under rig_turret`);

    for (const yaw of [0, Math.PI / 2]) {
      turretRig.rotation.y = yaw;
      visual.root.updateMatrixWorld(true);
      for (const [x, z] of samples) {
        const origin = new THREE.Vector3(x, -0.30, z).applyMatrix4(turretRig.matrixWorld);
        const direction = new THREE.Vector3(0, 1, 0).transformDirection(turretRig.matrixWorld);
        const hit = new THREE.Raycaster(origin, direction, 0, 0.60)
          .intersectObject(turret, false)[0];
        assert.ok(hit, `${id} closes the turret underside at (${x}, ${z}) through yaw ${yaw}`);
        const localHit = turretRig.worldToLocal(hit.point.clone());
        assert.ok(localHit.y >= minY && localHit.y <= maxY,
          `${id} closure is the deck-overlapping lower armor pan at (${x}, ${z}): ${localHit.y}`);
      }
    }
  } finally {
    visual.dispose();
  }
}

console.log('turretSeatClosure.selftest: six vehicle side-void closures pass through yaw');
