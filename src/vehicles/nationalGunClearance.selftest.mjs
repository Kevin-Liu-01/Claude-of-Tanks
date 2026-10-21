// Release 227 follow-up (the CN lane's cnClearance check 1, carried to the other national concepts and the fleet's
// published curves): the main gun keeps 25 mm from its own hull at every whole degree of turret yaw, at that yaw's
// published depression stop (sim/gunPitchLimits.ts), at level and at full elevation (gunHullClearance.test-support.mjs:
// every gun mesh, the recoiling parts in battery and at 0.135 m, against every hull mesh, nets included; gun samples
// inside the turret's own outline are not measured). The curves were measured with tools/gun-depression-sweep.mjs at
// 26 mm. Negative control: the same gun at its bare depression (no curve) comes within 25 mm of its hull.
// A tank whose gun mount (mantlet, boot) stands in a known conflict with its hull at some yaws, which no depression stop
// cures (the sweep's mountConflicts), lists those yaw windows (absolute degrees): there only the barrel is held to 25 mm,
// and the window is the owning lane's geometry fix to make.
import assert from 'node:assert/strict';
import { gunHullProbe, gunHullSweep, GUN_HULL_KEEP_M } from './gunHullClearance.test-support.mjs';

const DEG = Math.PI / 180, T0 = Date.now();
/** id -> the yaw windows [from, to] (absolute degrees) where its gun mount stands in a known conflict with the hull, or
 * [from, to, 'skip'] where a hull fitting stands in the barrel's own path at every pitch (a geometry defect, not held). */
const CURVES = {
  t72b3m_hetman: [[0, 25]],
  t72b3m_hetman_ii: [[0, 26], [48, 133]],
  t72b3_sich: [],
  t72b3_zubr: [[0, 22]],
  t72b3_zubr_ii: [[0, 22]],
  t80u_zoria: [],
  t80u_husarz: [],
  t72b3m_wilk: [],
  t80u_bars_m: [],
  t72b3m_bulat_m: [],
  t72b3_bastion_m: [],
  type96b: [],
  type96_72_long: [],
  type96_80_feng: [],
  type96_72m_lei: [],
  m1a1: [],
  m1a1ha: [],
  m1a1_abrams_hc: [],
  m1a1_abrams_sa: [],
  m1a1_abrams_aim: [], // release 230: the glacis wind-sensor mast in the barrel's path at yaw 0-8 is gone (profiles/abrams.ts)
  m1a1_abrams_fep: [],
  ua_m1a1: [],
  c1_ariete: [],
  c2_ariete: [],
  m3a3_bradley: [[0, 39]], // the mantlet's underside 11 mm over the roof at -9; the M3 keeps its full forward depression
  m6_linebacker: [],
  // release 230 (the gun-hull lane): the T-72B3's measured stops (t72b3XArmor.ts) and the T-72 Ryś on its raised ring
  // (fleetRenewalSpecs.ts T72_RYS_RING_RAISE_M; before it, its mount stood in the deck through most of the traverse)
  t72b3: [],
  t72_rys: [],
};
// Tanks whose camouflage suit (ghillieSuit.ts, cut to the gun's own stops, so it regrows under any stop it is given) comes
// within 25 mm of the gun: the curve holds their hull stock and the suit's working clearance is the suit's to fix (the Type
// 96B's hull net 15.8 mm at yaw 29 at its stop, the Zubr II's rear leaves 23.8 mm at yaw 174 at its stop). Release 230 (the
// gun-hull lane): the C2 Ariete's glacis net (13.2 mm at yaw 8) and the Ukrainian M1A1's leaves (touching the gun at level
// at yaw 143 and under the mantlet at -10 ahead) were fixed in their suits and are held with them; the Type 96B and the
// Zubr II follow on the turret-upgrades tree.
const SUIT_TOO_CLOSE = new Set(['type96b', 't72b3_zubr_ii']);
// GUN_CLEARANCE_IDS=<ids> limits a local run (the suite runs them all)
const ids = process.env.GUN_CLEARANCE_IDS?.split(',') ?? Object.keys(CURVES);
for (const id of ids) {
  const t0 = Date.now(), probe = gunHullProbe(id, { suit: !SUIT_TOO_CLOSE.has(id) }), windows = CURVES[id] ?? [];
  try {
    const { spec } = probe, partsAt = (yd) => {
      const w = windows.find(([a, b]) => yd >= a && yd <= b);
      return !w ? 'all' : w[2] === 'skip' ? null : 'barrel';
    };
    assert.ok(spec.gunPitchByYawDeg, `${id}: publishes its measured gunPitchByYawDeg`);
    const worst = gunHullSweep(probe, spec, { partsAt });
    assert.ok(worst.d >= GUN_HULL_KEEP_M - 1e-4, `${id}: the main gun (${worst.parts}) keeps 25 mm from its hull at every yaw `
      + `(${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd}, pitch ${(worst.pitch / DEG).toFixed(2)} deg, from ${worst.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: GUN_HULL_KEEP_M, partsAt });
    assert.ok(bare.d < GUN_HULL_KEEP_M, `${id}: negative control: without its curve the gun at -${spec.gunDepressionDeg} deg comes within 25 mm `
      + `of its hull (its nearest approach ${(bare.d * 1000).toFixed(2)} mm)`);
    if (process.env.GUN_CLEARANCE_PROGRESS) console.error(`  ${id}: ${(worst.d * 1000).toFixed(2)} mm at yaw ${worst.yd}; bare: first approach `
      + `under 25 mm at yaw ${bare.yd} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  } finally { probe.dispose(); }
}
console.log(`nationalGunClearance: ${ids.length} published curves keep each main gun 25 mm from its hull at every yaw and legal pitch; `
  + `each bare depression meets the hull PASS (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
