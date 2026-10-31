// Release 262 (the owner on the Merkava family: "we will need their gun assemblies back and beautiful"): each mark's main
// gun over its long front-engine hull, over its spec's elevation range (gunHullClearance.test-support.mjs: every gun mesh,
// the recoiling parts in battery and at 0.135 m, against every hull mesh, the field suit included). Over each mark's
// measured front arc the gun reaches its full depression keeping 25 mm from the hull (the engine deck and the nose plate
// fall away under it; the old pile's curves stopped the 1B at -0.7 deg over its glacis): the Mk 1B and 2B all round, the
// 2D to +-22 deg (its front-left width rod beyond), the Mk 3 to +-5 deg (the deck fittings at 6-28 deg hold it at -6.8 to
// -7.6), the Mk 4B nowhere at its full 8 deg (its curve holds -7.8 ahead and -6.7 by its front-left width rod). At full
// elevation every yaw is clear, and at its published stop (gunPitchByYawDeg, turretScaleGunPitch.ts, measured with
// tools/gun-depression-sweep.mjs) every yaw is clear, so the barrel never passes through the hull, its stowage or its
// baskets; except the Mk 2D's 139-145 deg, where the source's raked rear marker poles stand in the barrel's path at every
// pitch (an owner decision, nationalGunClearance.selftest.mjs's skip window). Negative control: 25 degrees under its
// depression, straight ahead, the gun meets the glacis.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from '../gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180;
/** The half-arc (deg) about straight ahead where each mark's gun reaches its full depression (the sweep's curve). */
const FULL_DEPRESSION_ARC = Object.freeze({
  merkava1b: 180, merkava2b: 180, merkava2d: 22, merkava3c: 5, merkava3_baz: 5, merkava4b: -1,
});
/** Yaw windows (absolute degrees) where a source fitting stands in the barrel's path at every pitch: not held. */
const SKIP = Object.freeze({ merkava2d: [[139, 145]] });
const IDS = process.env.MERKAVA_GUN_IDS?.split(',') ?? Object.keys(FULL_DEPRESSION_ARC);
for (const id of IDS) {
  const probe = gunHullProbe(id), skip = SKIP[id] ?? [];
  const partsAt = (yd) => (skip.some(([a, b]) => yd >= a && yd <= b) ? null : 'all');
  try {
    const arc = Math.min(179, FULL_DEPRESSION_ARC[id]);
    for (let yd = -arc; yd <= arc; yd++) {
      const d = probe.distance(yd * DEG, -probe.depression, GUN_HULL_KEEP_M);
      assert.ok(d >= GUN_HULL_KEEP_M, `${id}: at yaw ${yd} the gun reaches its full ${(probe.depression / DEG).toFixed(1)} deg `
        + `depression over its front arc (${(d * 1000).toFixed(1)} mm from ${probe.part})`);
    }
    for (let yd = -179; yd <= 180; yd++) {
      if (!partsAt(Math.abs(yd))) continue;
      const d = probe.distance(yd * DEG, probe.elevation, GUN_HULL_KEEP_M);
      assert.ok(d >= GUN_HULL_KEEP_M, `${id}: at yaw ${yd} the gun at full elevation clears the hull (${(d * 1000).toFixed(1)} mm from ${probe.part})`);
    }
    const worst = gunHullSweep(probe, probe.spec, { partsAt });
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `${id}: at its published stops the gun keeps 25 mm from its hull at every yaw `
      + `(${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} deg, from ${worst.part})`);
    const control = probe.distance(0, -probe.depression - 25 * DEG, GUN_HULL_KEEP_M);
    assert.ok(control < GUN_HULL_KEEP_M, `${id}: negative control: 25 deg under its depression the gun meets the glacis`);
    console.log(`${id}: full depression over +-${Math.max(0, arc)} deg, elevation clear all round, stops hold `
      + `(nearest ${(worst.d * 1000).toFixed(1)} mm at yaw ${worst.yd})`);
  } finally {
    probe.dispose();
  }
}
console.log(`merkavaFamilyGunClearance.selftest: ${IDS.length} Merkava guns clear their hulls over the source elevation range PASS`);
