// Release 262 (the ZTZ-20 family, ztz20Family.ts): the 105 mm gun of the production ZTZ-20, the ZTZ-20 Prototype and
// the pre-production ZTZ-100 keeps 25 mm from its own hull at every whole degree of turret yaw, at that yaw's published
// depression stop (gunPitchByYawDeg, measured with tools/gun-depression-sweep.mjs at 26 mm), at level and at full
// elevation (gunHullClearance.test-support.mjs: every gun mesh, the recoiling parts in battery and at 0.135 m, against
// every hull mesh; samples inside the turret's own outline are not measured), the receipt strv103GunPort.selftest.mjs
// and nationalGunClearance.selftest.mjs keep for their tanks. Negative controls: the same gun at its bare depression
// (no curve) must come inside 25 mm wherever a curve publishes a stop, and the ZTZ-20's gun posed 8.4 degrees under its
// stop over the glacis (-14 degrees at yaw 0, the sleeve into the tiles) must fail the same measure.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from './gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180, T0 = Date.now();
for (const id of ['ztz20', 'ztz20_prototype', 'ztz100']) {
  const probe = gunHullProbe(id);
  try {
    const spec = probe.spec;
    assert.equal(spec.gunDepressionDeg, 8); assert.equal(spec.gunElevationDeg, 15);
    const worst = gunHullSweep(probe, spec);
    console.log(`${id}: worst ${(worst.d * 100).toFixed(1)} cm at yaw ${worst.yd} pitch ${(worst.pitch / DEG).toFixed(1)} (${worst.part}); ${probe.samples} samples, ${((Date.now() - T0) / 1000).toFixed(0)} s`);
    assert.ok(worst.d >= GUN_HULL_KEEP_M, `${id}: the gun comes ${(worst.d * 100).toFixed(1)} cm from ${worst.part} at yaw ${worst.yd}`);
    if (spec.gunPitchByYawDeg?.length) {
      const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M });
      assert.ok(bare.d < GUN_HULL_KEEP_M, `${id}: without its curve the gun reaches its hull (negative control)`);
    }
  } finally {
    probe.dispose();
  }
}
// negative control on the real build: over the glacis at yaw 0 the published stop is clear, -14 degrees is not
{
  const probe = gunHullProbe('ztz20');
  try {
    const stop = probe.spec.gunPitchByYawDeg[0][1];
    assert.equal(stop, -5.6);
    const clear = probe.distance(0, stop * DEG), under = probe.distance(0, -14 * DEG);
    assert.ok(clear >= GUN_HULL_KEEP_M, `the published front stop is clear (${(clear * 100).toFixed(1)} cm)`);
    assert.ok(under < GUN_HULL_KEEP_M, `14 degrees down over the glacis reaches the hull (${(under * 100).toFixed(1)} cm, ${probe.part})`);
  } finally { probe.dispose(); }
}
console.log(`ztz20GunClearance: the ZTZ-20 family's 105 mm guns keep ${GUN_HULL_KEEP_M * 1000} mm from their hulls at every yaw (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
