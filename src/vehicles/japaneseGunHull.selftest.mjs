// 262 (owner: "we should upgrade the hulls and everything about the tanks too"; Main: a barrel through the hull or the
// jerry cans is a fidelity fault): the STB-1's and the Type 74's guns over their rebuilt hulls, on their source travel
// (-6/+9 at the gun; the hydropneumatic hull pitch carries the rest) and their published per-yaw depression curves
// (gunPitchByYawDeg, measured by tools/gun-depression-sweep.mjs on the 262 hulls). gunHullClearance.test-support.mjs:
// every gun mesh sampled every 15 mm, the recoiling parts in battery and at 0.135 m, against every hull mesh.
//   - the barrel keeps 25 mm from its hull at every whole degree of turret yaw, at that yaw's published stop, at level
//     and at full elevation; the mount (mask, collar, searchlight, ports) keeps 20 mm there;
//   - negative control: at its bare -6 (no curve) each barrel comes within 25 mm of its hull somewhere.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep } from './gunHullClearance.test-support.mjs';

const T0 = Date.now(), MOUNT_KEEP = .020, BARREL_KEEP = .025, report = {};
for (const id of ['stb1', 'type74']) {
  const probe = gunHullProbe(id, { suit: false });
  try {
    const { spec } = probe;
    assert.equal(spec.gunDepressionDeg, 6, `${id}: the gun's own source depression`);
    assert.equal(spec.gunElevationDeg, 9, `${id}: the gun's own source elevation`);
    assert.ok(spec.hydropneumaticAim?.noseDownDeg >= 6 && spec.hydropneumaticAim?.noseUpDeg >= 6, `${id}: the hull pitch carries the rest`);
    assert.ok(spec.gunPitchByYawDeg, `${id}: publishes its gun curve`);
    const barrel = gunHullSweep(probe, spec, { partsAt: () => 'barrel' });
    assert.ok(barrel.d >= BARREL_KEEP - 1e-4, `${id}: the barrel keeps 25 mm from its hull at every yaw (${(barrel.d * 1000).toFixed(1)} mm at yaw ${barrel.yd}, pitch ${(barrel.pitch * 180 / Math.PI).toFixed(2)}, ${barrel.part})`);
    const mount = gunHullSweep(probe, spec, { partsAt: () => 'mount' });
    assert.ok(mount.d >= MOUNT_KEEP - 1e-4, `${id}: the mount keeps 20 mm from its hull at every yaw (${(mount.d * 1000).toFixed(1)} mm at yaw ${mount.yd}, pitch ${(mount.pitch * 180 / Math.PI).toFixed(2)}, ${mount.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: BARREL_KEEP, partsAt: () => 'barrel' });
    assert.ok(bare.d < BARREL_KEEP, `${id}: negative control: at its bare -${spec.gunDepressionDeg} the barrel comes within 25 mm of its hull`);
    report[id] = { barrelMm: +(barrel.d * 1000).toFixed(1), mountMm: +(mount.d * 1000).toFixed(1), stops: spec.gunPitchByYawDeg.length };
  } finally { probe.dispose(); }
}
console.log(`japaneseGunHull: ${JSON.stringify(report)}; both guns keep off their hulls at every yaw PASS (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
