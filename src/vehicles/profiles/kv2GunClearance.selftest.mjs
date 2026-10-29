// 262 (the KV-2 rebuilt from historical references, docs/references/tanks/kv2.md): the M-10T, its cradle drum and its
// shield box clear their own hull over the howitzer's whole arc at every turret yaw. The arc is the source's (S1:
// -3..+18 degrees) joined with the game's (spec gunDepressionDeg / gunElevationDeg), so the drawn mount works through the
// real gun's travel and every pose the sim can command. The measure is the fleet's (gunHullClearance.test-support.mjs:
// every gun mesh, the recoiling parts in battery and at 0.135 m, the true 3D distance to every visible hull mesh); a
// gun taken far below its stop must come through the glacis, the negative control.
import assert from 'node:assert/strict';
import { GUN_HULL_KEEP_M, gunHullProbe } from '../gunHullClearance.test-support.mjs';

const SOURCE_ARC_DEG = Object.freeze([-3, 18]);
const DEG = Math.PI / 180;
const probe = gunHullProbe('kv2');
try {
  const lo = Math.min(SOURCE_ARC_DEG[0], -(probe.spec.gunDepressionDeg ?? 0));
  const hi = Math.max(SOURCE_ARC_DEG[1], probe.spec.gunElevationDeg ?? 0);
  assert.ok(lo <= -5 && hi >= 18, `the sweep spans the source arc and the game's (${lo}..${hi})`);
  assert.equal(probe.spec.gunPitchByYawDeg, undefined, 'the KV-2 publishes no depression curve: the gun keeps its full stop all round');
  let worst = { d: Infinity };
  for (let yaw = 0; yaw < 360; yaw += 3) {
    for (let pitch = lo; pitch <= hi; pitch += 1) {
      const d = probe.distance(yaw * DEG, pitch * DEG, GUN_HULL_KEEP_M);
      if (d < worst.d) worst = { d, yaw, pitch, part: probe.part };
    }
  }
  console.log(`kv2 gun over hull: worst ${(worst.d * 100).toFixed(1)} cm at yaw ${worst.yaw} pitch ${worst.pitch} (${worst.part ?? 'nothing within reach'}), ${probe.samples} gun samples`);
  assert.ok(worst.d >= GUN_HULL_KEEP_M,
    `the gun comes within ${(worst.d * 100).toFixed(1)} cm of ${worst.part} at yaw ${worst.yaw}, pitch ${worst.pitch} (keep ${GUN_HULL_KEEP_M * 100} cm)`);
  // negative control: laid 50 degrees down over the bow, the tube passes through the glacis
  const through = probe.distance(0, -50 * DEG, 0);
  assert.ok(through < GUN_HULL_KEEP_M, `at -50 degrees the tube meets the hull (${(through * 100).toFixed(1)} cm)`);
  console.log('kv2GunClearance.selftest: the M-10T clears its hull over -5..+18 degrees at every yaw');
} finally {
  probe.dispose();
}
