import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const IDS = [
  'm2a2_bradley',
  'ua_m2a3_bradley',
  'm3a3_bradley',
  'marder1a3',
];
const BRADLEY_IDS = new Set(['m2a2_bradley', 'ua_m2a3_bradley', 'm3a3_bradley']);
const A2_TURRET_IDS = new Set(['m2a2_bradley', 'ua_m2a3_bradley']);

const near = (a, b, tolerance = 1e-4) => Math.abs(a - b) <= tolerance;

for (const id of IDS) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const hull = hullRig?.getObjectByName('hull');
    const receipt = hullRig?.userData.bradleyUpperHullClosureReceipt;
    const bowReceipt = hullRig?.userData.bradleyGlacisClosureReceipt;
    const gear = hullRig?.userData.runningGearReceipts?.[0];
    assert.ok(hullRig && hull && receipt && gear,
      `${id}: shared Bradley hull exposes closure and running-gear receipts`);
    assert.equal(receipt.revision, 'continuous-upper-hull-volume-r1',
      `${id}: uses the continuous shared upper-hull closure`);
    assert.equal(receipt.flankWedges.count, 2,
      `${id}: closes both vehicle-length flank cavities`);
    assert.ok(receipt.centralCore.floorY < receipt.tubRoofY
      && receipt.centralCore.roofY > receipt.upperHullFloorY,
    `${id}: center core overlaps both tub roof and upper-hull floor`);
    assert.ok(receipt.upperGlacisBacker.rearZ < receipt.centralCore.frontZ
      && receipt.upperGlacisBacker.frontZ > receipt.centralCore.frontZ,
    `${id}: sloped front backer overlaps the longitudinal core`);
    assert.ok(receipt.upperGlacisBacker.frontRoofY < receipt.upperGlacisBacker.rearRoofY,
      `${id}: front backer follows the descending upper-glacis underside`);
    assert.ok(receipt.upperGlacisOverlapM > 0,
      `${id}: upper-glacis backer terminates inside the armor skin`);

    const trackLaneInnerX = gear.xcLeft - gear.trackW / 2;
    const highestShoeY = Math.max(...gear.loopPoints.map(([, y]) => y)) + gear.trackTh / 2;
    assert.ok(receipt.centralCore.halfWidthM < trackLaneInnerX
      && receipt.flankWedges.wideFloorHalfWidthM < trackLaneInnerX,
    `${id}: closure floor remains inboard of both animated track lanes`);
    assert.ok(receipt.flankWedges.wideFloorY > highestShoeY + 0.04,
      `${id}: flank expansion begins above the animated shoe crown`);

    const positions = hull.geometry.getAttribute('position');
    const hasVertex = ([x, y, z], tolerance = 1e-4) => {
      for (let i = 0; i < positions.count; i++) {
        if (near(positions.getX(i), x, tolerance) && near(positions.getY(i), y, tolerance)
          && near(positions.getZ(i), z, tolerance)) return true;
      }
      return false;
    };
    assert.ok(hasVertex([
      receipt.centralCore.halfWidthM,
      receipt.centralCore.floorY,
      receipt.centralCore.frontZ,
    ], 0.025) && hasVertex([
      -receipt.centralCore.halfWidthM,
      receipt.centralCore.floorY,
      receipt.centralCore.rearZ,
    ], 0.025),
      `${id}: merged hull contains the central closure core`);
    assert.ok(hasVertex([1.39, 1.61, 1.65]) && hasVertex([-1.375, 1.61, 1.65]),
      `${id}: merged hull contains both buried flank wedges`);
    assert.ok(hasVertex([1.40, 1.50, 2.39]) && hasVertex([-1.18, 1.88, 1.62]),
      `${id}: merged hull contains the sloped upper-glacis backer`);

    if (BRADLEY_IDS.has(id)) {
      assert.equal(bowReceipt?.revision, 'tub-to-bow-overlap-r1',
        `${id}: carries the Bradley-only lower-glacis closure`);
      assert.ok(bowReceipt.rearOverlapM > 0 && bowReceipt.frontOverlapM > 0,
        `${id}: bow closure overlaps both marked hull faces`);
      assert.ok(bowReceipt.rearRoofY >= receipt.upperGlacisBacker.floorY,
        `${id}: bow closure rises into the shared upper-glacis backer`);
      assert.ok(hasVertex([
        bowReceipt.rearHalfWidthM,
        bowReceipt.rearRoofY,
        bowReceipt.rearZ,
      ]) && hasVertex([
        -bowReceipt.frontHalfWidthM,
        bowReceipt.frontRoofY,
        bowReceipt.frontZ,
      ]),
      `${id}: merged hull contains the tapered tub-to-bow solid`);
    } else {
      assert.equal(bowReceipt, undefined,
        `${id}: Marder donor remains outside the Bradley-only bow treatment`);
    }

    const turretRig = tank.root.getObjectByName('rig_turret');
    const turretReceipt = turretRig?.userData.bradleyA2TurretClosureReceipt;
    if (A2_TURRET_IDS.has(id)) {
      assert.equal(turretReceipt?.revision, 'roof-risers-and-side-interfaces-r1',
        `${id}: retains the A2 roof and side-interface closure`);
      assert.ok(near(turretReceipt.roofRisers.bottomY, turretReceipt.roofY),
        `${id}: both right roof risers land on the turret roof`);
      assert.ok(turretReceipt.rightBinBridge.x + turretReceipt.rightBinBridge.w / 2 > 0.80
        && turretReceipt.rightBinBridge.x - turretReceipt.rightBinBridge.w / 2 < 0.74,
      `${id}: right bridge overlaps both the turret wall and stowage bin`);
      assert.ok(turretReceipt.leftTowBridge.x - turretReceipt.leftTowBridge.w / 2 < -0.785
        && turretReceipt.leftTowBridge.x + turretReceipt.leftTowBridge.w / 2 > -0.74,
      `${id}: left bridge overlaps both the turret wall and TOW interface`);
    } else {
      assert.equal(turretReceipt, undefined,
        `${id}: replacement turret does not retain a stale A2 closure receipt`);
    }

    const uaRoofReceipt = turretRig?.userData.uaBradleyRoofSeatingReceipt;
    if (id === 'ua_m2a3_bradley') {
      assert.equal(uaRoofReceipt?.revision, 'cupola-and-isu-plinth-r1',
        `${id}: carries the Ukrainian roof seating receipt`);
      assert.ok(near(uaRoofReceipt.machineGunPedestal.bottomY, uaRoofReceipt.roofY)
        && near(uaRoofReceipt.isuPlinth.bottomY, uaRoofReceipt.roofY),
      `${id}: machine-gun pedestal and ISU plinth both land on the roof`);
    } else {
      assert.equal(uaRoofReceipt, undefined,
        `${id}: does not claim Ukrainian roof equipment`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('bradleyHullClosure.selftest: Bradley roof, side, bow and shared donor closures are connected');
