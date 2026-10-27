// Release 262 (the owner on the Merkava family: "we will need their gun assemblies back and beautiful"): each mark's main
// gun over its long front-engine hull, over its spec's elevation range (gunHullClearance.test-support.mjs: every gun mesh,
// the recoiling parts in battery and at 0.135 m, against every hull mesh, the field suit included). Over the front arc
// the gun reaches its full depression keeping 25 mm from the hull (the engine deck and the nose plate fall away under it;
// the old pile's curves stopped the 1B at -0.7 deg over its glacis); at full elevation every yaw is clear; at its
// published stop (gunPitchByYawDeg, turretScaleGunPitch.ts, measured with tools/gun-depression-sweep.mjs) every yaw is
// clear, so the barrel never passes through the hull, its stowage or its baskets. Negative control: 25 degrees under its
// depression, straight ahead, the gun meets the glacis.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180, FRONT_ARC_DEG = 25;
const IDS = process.env.MERKAVA_GUN_IDS?.split(',')
  ?? ['merkava1b', 'merkava2b', 'merkava2d', 'merkava3c', 'merkava3_baz', 'merkava4b'];
for (const id of IDS) {
  const probe = gunHullProbe(id);
  try {
    for (let yd = -FRONT_ARC_DEG; yd <= FRONT_ARC_DEG; yd++) {
      const d = probe.distance(yd * DEG, -probe.depression, GUN_HULL_KEEP_M);
      assert.ok(d >= GUN_HULL_KEEP_M, `${id}: at yaw ${yd} the gun reaches its full ${(probe.depression / DEG).toFixed(1)} deg `
        + `depression over the front (${(d * 1000).toFixed(1)} mm from ${probe.part})`);
    }
    for (let yd = -179; yd <= 180; yd++) {
      const d = probe.distance(yd * DEG, probe.elevation, GUN_HULL_KEEP_M);
      assert.ok(d >= GUN_HULL_KEEP_M, `${id}: at yaw ${yd} the gun at full elevation clears the hull (${(d * 1000).toFixed(1)} mm from ${probe.part})`);
    }
    const worst = gunHullSweep(probe, probe.spec);
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `${id}: at its published stops the gun keeps 25 mm from its hull at every yaw `
      + `(${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} deg, from ${worst.part})`);
    const control = probe.distance(0, -probe.depression - 25 * DEG, GUN_HULL_KEEP_M);
    assert.ok(control < GUN_HULL_KEEP_M, `${id}: negative control: 25 deg under its depression the gun meets the glacis`);
    console.log(`${id}: full depression over +-${FRONT_ARC_DEG} deg, elevation clear all round, stops hold `
      + `(nearest ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd})`);
  } finally {
    probe.dispose();
  }
}
console.log(`merkavaFamilyGunClearance.selftest: ${IDS.length} Merkava guns clear their hulls over the source elevation range PASS`);
