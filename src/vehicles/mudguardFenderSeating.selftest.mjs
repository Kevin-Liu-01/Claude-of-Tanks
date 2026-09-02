import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';

let coveredVehicles = 0;
let registeredParts = 0;
let t72buGear = null;
const proryvGuards = new Map();

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
    const hullRig = visual.root.children.find((child) => child.name === 'rig_hull');
    for (const guard of hullRig?.userData.sharedMudguards || []) {
      const expectedBucket = guard.material === 'painted-steel' ? 'hull'
        : guard.material === 'wood-stained' ? 'hullWood' : 'hullRubber';
      assert.equal(guard.bucket, expectedBucket,
        `${id}/${guard.label}: mudguard material uses its textured family bucket`);
    }

    if (id === 't72bu') {
      assert(hullRig, 't72bu: hull articulation rig');
      [t72buGear] = hullRig.userData.runningGearReceipts || [];
    }
    if (id === 't90m' || id === 't90m_proryv') {
      proryvGuards.set(id, (hullRig?.userData.sharedMudguards || [])
        .filter((receipt) => receipt.label.startsWith('t90m-proryv-')));
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

for (const id of ['t90m', 't90m_proryv']) {
  const guards = proryvGuards.get(id) || [];
  assert.equal(guards.length, 4, `${id}: four terminal Proryv mudguards are registered`);
  assert.ok(guards.every((guard) => guard.material === 'painted-steel' && guard.bucket === 'hull'),
    `${id}: mudguards use textured camouflage, never generic gray fitting paint`);
  assert.ok(guards.filter((guard) => guard.label.includes('front')).every((guard) => guard.y <= 0.81),
    `${id}: front mudguards are lowered to the skirt/fender line`);
  assert.ok(guards.filter((guard) => guard.label.includes('rear')).every((guard) => guard.y <= 0.78),
    `${id}: rear mudguards are lowered to the skirt/fender line`);
}

console.log(`mudguardFenderSeating.selftest: ${ALL_TANK_IDS.length} tanks, `
  + `${coveredVehicles} with ${registeredParts} registered guard parts`);
