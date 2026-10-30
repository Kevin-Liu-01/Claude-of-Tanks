import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const EPSILON = 1e-6;
const burlakReference = createTank('t90a_burlak_proto', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
const BURLAK_ROAD_WHEEL_RADIUS = burlakReference.root
  .getObjectByName('rig_hull')?.userData.runningGearReceipts?.at(-1)?.wheelR;
burlakReference.dispose();
assert.ok(BURLAK_ROAD_WHEEL_RADIUS > 0, 'Burlak publishes its road-wheel radius');

// Ground-datum seat (2026-09-17): every road wheel's foot rests on the band's upper face, and the band
// stands its shoe soles on hull y = 0 — so the loaded foot is botY + trackTh/2 and the axle sits one
// tire radius above it. The old per-tank centerY/footY pins (t90_1992 0.480/0.095, t90ms_2011 0.35/0.01 — wheels
// nine centimetres inside the band —, t90am 0.395/0.085) recorded the mis-seats the law removed.
// 2026-10-30 (lane t90-family-266): every mark rides the T-90 family chassis's course (six 750 mm wheels on the
// 0.80 m pitch); the T-90AM's stations stretch with its owner-directed 1.10 chassis.
const CASES = Object.freeze({
  t90_1992: Object.freeze({ radius: BURLAK_ROAD_WHEEL_RADIUS, minGap: 0.01 }),
  t90ms_2011: Object.freeze({ radius: BURLAK_ROAD_WHEEL_RADIUS, minGap: 0.01 }),
  t90am: Object.freeze({ radius: BURLAK_ROAD_WHEEL_RADIUS, minGap: 0.01 }),
});

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });

  try {
    const hull = tank.root.getObjectByName('rig_hull');
    const receipt = hull?.userData.runningGearReceipts?.at(-1);
    assert.ok(receipt, `${id}: exposes its installed running-gear receipt`);
    assert.ok(Math.abs(receipt.wheelR - expected.radius) <= EPSILON,
      `${id}: road-wheel radius is ${expected.radius} m`);
    const faceY = receipt.botY + receipt.trackTh / 2;
    assert.ok(Math.abs(receipt.wheelY - (faceY + receipt.wheelR)) <= EPSILON,
      `${id}: road-wheel center sits one tire radius above the band's upper face`);
    assert.ok(Math.abs(receipt.wheelY - receipt.wheelR - faceY) <= EPSILON,
      `${id}: loaded tire foot rests on the band's upper face (${faceY.toFixed(4)} m)`);
    assert.ok(Math.abs(receipt.trackTh - 0.028) <= EPSILON, `${id}: band is the fleet-standard 28 mm`);
    assert.ok(faceY > 0.05 && faceY < 0.09, `${id}: band face stands a shoe stack above the y = 0 ground datum`);

    const stations = [...receipt.wheelZs].sort((a, b) => a - b);
    for (let index = 1; index < stations.length; index++) {
      const centerDistance = stations[index] - stations[index - 1];
      const gap = centerDistance - receipt.wheelR * 2;
      assert.ok(gap >= expected.minGap - EPSILON,
        `${id}: road-wheel stations ${index - 1}/${index} retain ${expected.minGap} m clearance`);
    }

    if (id === 't90_1992') {
      assert.ok(Math.abs(receipt.wheelR - BURLAK_ROAD_WHEEL_RADIUS) <= EPSILON,
        't90_1992: road wheels use the live T-90A Burlak radius');
      const attachment = hull.userData.t90AttachmentReceipt;
      assert.ok(attachment, 't90_1992: exposes skirt and terminal-guard attachment receipt');
      assert.ok(attachment.skirt.z0 > receipt.sprocket.z + receipt.sprocket.r,
        't90_1992: solid skirt stops ahead of the rear final-drive quarter');
      assert.ok(attachment.skirt.z1 >= receipt.idler.z + receipt.idler.r,
        't90_1992: skirt reaches beyond the forward idler');
      assert.ok(attachment.skirt.yBot <= receipt.topY,
        't90_1992: skirt drops into the return-track shoulder instead of becoming a thin fender strip');
      assert.ok(attachment.skirt.yTop >= 1.43,
        't90_1992: skirt meets the upper fender course');
      assert.ok(attachment.skirt.height >= 0.60,
        't90_1992: the full-length skirt keeps the front ERA apron depth');
      // 2026-10-30 (lane t90-family-266, the Patriot Park side photographs): one full-length skirt to the road-wheel
      // tops, seven panels a side, with the three K-5 panels standing proud of its front portion; no cage.
      assert.equal(attachment.skirt.panels, 7,
        't90_1992: each side keeps a seven-panel straight skirt before the tapered bow closure');
      assert.equal(attachment.skirt.sides, 2,
        't90_1992: solid skirts are authored on both sides');
      assert.equal(attachment.skirt.rearQuarterReplacedByCage, false,
        't90_1992: the 1992 tank carries no stand-off cage');
      assert.equal(attachment.skirt.burlakStyleTaperedFront, true,
        't90_1992: forward skirt ends in the Burlak-style tapered bow closure');
      assert.ok(attachment.skirt.straightZ1 < attachment.skirt.z1,
        't90_1992: tapered closure carries protection beyond the straight side curtain');
      assert.ok(attachment.skirt.frontClosureCoverageM >= 0.60,
        't90_1992: forward closure covers the skirt depth');
      assert.ok(Math.abs((receipt.wheelY - receipt.wheelR)
        - (receipt.botY + receipt.trackTh * 0.5)) <= EPSILON,
      't90_1992: road-wheel feet meet the lower-track upper face without clipping');

      const mg = tank.root.getObjectByName('t90Ru417AutomatedKord');
      assert.ok(mg, 't90_1992: exposes the integrated automated Kord fitting');
      assert.equal(mg.userData.barrelBridge, true,
        't90_1992: Kord receiver and barrel are joined by a breech bridge');
      const station = tank.root.getObjectByName('rig_turret')
        ?.userData.t90Ru417AutomatedStationReceipt;
      assert.equal(station?.family, 'tagil-integrated-automated-station-r1',
        't90_1992: commander station follows the consolidated Tagil family');
      assert.equal(station?.remoteControlled, true,
        't90_1992: commander weapon station is remotely controlled');
      assert.equal(station?.panoramicIntegrated, true,
        't90_1992: panoramic sight and Kord share one station');
      assert.equal(station?.separateManualWeaponStations, 0,
        't90_1992: no second hand-served roof weapon remains');

      const guardSeats = tank.root.userData.mudguardFenderSeats || [];
      const guardLabels = new Set(attachment.guardLabels);
      const registeredGuards = guardSeats.filter(({ label }) =>
        guardLabels.has(label));
      assert.equal(registeredGuards.length, attachment.guardLabels.length,
        't90_1992: all four terminal mudguards participate in the physical seating audit');
      assert.ok(registeredGuards.every(({ supported }) => supported),
        't90_1992: every terminal mudguard physically meets its fender structure');
    }

    // The T-90MS's private front guards retired with its loft (the family chassis's guards are checked on t90_1992).
  } finally {
    tank.dispose();
  }
}

console.log('t90RoadWheelSpacing.selftest: the family course matches the Burlak wheel size; the 1992 keeps its full-length skirt and automated station');
