import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

const BRADLEY_DONOR_IDS = [
  'm2a2_bradley',
  'm3a3_bradley',
  'ua_m2a3_bradley',
  'marder1a3',
];

for (const id of BRADLEY_DONOR_IDS) {
  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, {
      proceduralOnly: true,
      quality,
      camoSeed: 4242,
      geometryReceipt: true,
    });
    try {
      const hullRig = tank.root.getObjectByName('rig_hull');
      const gear = hullRig?.userData.runningGearReceipts?.[0];
      const wheels = tank.root.getObjectByName('gearRoadWheelTires');
      const band = tank.root.getObjectByName('gearTrackBandL');
      const pads = tank.root.getObjectByName('gearTrackPads');

      assert.ok(hullRig && gear && wheels && band && pads,
        `${id}/${quality}: exposes one complete suspension-driven track assembly`);
      assert.equal(gear.trackPatternId, 'compact-ifv',
        `${id}/${quality}: keeps the Bradley-family smart-track pattern`);
      assert.equal(tank.root.getObjectByName('hullRunningGearTrack'), undefined,
        `${id}/${quality}: has no static pad rows or return-run filler beside the smart track`);

      const restWheels = Array.from(wheels.instanceMatrix.array);
      const restBand = Array.from(band.geometry.getAttribute('position').array);
      const restPads = Array.from(pads.instanceMatrix.array);
      const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
      tank.setGroundSampler((x, z) => 0.09 * Math.sin(z * 1.4) + (x < 0 ? -0.025 : 0.025));
      for (let tick = 0; tick < 90; tick++) tank.syncFromState(state, 1 / 60, 0);

      assert.notDeepEqual(Array.from(wheels.instanceMatrix.array), restWheels,
        `${id}/${quality}: road wheels follow sampled terrain`);
      assert.notDeepEqual(Array.from(band.geometry.getAttribute('position').array), restBand,
        `${id}/${quality}: lower track band follows suspension travel`);
      assert.notDeepEqual(Array.from(pads.instanceMatrix.array), restPads,
        `${id}/${quality}: linked shoes follow the same suspension travel`);
    } finally {
      tank.dispose();
    }
  }
}

console.log('bradleyRunningGear.selftest: Bradley donor family uses one suspension-driven smart-track course');
