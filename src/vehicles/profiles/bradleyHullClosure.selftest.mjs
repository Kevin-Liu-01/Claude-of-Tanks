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
    const apronReceipt = hullRig?.userData.bradleySkirtApronReceipt;
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
    assert.ok(near(receipt.upperGlacisBacker.angleRad,
      Math.atan2(receipt.upperGlacisBacker.riseM, receipt.upperGlacisBacker.runM)),
    `${id}: publishes the shared upper-glacis angle from its authored endpoints`);
    assert.ok(receipt.upperGlacisBacker.tangentRearward.y > 0
      && receipt.upperGlacisBacker.tangentRearward.z < 0
      && receipt.upperGlacisBacker.normalOutward.y > 0
      && receipt.upperGlacisBacker.normalOutward.z > 0,
    `${id}: upper-glacis tangent and outward normal use the Bradley hull frame`);
    assert.ok(near(receipt.upperGlacisBacker.outerSurface.angleRad, Math.atan(0.5))
      && near(receipt.upperGlacisBacker.outerSurface.referenceCenter.y, 1.715)
      && near(receipt.upperGlacisBacker.outerSurface.referenceCenter.z, 2.02),
    `${id}: publishes the exact shared outer-glacis plane used by fitted armor`);
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
      assert.equal(apronReceipt?.revision, 'continuous-left-front-glacis-shoulder-r1',
        `${id}: carries the continuous left-front skirt-to-glacis shoulder`);
      assert.ok(apronReceipt.leftFront.rearZ <= 1.55
        && apronReceipt.leftFront.frontZ >= 3.11
        && apronReceipt.leftFront.bowOverlapM > 0,
      `${id}: left-front mounting apron reaches and overlaps the bow closure`);
      assert.ok(apronReceipt.leftFront.lowestY > highestShoeY + 0.04,
        `${id}: left-front shoulder closure remains above the animated track crown`);
      assert.ok(hasVertex([
        apronReceipt.leftFront.innerX,
        1.565,
        apronReceipt.leftFront.frontZ,
      ]) && hasVertex([
        apronReceipt.leftFront.outerX,
        apronReceipt.leftFront.lowestY,
        apronReceipt.leftFront.rearZ,
      ]), `${id}: merged hull contains the full left-front raked apron`);
    } else {
      assert.equal(bowReceipt, undefined,
        `${id}: Marder donor remains outside the Bradley-only bow treatment`);
      assert.equal(apronReceipt, undefined,
        `${id}: Marder donor remains outside the Bradley skirt-apron treatment`);
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

    const glacisArmor = hullRig?.userData.bradleyUpperGlacisArmorReceipt;
    if (id === 'm3a3_bradley') {
      assert.equal(glacisArmor?.revision, 'flush-glacis-carrier-and-era-r1',
        `${id}: carries the corrected upper-glacis armor seating receipt`);
      assert.ok(near(glacisArmor.carrier.rotationXRad, glacisArmor.angleRad),
        `${id}: carrier long axis follows the upper-glacis tangent`);
      assert.ok(near(glacisArmor.angleRad,
        receipt.upperGlacisBacker.outerSurface.angleRad),
      `${id}: reactive package and donor hull share one exact glacis plane`);
      assert.ok(near(glacisArmor.cassettes.rotationXRad,
        glacisArmor.angleRad - Math.PI / 2),
      `${id}: cassette depth axes follow the upper-glacis outward normal`);
      assert.equal(glacisArmor.cassettes.count, 12,
        `${id}: retains both mirrored three-by-two glacis ERA fields`);
      assert.ok(near(
        glacisArmor.cassettes.centerOffsetM - glacisArmor.cassettes.depthM / 2,
        glacisArmor.carrier.centerOffsetM + glacisArmor.carrier.thicknessM / 2
          - glacisArmor.cassettes.seatOverlapM,
      ), `${id}: ERA cassette backs overlap the carrier instead of floating or sinking`);
      for (const center of glacisArmor.cassettes.centers) {
        const dy = center.y - glacisArmor.surfaceCenter.y;
        const dz = center.z - glacisArmor.surfaceCenter.z;
        const normalOffset = dy * glacisArmor.normalOutward.y
          + dz * glacisArmor.normalOutward.z;
        assert.ok(near(normalOffset, glacisArmor.cassettes.centerOffsetM),
          `${id}: every ERA cassette center stays on the shared offset plane`);
      }
    } else {
      assert.equal(glacisArmor, undefined,
        `${id}: does not claim the M3A3 reactive upper-glacis package`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('bradleyHullClosure.selftest: Bradley roof, side, bow and shared donor closures are connected');
