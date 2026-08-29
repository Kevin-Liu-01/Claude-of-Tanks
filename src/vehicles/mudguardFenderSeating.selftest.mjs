import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';

let coveredVehicles = 0;
let registeredParts = 0;
let t72buGear = null;

for (const id of ALL_TANK_IDS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  try {
    const seats = visual.root.userData.mudguardFenderSeats || [];
    if (seats.length) coveredVehicles++;
    registeredParts += seats.length;
    for (const seat of seats) {
      assert.equal(seat.supported, true,
        `${id}/${seat.label}: mudguard must meet fixed hull/fender structure `
        + `(gap ${seat.directGapM} m, axis ${seat.directAxisGapM})`);
    }

    if (id === 't72bu') {
      const hullRig = visual.root.children.find((child) => child.name === 'rig_hull');
      assert(hullRig, 't72bu: hull articulation rig');
      [t72buGear] = hullRig.userData.runningGearReceipts || [];
    }
  } finally {
    visual.dispose();
  }
}

assert(coveredVehicles >= 25,
  `fleet mudguard receipt coverage regressed (${coveredVehicles} vehicles)`);
assert(registeredParts >= 104,
  `fleet mudguard receipt coverage regressed (${registeredParts} parts)`);

assert(t72buGear, 't72bu: running-gear receipt');
assert.equal(t72buGear.wheelZs.length, 6, 't72bu: six native road-wheel stations');
const frontRoadWheelZ = Math.max(...t72buGear.wheelZs);
const rearRoadWheelZ = Math.min(...t72buGear.wheelZs);
const frontTerminalGap = t72buGear.idler.z - frontRoadWheelZ
  - t72buGear.idler.r - t72buGear.wheelR;
const rearTerminalGap = rearRoadWheelZ - t72buGear.sprocket.z
  - t72buGear.sprocket.r - t72buGear.wheelR;
assert(Math.abs(frontTerminalGap - 0.09) < 1e-6,
  `t72bu: forward idler clears lead road wheel by 9 cm (${frontTerminalGap})`);
assert(Math.abs(rearTerminalGap - 0.06) < 1e-6,
  `t72bu: aft sprocket clears rear road wheel by 6 cm (${rearTerminalGap})`);

console.log(`mudguardFenderSeating.selftest: ${ALL_TANK_IDS.length} tanks, `
  + `${coveredVehicles} with ${registeredParts} registered guard parts`);
