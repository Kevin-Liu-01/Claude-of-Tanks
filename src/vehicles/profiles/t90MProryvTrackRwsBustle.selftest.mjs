import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
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
  assert.ok(near(track.roadWheelRadiusM, 0.48), 'road wheels use the taller 480-mm radius');
  assert.ok(near(track.trackEnvelopeHeightM, 0.93), 'linked course spans the 930-mm vertical envelope');
  assert.ok(near(track.rideHeightIncreaseM, 0.16), 'finished hull and turret gain 160 mm of ride height');
  assert.equal(track.roadWheelStations, 6, 'native six-station cadence is preserved');
  assert.ok(near(getSpec('t90m').dims.heightM, 2.39), 'published vehicle height follows the raised ride datum');
  const finalGear = hullRig.userData.runningGearReceipts.at(-1);
  assert.ok(near(finalGear.wheelR, 0.48), 'canonical gear receipt records the larger wheels');
  assert.ok(near(finalGear.wheelY - finalGear.wheelR, 0.085), 'loaded tire foot remains on its original ground datum');

  tank.root.updateMatrixWorld(true);
  const trackPads = hullRig.getObjectByName('gearTrackPads');
  assert.ok(trackPads, 'linked instanced shoe course remains present');
  const trackBounds = new THREE.Box3().setFromObject(trackPads);
  assert.ok(trackBounds.min.y <= 0.01,
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

  const rear = turretRig.userData.t90mProryvRearAssemblyReceipt;
  assert.ok(rear?.attached, 'rear external assembly is explicitly attached');
  assert.ok(rear.forwardOverlapM >= 0.20,
    `rear cylinder enters the bustle/frame by at least 200 mm (${rear.forwardOverlapM.toFixed(3)} m)`);

  for (const yaw of [0, Math.PI / 2]) {
    turretRig.rotation.y = yaw;
    tank.root.updateMatrixWorld(true);
    assert.equal(remoteKord.parent, turretRig, `remote Kord remains turret-owned through yaw ${yaw}`);
  }
} finally {
  tank.dispose();
}

console.log('t90MProryvTrackRwsBustle.selftest: taller linked course, raised ride, remote Kord, and attached rear assembly verified');
