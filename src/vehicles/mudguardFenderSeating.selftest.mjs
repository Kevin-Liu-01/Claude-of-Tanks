import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { FLEET_RENEWAL_DONORS } from './fleetRenewalSpecs.ts';

let coveredVehicles = 0;
let registeredParts = 0;
let t72buGear = null;
let t72buXGear = null;
const proryvGuards = new Map();
const shoulderReceipts = new Map();

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
    if (id === 't72bu_x') [t72buXGear] = hullRig?.userData.runningGearReceipts || [];
    if (id === 't90m' || id === 't90m_proryv') {
      proryvGuards.set(id, (hullRig?.userData.sharedMudguards || [])
        .filter((receipt) => receipt.label.startsWith('t90m-proryv-')));
    }
    if (hullRig?.userData.chieftainShoulderMudguardReceipt) {
      shoulderReceipts.set(id, hullRig.userData.chieftainShoulderMudguardReceipt);
    } else if (hullRig?.userData.t90MSFrontMudguardReceipt) {
      shoulderReceipts.set(id, hullRig.userData.t90MSFrontMudguardReceipt);
    } else if (hullRig?.userData.leopardShoulderMudguardReceipt) {
      shoulderReceipts.set(id, hullRig.userData.leopardShoulderMudguardReceipt);
    } else if (hullRig?.userData.kf51ShoulderMudguardReceipt) {
      shoulderReceipts.set(id, hullRig.userData.kf51ShoulderMudguardReceipt);
    }
  } finally {
    visual.dispose();
  }
}

assert(coveredVehicles >= 25,
  `fleet mudguard receipt coverage regressed (${coveredVehicles} vehicles)`);
assert(registeredParts >= 104,
  `fleet mudguard receipt coverage regressed (${registeredParts} parts)`);

// 2026-10-01: the owner's September renewal (4c34b3e8b, docs/tank-generation/fleet-renewal-publication-20260930.md)
// rebuilt the T-72BU 1989 on the t72bu_x foundation, so its running gear is the source-measured t72bu_x course. The
// separately authored 2026-08-18 gear (354e8fa97) and its exact 9 cm / 6 cm z-only gaps are gone. A z-only gap
// ignores the raised idler (0.28 m above the axle line): the source idler reads -0.0099 m in z but stands 0.0516 m
// clear of the lead wheel circle to circle. Protect the donor law and the T-72 family's side-plane clearance law
// (pt91mPendekarFidelity, t72JaguarRedesign: centre distance minus both radii above 2 cm).
assert.equal(FLEET_RENEWAL_DONORS.t72bu, 't72bu_x', 't72bu: the renewal builds the T-72BU 1989 on t72bu_x');
assert(t72buGear, 't72bu: running-gear receipt');
assert(t72buXGear, 't72bu_x: running-gear receipt');
for (const key of ['wheelZs', 'wheelY', 'wheelR', 'idler', 'sprocket']) {
  assert.deepEqual(t72buGear[key], t72buXGear[key], `t72bu: ${key} is the t72bu_x donor's`);
}
assert.equal(t72buGear.wheelZs.length, 6, 't72bu: six native road-wheel stations');
const frontRoadWheelZ = Math.max(...t72buGear.wheelZs);
const rearRoadWheelZ = Math.min(...t72buGear.wheelZs);
const terminalClearance = (end, z) => Math.hypot(end.z - z, end.y - t72buGear.wheelY) - (end.r + t72buGear.wheelR);
const frontTerminalGap = terminalClearance(t72buGear.idler, frontRoadWheelZ);
const rearTerminalGap = terminalClearance(t72buGear.sprocket, rearRoadWheelZ);
assert(frontTerminalGap > 0.02,
  `t72bu: forward idler clears lead road wheel in the side plane (${frontTerminalGap})`);
assert(rearTerminalGap > 0.02,
  `t72bu: aft sprocket clears rear road wheel in the side plane (${rearTerminalGap})`);

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

const expectedClosedShoulders = [
  'chieftain5', 'chieftain_mk10', 't90ms',
  'kf51', 'kf51b',
  'leo2a4', 'leo2a4_otco',
  'leo2a6', 'leo2a6m', 'leo2a6_ua',
];
for (const id of expectedClosedShoulders) {
  const receipt = shoulderReceipts.get(id);
  assert(receipt, `${id}: closed shoulder/mudguard receipt`);
  assert.equal(receipt.closedSideVolume, true,
    `${id}: shoulder must be a closed side volume rather than a thin shelf`);
  assert.equal(receipt.sides, 2, `${id}: shoulder closure must be mirrored`);
  assert.ok(receipt.partsPerSide >= 2,
    `${id}: shoulder closure needs a load-bearing flange and terminal guard`);
  assert.equal(receipt.labels.length, receipt.sides * receipt.partsPerSide,
    `${id}: every structural shoulder/mudguard part is registered`);
}

for (const id of ['chieftain5', 'chieftain_mk10']) {
  const receipt = shoulderReceipts.get(id);
  assert.equal(receipt.steppedShelvesVisibleFromSide, false,
    `${id}: bow shoulder may not read as exposed stair steps`);
  assert.ok(receipt.trackClearanceM >= 0.009,
    `${id}: outer web remains beyond the moving shoe plane`);
}

{
  const receipt = shoulderReceipts.get('t90ms');
  assert.equal(receipt.steppedShelves, false,
    't90ms: replace thin craft stairs with a continuous rake');
  assert.equal(receipt.architecture, 'continuous-sloped-shoulder-and-closed-outer-shell');
  assert.ok(receipt.shellRearTopY > receipt.shellFrontTopY,
    't90ms: terminal guard follows a decisive forward/downward slope');
}

for (const id of ['leo2a4', 'leo2a4_otco', 'leo2a6', 'leo2a6m', 'leo2a6_ua']) {
  const receipt = shoulderReceipts.get(id);
  assert.equal(receipt.shoulderMergedIntoGlacis, true,
    `${id}: shoulder flange must merge into the glacis`);
  assert.ok(receipt.terminalTrackClearanceM >= 0.012,
    `${id}: terminal web remains beyond the animated shoe plane`);
}

for (const id of ['kf51', 'kf51b']) {
  const receipt = shoulderReceipts.get(id);
  assert.equal(receipt.shoulderMergedIntoGlacis, true,
    `${id}: Panther shoulder must merge into the glacis`);
  assert.ok(receipt.trackClearanceM >= 0.05,
    `${id}: deep terminal web remains outside the track course`);
}

console.log(`mudguardFenderSeating.selftest: ${ALL_TANK_IDS.length} tanks, `
  + `${coveredVehicles} with ${registeredParts} registered guard parts`);
