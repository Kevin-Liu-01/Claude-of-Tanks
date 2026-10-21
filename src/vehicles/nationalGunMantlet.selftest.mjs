// Release 230 (UA/PL round 11): the main gun of Hetman II, the Zubr and the Zubr II over its own hull, on the round's
// geometry (gunHullClearance.test-support.mjs, the gun-depression lane's probe: every gun mesh sampled every 15 mm, the
// recoiling parts in battery and at 0.135 m, against every hull mesh but the camouflage suit, which ghillieSuit.ts cuts to
// the gun's own stops):
//   - the barrel keeps 25 mm from the hull at every whole degree of turret yaw, at that yaw's published stop
//     (NATIONAL_GUN_PITCH_BY_YAW, the lane's 26 mm rows), at level and at full elevation; the mount (mantlet, boot,
//     sights) keeps 20 mm there. The T-72B3M turret's mantlet underside passed 6-18 mm over the driver's hatch and
//     periscope at yaw 0-25 at every pitch and 5.5 mm over Hetman II's right deck cover at yaw -102, which no depression
//     stop cures: the three ids' mantlets take a 16 mm shallower chin (t72b3mX.ts mantletChinLift);
//   - negative controls: at its bare depression (no curve) each barrel comes within 25 mm of its hull; the fleet T-72B3M
//     (t72b3m_2016, the stock chin) brings its mount within 20 mm of its hull at yaw 0-25.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep } from './gunHullClearance.test-support.mjs';

const T0 = Date.now(), MOUNT_KEEP = .020, BARREL_KEEP = .025;
const IDS = process.env.GUN_MANTLET_IDS?.split(',') ?? ['t72b3m_hetman_ii', 't72b3_zubr', 't72b3_zubr_ii'];
const report = {};
for (const id of IDS) {
  const probe = gunHullProbe(id, { suit: false });
  try {
    const { spec } = probe;
    assert.ok(spec.gunPitchByYawDeg, `${id}: publishes its gun curve`);
    const barrel = gunHullSweep(probe, spec, { partsAt: () => 'barrel' });
    assert.ok(barrel.d >= BARREL_KEEP - 1e-4, `${id}: the barrel keeps 25 mm from its hull at every yaw (${(barrel.d * 1000).toFixed(1)} mm at yaw ${barrel.yd}, pitch ${(barrel.pitch * 180 / Math.PI).toFixed(2)}, ${barrel.part})`);
    const mount = gunHullSweep(probe, spec, { partsAt: () => 'mount' });
    assert.ok(mount.d >= MOUNT_KEEP - 1e-4, `${id}: the mount keeps 20 mm from its hull at every yaw (${(mount.d * 1000).toFixed(1)} mm at yaw ${mount.yd}, pitch ${(mount.pitch * 180 / Math.PI).toFixed(2)}, ${mount.part})`);
    // over the driver's hatch (yaw within 25 degrees of ahead) in particular
    const ahead = gunHullSweep(probe, spec, { partsAt: (a) => (a <= 25 ? 'mount' : null) });
    const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: BARREL_KEEP, partsAt: () => 'barrel' });
    assert.ok(bare.d < BARREL_KEEP, `${id}: negative control: at its bare -${spec.gunDepressionDeg} the barrel comes within 25 mm of its hull`);
    report[id] = { barrelMm: +(barrel.d * 1000).toFixed(1), mountMm: +(mount.d * 1000).toFixed(1), aheadMm: +(ahead.d * 1000).toFixed(1), at: [mount.yd, mount.part] };
  } finally { probe.dispose(); }
}
{
  const probe = gunHullProbe('t72b3m_2016', { suit: false });
  try {
    const ahead = gunHullSweep(probe, probe.spec, { stop: MOUNT_KEEP, partsAt: (a) => (a <= 25 ? 'mount' : null) });
    assert.ok(ahead.d < MOUNT_KEEP, `negative control: the stock T-72B3M mantlet comes within 20 mm of its hull ahead (${(ahead.d * 1000).toFixed(1)} mm)`);
  } finally { probe.dispose(); }
}
console.log(`nationalGunMantlet: ${JSON.stringify(report)}; the mantlet chin and the published curves keep the gun off the hull PASS (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
