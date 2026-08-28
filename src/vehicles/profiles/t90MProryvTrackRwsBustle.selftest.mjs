import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';

const near = (value, target, epsilon = 1e-6) => Math.abs(value - target) <= epsilon;
const tank = createTank('t90m', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  assert.ok(hullRig && turretRig, 'T-90M retains articulated hull and turret rigs');

  const track = hullRig.userData.t90mProryvTrackReceipt;
  assert.ok(track, 'T-90M exposes its installed running-gear receipt');
  assert.ok(near(track.roadWheelRadiusM, 0.31), 'road wheels use the non-overlapping 310-mm radius');
  assert.ok(near(track.roadWheelSpanM, 3.60), 'six road-wheel stations use the corrected long T-90 wheelbase');
  assert.ok(near(track.sprocketZ, -2.46) && near(track.idlerZ, 2.54),
    'terminal wheels occupy the corrected long-hull stations');
  assert.ok(near(track.structuralHullLengthM, 6.76), 'structural hull spans the corrected T-90 length');
  assert.ok(near(track.trackEnvelopeHeightM, 0.93), 'linked course spans the 930-mm vertical envelope');
  assert.ok(near(track.rideHeightIncreaseM, 0.16), 'finished hull and turret gain 160 mm of ride height');
  assert.equal(track.roadWheelStations, 6, 'native six-station cadence is preserved');
  assert.ok(near(getSpec('t90m').dims.heightM, 2.39), 'published vehicle height follows the raised ride datum');
  const finalGear = hullRig.userData.runningGearReceipts.at(-1);
  assert.ok(near(finalGear.wheelR, 0.31), 'canonical gear receipt records the smaller wheels');
  assert.ok(near(finalGear.wheelY - finalGear.wheelR, 0.085), 'loaded tire foot remains on its original ground datum');

  tank.root.updateMatrixWorld(true);
  const trackPads = hullRig.getObjectByName('gearTrackPads');
  assert.ok(trackPads, 'linked instanced shoe course remains present');
  const trackBounds = new THREE.Box3().setFromObject(trackPads);
  // The closed course is sampled at one shoe per pitch, so the closest shoe can
  // sit a few millimetres above the analytical nadir without producing a
  // visible hover. Keep the installed contact surface within 15 mm of ground.
  assert.ok(trackBounds.min.y <= 0.015,
    `linked shoe course remains planted on the ground datum (${trackBounds.min.y.toFixed(3)} m)`);
  const bounds = new THREE.Box3().setFromObject(tank.root);
  assert.ok(bounds.max.y >= 2.36, `installed silhouette is taller (${bounds.max.y.toFixed(3)} m)`);

  const equipment = turretRig.userData.t90mProryvEquipmentReceipt;
  assert.ok(equipment, 'T-90M exposes its remote station receipt');
  assert.equal(equipment.remoteWeapon, 'kord', 'right tower carries a Kord-class weapon');
  assert.equal(equipment.remoteControlled, true, 'Kord station is remotely controlled');
  assert.equal(equipment.remoteWeaponSide, 'right', 'station remains on the requested turret side');
  assert.equal(equipment.armoredTower, true, 'station uses an armored tower mount');
  const remoteKord = turretRig.getObjectByName('t90mProryvRemoteKord');
  assert.ok(remoteKord, 'named remote Kord assembly is present');

  const roof = turretRig.userData.t90mProryvRoofSeatingReceipt;
  assert.ok(roof, 'T-90M exposes its roof seating receipt');
  assert.equal(roof.maxRoofGapM, 0, 'roof fittings permit no visible underside gap');
  assert.equal(roof.seatedCircularStations, 3,
    'crew rings and RWS race remain structural');
  assert.equal(roof.structuralFoundations, 1,
    'panoramic housing retains a structural roof foundation');
  assert.equal(roof.equipmentHousings, 2, 'Sosna and panoramic housings remain equipment');
  assert.ok(roof.sosnaCarrierTopY - roof.sosnaHousingBottomY >= roof.contactEmbedM,
    'Sosna housing overlaps its buried roof carrier');
  assert.ok(roof.panoCarrierTopY - roof.panoHousingBottomY >= roof.contactEmbedM,
    'panoramic housing overlaps its buried roof carrier');
  assert.ok(roof.commanderBottomY <= 0.70 && roof.gunnerBottomY <= 0.70
    && roof.rwsBottomY <= 0.70, 'all three circular roof stations enter the crown');

  const searchlight = turretRig.userData.t90mProryvSearchlightReceipt;
  assert.ok(searchlight, 'T-90M exposes its searchlight material receipt');
  assert.equal(searchlight.housingBucket, 'turretEquipment',
    'searchlight housing follows camouflage without expanding armor');
  assert.equal(searchlight.housingCamouflaged, true, 'searchlight housing uses camouflage paint');
  assert.equal(searchlight.lensBucket, 'turretGlass', 'searchlight retains a distinct lens');
  assert.equal(searchlight.armorHitboxExpanded, false, 'searchlight is excluded from armor receipts');

  const rear = turretRig.userData.t90mProryvRearAssemblyReceipt;
  assert.ok(rear?.attached, 'rear external assembly is explicitly attached');
  assert.equal(rear.daylightGapM, 0, 'rear drum has no daylight to the bustle face');
  assert.ok(rear.forwardOverlapM >= 0.03,
    `rear drum enters the bustle by at least 30 mm (${rear.forwardOverlapM.toFixed(3)} m)`);
  assert.ok(rear.centerZ > rear.terminalFrameZ,
    'rear drum is attached to the bustle rather than hanging on the terminal frame');

  for (const yaw of [0, Math.PI / 2]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(remoteKord.parent, turretRig, `remote Kord remains turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

const tierXTank = createTank('t90m_proryv', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const tierXTrack = tierXTank.root.getObjectByName('rig_hull')?.userData.t90mProryvTrackReceipt;
  assert.ok(tierXTrack, 'tier-X T-90M Proryv publishes the shared long-chassis receipt');
  assert.ok(near(tierXTrack.roadWheelSpanM, 3.60)
    && near(tierXTrack.structuralHullLengthM, 6.76),
  'tier-IX T-90M and tier-X Proryv use the same corrected long hull');
} finally {
  tierXTank.dispose();
}

console.log('t90MProryvTrackRwsBustle.selftest: tracks, seated roof fittings, camouflaged light, remote Kord, and attached rear assembly verified');
