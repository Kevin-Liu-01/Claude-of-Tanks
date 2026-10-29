// Release 262 (owner 2026-10-27, the new T-84BM Oplot-M and Oplot-T, and the T-84U rebuilt as their predecessor on the
// same hull): the KBA-3 keeps its hull clear over the gun's whole source range. KMDB's T-80UD lineage lays the 125 mm
// gun from -5 to +14 degrees; each tank's spec carries that
// range and the gunPitchByYawDeg curve tools/gun-depression-sweep.mjs measured on its build (ukraine.ts). At every whole
// degree of turret yaw the gun (every gun mesh, the recoiling parts in battery and at 0.135 m) keeps GUN_HULL_KEEP_M from
// every hull mesh at its yaw's depression stop, at level and at full elevation (gunHullClearance.test-support.mjs).
// Negative control: the same gun at the bare -5 degrees all round (no curve) comes within that distance of its hull
// astern, where the barrel crosses the unditching log and the stern drums.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from './gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180;
for (const id of ['bm_oplot_m', 'bm_oplot_t', 't84bm_oplot_m']) {
  const probe = gunHullProbe(id);
  try {
    assert.equal(probe.spec.gunDepressionDeg, 5, `${id}: the KBA-3 depresses to -5 degrees (source range)`);
    assert.equal(probe.spec.gunElevationDeg, 14, `${id}: the KBA-3 elevates to +14 degrees (source range)`);
    assert.ok(Array.isArray(probe.spec.gunPitchByYawDeg) && probe.spec.gunPitchByYawDeg.length > 1,
      `${id}: the measured depression curve is published`);
    const worst = gunHullSweep(probe, probe.spec);
    console.log(`${id}: worst clearance ${(worst.d * 100).toFixed(1)} cm at yaw ${worst.yd} pitch ${(worst.pitch / DEG).toFixed(1)} (${worst.part})`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M,
      `${id}: the gun comes ${(worst.d * 100).toFixed(1)} cm from ${worst.part} at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(1)}`);
    // forward, over the glacis Duplet and the driver's periscopes, the gun keeps its full source depression
    const ahead = probe.spec.gunPitchByYawDeg.filter(([yaw]) => yaw <= 30).map(([, pitch]) => pitch);
    assert.ok(ahead.every((pitch) => pitch <= -5 + 1e-9), `${id}: the full -5 degrees over the glacis (${ahead})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: probe.spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `${id}: without its curve the gun reaches its hull (${(bare.d * 100).toFixed(1)} cm)`);
  } finally {
    probe.dispose();
  }
}
console.log('oplotBMGun.selftest: the Oplot-M, the Oplot-T and the T-84U keep their KBA-3 clear of the hull over -5..+14 at every yaw');
