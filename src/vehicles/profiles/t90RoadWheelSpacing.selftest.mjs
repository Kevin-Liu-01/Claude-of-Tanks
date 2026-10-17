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
const CASES = Object.freeze({
  t90_1992: Object.freeze({ radius: BURLAK_ROAD_WHEEL_RADIUS, minGap: 0.01 }),
  t90ms_2011: Object.freeze({ radius: 0.34, minGap: 0.108 }),
  t90am: Object.freeze({ radius: 0.31, minGap: 0.04 }),
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
        't90_1992: remaining solid skirt retains the front ERA apron depth');
      assert.equal(attachment.skirt.panels, 5,
        't90_1992: each side keeps a five-panel straight skirt before the tapered bow closure');
      assert.equal(attachment.skirt.sides, 2,
        't90_1992: solid skirts are authored on both sides');
      assert.equal(attachment.skirt.rearQuarterReplacedByCage, true,
        't90_1992: rear quarter is explicitly replaced by the stand-off cage');
      assert.equal(attachment.skirt.burlakStyleTaperedFront, true,
        't90_1992: forward skirt ends in the Burlak-style tapered bow closure');
      assert.ok(attachment.skirt.straightZ1 < attachment.skirt.z1,
        't90_1992: tapered closure carries protection beyond the straight side curtain');
      assert.ok(attachment.skirt.frontClosureCoverageM >= 0.70,
        't90_1992: forward closure provides deeper coverage than Burlak prototype skirts');
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

    if (id === 't90ms_2011') {
      const attachment = hull.userData.t90MSFrontMudguardReceipt;
      assert.ok(attachment, 't90ms_2011: exposes its mirrored front mudguard receipt');
      assert.equal(attachment.sides, 2,
        't90ms_2011: authors the guard assembly on both track courses');
      assert.equal(attachment.partsPerSide, 3,
        't90ms_2011: each guard has two closed armor volumes and one rubber drop');
      assert.equal(attachment.labels.length,
        attachment.sides * attachment.partsPerSide,
        't90ms_2011: every authored guard piece has a seating label');
      assert.equal(attachment.architecture,
        'continuous-sloped-shoulder-and-closed-outer-shell',
        't90ms_2011: the bow guard uses the continuous sloped shoulder architecture');
      assert.equal(attachment.steppedShelves, false,
        't90ms_2011: the old staircase of thin shelf plates does not return');
      assert.equal(attachment.closedSideVolume, true,
        't90ms_2011: shoulder and outer guard are closed armor volumes');
      assert.ok(attachment.bridgeInnerX < 1.06
        && attachment.bridgeOuterX >= 1.64,
      't90ms_2011: the shoulder overlaps the centre glacis and reaches the outer shell');
      assert.ok(attachment.shellInnerX <= attachment.bridgeOuterX
        && attachment.shellOuterX >= 1.78,
      't90ms_2011: the outer shell overlaps the shoulder and reaches the terminal guard');
      assert.ok(attachment.bridgeUndersideY > attachment.trackTopY,
        't90ms_2011: connected shoulder remains above the return track course');
      assert.ok(attachment.flapTopY >= attachment.shellFrontTopY - 0.03,
        't90ms_2011: rubber drop meets the sloped outer shell at the terminal lip');

      const guardSeats = tank.root.userData.mudguardFenderSeats || [];
      const guardLabels = new Set(attachment.labels);
      const registeredGuards = guardSeats.filter(({ label }) =>
        guardLabels.has(label));
      assert.equal(registeredGuards.length, attachment.labels.length,
        't90ms_2011: every metal and rubber piece participates in the physical seating audit');
      assert.ok(registeredGuards.every(({ supported }) => supported),
        't90ms_2011: both complete front mudguards form supported hull-connected chains');
    }
  } finally {
    tank.dispose();
  }
}

console.log('t90RoadWheelSpacing.selftest: RU-417 matches Burlak wheel size and keeps tapered skirts, cage, and automated station');
