import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { VEHICLE_HULL_LENGTH_FACTORS } from '../vehicleSizePolicy.ts';

// 2026-10-30 (lane t90-family-266; the owner: "cleaned up and updated significantly"; Main's ruling: fix the AM's
// 160 mm ride lift and its 65 % turret scale in the shared steps, not per id). The T-90AM and the T-90AM II (the
// later T-90M Proryv-3) ride the T-90 family chassis with the AM-type turret at full scale. This receipt keeps that
// construction: the family hull at its own datum (no construction offset, no installed lift), the shared six-station
// course stretched by the owner's long-chassis factor, the turret unscaled with one remote roof weapon, and the
// T-90M's own fit (Relikt over the front half, slat over the rear half).
const near = (value, target, epsilon = 1e-6) => Math.abs(value - target) <= epsilon;
const options = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true };

for (const id of ['t90am', 't90m_proryv']) {
  const h = VEHICLE_HULL_LENGTH_FACTORS[id] ?? 1;
  const tank = createTank(id, null, options);
  try {
    const hullRig = tank.root.getObjectByName('rig_hull');
    const turretRig = tank.root.getObjectByName('rig_turret');
    assert.ok(hullRig && turretRig, `${id}: articulated hull and turret rigs`);

    const family = hullRig.userData.t90FamilyHullFormReceipt;
    assert.equal(family?.family, 't90-burlak-pressure-hull-r1', `${id}: builds the shared T-90 family hull`);
    assert.ok(near(family.yOffset, 0), `${id}: no construction offset (the former -200 mm)`);
    assert.equal(family.sponsonMode, 'family-profile', `${id}: the family sponson profile, not a flat lift datum`);
    assert.equal(hullRig.userData.t90mProryvTrackReceipt, undefined, `${id}: the retired Proryv ride-lift receipt is gone`);

    const gear = hullRig.userData.runningGearReceipts.at(-1);
    assert.equal(gear.wheelZs.length, 6, `${id}: six road-wheel stations`);
    assert.ok(near(gear.wheelR, 0.375), `${id}: 750 mm road wheels`);
    assert.ok(near(Math.max(...gear.wheelZs) - Math.min(...gear.wheelZs), 4.00 * h, 1e-4),
      `${id}: the course spans the family wheelbase stretched by the owner's ${h} chassis factor`);
    assert.ok(near(gear.wheelY - gear.wheelR, gear.botY + gear.trackTh / 2), `${id}: the loaded tire foot rests on the band`);

    assert.deepEqual(turretRig.scale.toArray(), [1, 1, 1], `${id}: the turret keeps its built scale (no 65 % squash)`);
    let stations = 0;
    turretRig.traverse((node) => { if (node.userData?.fitting === 'pintleMG' && node.userData?.fittingRoot) stations++; });
    assert.equal(stations, 1, `${id}: exactly one roof weapon station`);
    assert.ok(turretRig.getObjectByName('t90smRemoteNsvt'), `${id}: the AM-type remote station carries the 12.7 mm gun`);

    tank.root.updateMatrixWorld(true);
    const pads = hullRig.getObjectByName('gearTrackPads');
    assert.ok(pads, `${id}: the linked shoe course is present`);
    assert.ok(new THREE.Box3().setFromObject(pads).min.y <= 0.015, `${id}: the shoe course is planted on the ground datum`);

    const cage = hullRig.userData.t90RearQuarterCageReceipt;
    assert.ok(cage?.attached, `${id}: the slat cage over the final drive is attached`);
    if (id === 't90m_proryv') assert.ok(cage.cageZRange[1] > 0, 't90m_proryv: the T-90M slat runs over the rear half of the hull side');
    else assert.ok(cage.cageZRange[1] < -1, 't90am: the AM slat covers only the final-drive quarter');
  } finally {
    tank.dispose();
  }
}

console.log('t90MProryvTrackRwsBustle.selftest: the T-90AM and AM II ride the family chassis at full turret scale');
