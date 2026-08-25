import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { M46_M47_TRACK_FINISH } from './patton.js';

const CASES = {
  m26_pershing: { profile: 'm26-broad-cast', castScale: 0.65, gunY: 0.27846, mantletW: 1.50 },
  m45_patton: { profile: 'm45-heavy-howitzer-cast', castScale: 0.65, gunY: 0.26, mantletW: 1.53 },
  m46_patton: {
    profile: 'm46-low-patton-cast', castScale: 0.78, gunY: 0.37089, mantletW: 1.40,
    idlerR: 0.38, sprocketR: 0.28, sprocketTeeth: false,
  },
  m47_patton: {
    profile: 'm47-low-t42-cast', castScale: 0.65, gunY: 0.2405, mantletW: 0.70,
    idlerR: 0.27, sprocketR: 0.325, sprocketTeeth: false,
  },
};

for (const [id, expected] of Object.entries(CASES)) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const shell = tank.root.getObjectByName('turret');
  const mantlet = tank.root.getObjectByName('gunMount');
  assert.ok(turretRig && gunRig && shell && mantlet, `${id}: articulated low turret remains complete`);
  assert.equal(turretRig.userData.castHeightScale, expected.castScale,
    `${id}: cast profile keeps its deliberate family height`);
  assert.equal(turretRig.userData.castProfile, expected.profile, `${id}: distinct casting treatment survives`);

  const shellSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
  assert(shellSize.y <= 1.40, `${id}: shell, roof seats, and cheek fittings stay inside the restored low envelope`);
  assert(shellSize.x >= shellSize.y * 1.65, `${id}: broad cast cheeks dominate the restored vertical profile`);
  assert(Math.abs(gunRig.position.y - expected.gunY) < 1e-6,
    `${id}: gun pivot follows the new roof/mantlet axis without leaving the turret`);

  const mantletSize = new THREE.Box3().setFromObject(mantlet).getSize(new THREE.Vector3());
  assert(mantletSize.x >= expected.mantletW, `${id}: reshaped mantlet keeps a substantial cast face`);
  assert(mantletSize.y <= 0.68, `${id}: mantlet stays proportional to its restored casting`);

  if (expected.sprocketR != null) {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const gearReceipt = hullRig?.userData?.runningGearReceipts?.[0];
    assert.ok(gearReceipt, `${id}: running-gear geometry receipt remains available`);
    assert.equal(gearReceipt.sprocket.r, expected.sprocketR,
      `${id}: rear drive sprocket keeps its authored radius`);
    assert.equal(gearReceipt.idler.r, expected.idlerR,
      `${id}: front idler keeps its authored radius`);
    assert.equal(gearReceipt.sprocketTeeth, expected.sprocketTeeth,
      `${id}: non-camouflaged radial sprocket blocks stay removed`);
  }

  if (expected.sprocketR != null) {
    const forbiddenShadeMeshes = [];
    const trackBands = [];
    tank.root.traverse((object) => {
      if (object.name === 'gearShadowProxy' || object.name === 'gearRunCover') forbiddenShadeMeshes.push(object);
      if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') trackBands.push(object);
    });
    assert.equal(forbiddenShadeMeshes.length, 0,
      `${id}: non-selectable wheel-bay shade panels are removed from the live track volume`);
    assert.equal(trackBands.length, 2, `${id}: exactly one continuous track band remains per side`);
    for (const band of trackBands) {
      assert.equal(band.material.color.getHex(), M46_M47_TRACK_FINISH.trackBandHex,
        `${id} ${band.name}: track uses neutral weathered steel`);
      assert.equal(band.material.roughness, M46_M47_TRACK_FINISH.trackBandRoughness,
        `${id} ${band.name}: track remains matte`);
      assert.equal(band.material.envMapIntensity, M46_M47_TRACK_FINISH.trackBandEnvMapIntensity,
        `${id} ${band.name}: environment lighting cannot turn the track olive or bronze`);
    }
  }

  const repeat = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  const repeatShell = repeat.root.getObjectByName('turret');
  const repeatGun = repeat.root.getObjectByName('rig_gun');
  const repeatSize = new THREE.Box3().setFromObject(repeatShell).getSize(new THREE.Vector3());
  assert.ok(repeatSize.distanceTo(shellSize) < 1e-6,
    `${id}: repeated construction must not compress the shared profile again`);
  assert.ok(Math.abs(repeatGun.position.y - gunRig.position.y) < 1e-6,
    `${id}: repeated construction keeps the same gun axis`);
  repeat.dispose();
  tank.dispose();
}

console.log('pattonLowTurrets.selftest: Patton casting heights, gun seats, and M46/M47 rear sprockets verified');
