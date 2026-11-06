import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

// 268 (the owner: "the m1a1s and bradleys look odd. here are the actual models, runn our tank generation procedures on
// them"): the four Bradleys share one hull core measured from the owner's supplied model (modern3.ts BRADLEY_HULL,
// bradleyHullCoreReceipt), the source's side armour and skirt course (bradleySideArmorReceipt) and, on the M2A2 and
// the Ukrainian vehicle, the source's turret (bradleyA2TurretClosureReceipt). The Marder 1A3 keeps the pre-268 donor
// build byte for byte, so it alone still carries the donor's continuous upper-hull closure receipt.
const IDS = [
  'm2a2_bradley',
  'ua_m2a3_bradley',
  'm3a3_bradley',
  'm6_linebacker',
  'marder1a3',
];
// 2026-11-05 (269, the owner's "redesign the m3a3 bradley turret"): the M3A3's A3 turret stands on the same measured
// shell (profiles/bradleyA3Turret.ts), so it carries the shell's receipt too.
const A2_TURRET_IDS = new Set(['m2a2_bradley', 'ua_m2a3_bradley', 'm3a3_bradley']);

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
    const core = hullRig?.userData.bradleyHullCoreReceipt;
    const donor = hullRig?.userData.bradleyUpperHullClosureReceipt;
    const sideReceipt = hullRig?.userData.bradleySideArmorReceipt;
    const gear = hullRig?.userData.runningGearReceipts?.[0];
    assert.ok(hullRig && hull && gear, `${id}: hull and running-gear receipts`);
    const positions = hull.geometry.getAttribute('position');
    const hasVertex = ([x, y, z], tolerance = 1e-4) => {
      for (let i = 0; i < positions.count; i++) {
        if (near(positions.getX(i), x, tolerance) && near(positions.getY(i), y, tolerance)
          && near(positions.getZ(i), z, tolerance)) return true;
      }
      return false;
    };
    const trackLaneInnerX = gear.xcLeft - gear.trackW / 2;
    const trackLaneOuterX = gear.xcLeft + gear.trackW / 2;
    const highestShoeY = Math.max(...gear.loopPoints.map(([, y]) => y)) + gear.trackTh / 2;

    if (id === 'marder1a3') {
      assert.equal(donor?.revision, 'continuous-upper-hull-volume-r1',
        `${id}: keeps the pre-268 donor's continuous upper-hull closure`);
      assert.equal(core, undefined, `${id}: does not take the Bradleys' source-measured hull core`);
      assert.equal(sideReceipt, undefined, `${id}: Marder donor remains outside the Bradley side-armour treatment`);
    } else {
      assert.equal(donor, undefined, `${id}: the donor's closure volumes gave way to the measured core`);
      assert.equal(core?.revision, 'source-measured-core-r2', `${id}: carries the source-measured hull core`);
      assert.ok(core.tubHalfW < trackLaneInnerX,
        `${id}: the tub between the tracks stays inboard of both animated track lanes`);
      assert.ok(core.sponsonY > highestShoeY + 0.04,
        `${id}: the sponson floor stands clear over the animated shoe crown`);
      assert.ok(core.crownY > core.edgeY && core.edgeY > core.sponsonY && core.sideX > core.edgeX
        && core.edgeX > core.crownX,
      `${id}: crown over the side plates' top, the plates over the sponson, the plate inside its outer face`);
      assert.ok(core.crownY - core.gutterDrop > core.sponsonY && core.crownY - core.gutterDrop < core.edgeY,
        `${id}: the roof gutter lies under the plate top and over the sponson`);
      assert.ok(near(core.glacisAngleRad, Math.atan((core.crownY - core.glacisToeY) / (core.glacisToeZ - core.glacisTopZ))),
        `${id}: publishes the glacis angle from its own break and toe`);
      // the body stations' ring corners (left plate top, right gutter, crown) and the glacis break are in the merged hull
      assert.ok(hasVertex([core.sideX, core.edgeY, -2.80]) && hasVertex([-core.edgeX, core.crownY - core.rightGutterDrop, -2.80])
        && hasVertex([core.edgeX, core.crownY - core.gutterDrop, -2.80]) && hasVertex([core.crownX, core.crownY, core.glacisTopZ])
        && hasVertex([-core.crownX, core.glacisToeY, core.glacisToeZ]),
      `${id}: merged hull contains the measured core's stations`);

      assert.equal(sideReceipt?.revision, 'source-side-armor-r2', `${id}: carries the source's side armour`);
      assert.ok(near(sideReceipt.upperSide.faceX, core.sideX) && near(sideReceipt.upperSide.edgeY, core.edgeY),
        `${id}: the appliqué sits on the core's upper side`);
      assert.ok(sideReceipt.skirt.innerX > trackLaneOuterX + 0.04,
        `${id}: the skirt stands clear outboard of the animated track lane`);
      assert.ok(sideReceipt.skirt.ledgeInnerX < core.sideX && sideReceipt.skirt.ledgeInnerX < sideReceipt.skirt.innerX,
        `${id}: the skirt's ledge reaches into the upper side`);
      assert.ok(sideReceipt.skirt.hemY < 0.70 && sideReceipt.skirt.rearZ < -3.0 && sideReceipt.skirt.bowZ > 3.1,
        `${id}: the skirt hangs over the road-wheel tops from the stern to the bow`);
      assert.ok(sideReceipt.fenderBox.innerX < core.sideX && sideReceipt.fenderBox.topY > sideReceipt.upperSide.ledgeTop,
        `${id}: the front fender box laps the upper side above the ledge`);
    }

    const turretRig = tank.root.getObjectByName('rig_turret');
    const turretReceipt = turretRig?.userData.bradleyA2TurretClosureReceipt;
    if (A2_TURRET_IDS.has(id)) {
      // 268: the source's two-man turret (modern3.ts addBradleyTurretShell): off its ring by plusInset (the left wall
      // 0.84 from the pivot, the right 0.98), the erect TOW launcher on its left, the stowage bin on its right.
      assert.equal(turretReceipt?.revision, 'source-turret-r3', `${id}: carries the source-measured turret`);
      const plusWall = turretReceipt.shell.halfWidthM - turretReceipt.shell.plusInsetM;
      assert.ok(turretReceipt.towLauncher.x0 > plusWall + 0.02, `${id}: the TOW launcher stands off the left wall`);
      assert.ok(turretReceipt.stowageBin.innerX > -turretReceipt.shell.halfWidthM
        && turretReceipt.stowageBin.outerX < -turretReceipt.shell.halfWidthM,
      `${id}: the right stowage bin laps the turret wall`);
      const gunX = getSpec(id).armor.gunPivot[0];
      assert.ok(turretReceipt.gunBay.leftX < gunX - 0.13 && turretReceipt.gunBay.rightX > gunX + 0.13,
        `${id}: the M242 bay holds the mantlet's swept width`);
      assert.ok(near(turretRig.position.x, getSpec(id).armor.turretPivot[0]) && near(turretRig.position.y, core.crownY),
        `${id}: the ring sits on the deck at the spec's pivot`);
    } else {
      assert.equal(turretReceipt, undefined, `${id}: replacement turret does not retain a stale A2 closure receipt`);
    }

    const uaRoofReceipt = turretRig?.userData.uaBradleyRoofSeatingReceipt;
    if (id === 'ua_m2a3_bradley') {
      // 268: no roof pintle (the owner's field standard 2026-10-08); the shell's ISU is the roof's one plinth
      assert.equal(uaRoofReceipt?.revision, 'source-roof-r3', `${id}: carries the Ukrainian roof seating receipt`);
      assert.ok(uaRoofReceipt.isuPlinth.bottomY <= uaRoofReceipt.roofY && uaRoofReceipt.isuPlinth.topY > uaRoofReceipt.roofY
        && near(uaRoofReceipt.roofY, turretReceipt.roofY),
      `${id}: the ISU plinth lands on the roof`);
    } else {
      assert.equal(uaRoofReceipt, undefined, `${id}: does not claim Ukrainian roof equipment`);
    }

    const glacisArmor = hullRig?.userData.bradleyUpperGlacisArmorReceipt;
    if (id === 'm3a3_bradley') {
      assert.equal(glacisArmor?.revision, 'flush-glacis-carrier-and-era-r2',
        `${id}: carries the upper-glacis armour seating receipt`);
      assert.ok(near(glacisArmor.angleRad, core.glacisAngleRad),
        `${id}: reactive package and hull share one glacis plane`);
      assert.ok(near(glacisArmor.carrier.rotationXRad, glacisArmor.angleRad),
        `${id}: carrier long axis follows the glacis tangent`);
      assert.ok(near(glacisArmor.cassettes.rotationXRad, glacisArmor.angleRad - Math.PI / 2),
        `${id}: cassette depth axes follow the glacis outward normal`);
      assert.equal(glacisArmor.cassettes.count, 12, `${id}: retains both mirrored three-by-two glacis ERA fields`);
      assert.ok(near(
        glacisArmor.cassettes.centerOffsetM - glacisArmor.cassettes.depthM / 2,
        glacisArmor.carrier.centerOffsetM + glacisArmor.carrier.thicknessM / 2
          - glacisArmor.cassettes.seatOverlapM,
      ), `${id}: ERA cassette backs overlap the carrier instead of floating or sinking`);
      const glacisY = (z) => core.crownY - Math.tan(core.glacisAngleRad) * (z - core.glacisTopZ);
      assert.ok(near(glacisArmor.surfaceCenter.y, glacisY(glacisArmor.surfaceCenter.z)),
        `${id}: the field's reference centre lies on the hull's glacis`);
      for (const center of glacisArmor.cassettes.centers) {
        const dy = center.y - glacisArmor.surfaceCenter.y;
        const dz = center.z - glacisArmor.surfaceCenter.z;
        const normalOffset = dy * glacisArmor.normalOutward.y + dz * glacisArmor.normalOutward.z;
        assert.ok(near(normalOffset, glacisArmor.cassettes.centerOffsetM),
          `${id}: every ERA cassette center stays on the shared offset plane`);
        assert.ok(Math.abs(center.x) < core.crownX && center.z > core.glacisTopZ,
          `${id}: every cassette stays on the glacis inside the deck crown`);
      }
    } else {
      assert.equal(glacisArmor, undefined, `${id}: does not claim the M3A3 reactive upper-glacis package`);
    }
  } finally {
    tank.dispose();
  }
}

console.log('bradleyHullClosure.selftest: the Bradleys share the source-measured hull core, side armour and turret; the Marder keeps its donor');
