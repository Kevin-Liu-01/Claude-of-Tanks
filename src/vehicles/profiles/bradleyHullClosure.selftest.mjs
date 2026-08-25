import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const IDS = [
  'm2a2_bradley',
  'ua_m2a3_bradley',
  'm3a3_bradley',
  'marder1a3',
];

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
    assert.ok(hasVertex([0.94, 1.03, 1.62], 0.025)
      && hasVertex([-0.94, 1.03, -3.20], 0.025),
      `${id}: merged hull contains the central closure core`);
    assert.ok(hasVertex([1.39, 1.61, 1.65]) && hasVertex([-1.375, 1.61, 1.65]),
      `${id}: merged hull contains both buried flank wedges`);
    assert.ok(hasVertex([1.40, 1.50, 2.39]) && hasVertex([-1.18, 1.88, 1.62]),
      `${id}: merged hull contains the sloped upper-glacis backer`);
  } finally {
    tank.dispose();
  }
}

console.log('bradleyHullClosure.selftest: all Bradley variants and Marder carry the continuous track-safe hull closure');
