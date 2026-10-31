import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

// Release 240: the Leopards hold published ring receipts, so the turret seat (turretSeatRace.ts) stands their undersides
// (the lower pans with them) on one plane, the seam over the deck round the ring, closed inside the rim by the turret's
// collar; their closure is that seated underside, not a pan buried in the deck.
// 264 (the 2A4-family rebuild, profiles/leopard2A4Family.ts): one 2A4 turret on the release hull, its underside seated
// 2 mm under the ring's plane ahead (the deck at +0.014); behind, its floor rises over the bustle (the 2A6 X's measured
// floor) to 0.177, the seat's collar closing the side void inboard of it. A sample's own band (x, z, [minY, maxY]) stands
// for its case's there.
const BUSTLE_FLOOR_Y = [0.169, 0.185];
const CASES = [
  { id: 'leo2a4', y: [-0.010, 0.006], samples: [[0.92, 0.38], [-0.92, 0.38], [0.92, -0.72, BUSTLE_FLOOR_Y], [-0.92, -0.72, BUSTLE_FLOOR_Y]] },
  { id: 'leo2a4_otco', y: [-0.010, 0.006], samples: [[0.92, 0.38], [-0.92, 0.38], [0.92, -0.72, BUSTLE_FLOOR_Y], [-0.92, -0.72, BUSTLE_FLOOR_Y]] },
  { id: 'leo2a4m_can', y: [-0.010, 0.006], samples: [[0.82, 0.48], [-0.82, 0.48], [0.82, -0.72, BUSTLE_FLOOR_Y], [-0.82, -0.72, BUSTLE_FLOOR_Y]] },
  // 252: the Bradleys hold ring receipts since the 248 refresh: their pans are seated too, on the deck's plane + 3 cm and
  // the swept deck's rise (0.054, the M3A3's rear 0.070), no longer buried 6 cm in the deck
  { id: 'm2a2_bradley', y: [0.050, 0.075], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
  { id: 'm3a3_bradley', y: [0.050, 0.075], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
  { id: 'ua_m2a3_bradley', y: [0.050, 0.075], samples: [[0.62, 0.26], [-0.62, 0.26], [0.58, -0.58], [-0.58, -0.58]] },
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
      for (const [x, z, [lowY, highY] = [minY, maxY]] of samples) {
        const origin = new THREE.Vector3(x, -0.30, z).applyMatrix4(turretRig.matrixWorld);
        const direction = new THREE.Vector3(0, 1, 0).transformDirection(turretRig.matrixWorld);
        const hit = new THREE.Raycaster(origin, direction, 0, 0.60)
          .intersectObject(turret, false)[0];
        assert.ok(hit, `${id} closes the turret underside at (${x}, ${z}) through yaw ${yaw}`);
        const localHit = turretRig.worldToLocal(hit.point.clone());
        assert.ok(localHit.y >= lowY && localHit.y <= highY,
          `${id} closure is the seated underside (or the deck-overlapping lower armor pan) at (${x}, ${z}): ${localHit.y}`);
      }
    }
  } finally {
    visual.dispose();
  }
}

console.log('turretSeatClosure.selftest: six vehicle side-void closures pass through yaw');
