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
  t72b3m_hetman: [], // 230: its mantlet chin 16 mm shallower (mantletChinLift), the mount 35.7 mm over the periscope
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
  strv121: [[140, 162]], // release 262: the mount over the engine deck's front quarters (the sweep's mountConflicts)
  m1a1: [],
  m1a1ha: [],
  m1a1_abrams_hc: [],
  m1a1_abrams_sa: [],
  m1a1_abrams_aim: [], // release 230: the glacis wind-sensor mast in the barrel's path at yaw 0-8 is gone (profiles/abrams.ts)
  m1a1_abrams_fep: [],
  m1a3: [], // 2026-10-28: the M1E3 rebuilt on the M1 hull (m1e3-264), its measured curve (m1a1GunLimits.ts)
  ua_m1a1: [],
  c1_ariete: [],
  c2_ariete: [],
  m3a3_bradley: [[0, 39]], // the mantlet's underside 11 mm over the roof at -9; the M3 keeps its full forward depression
  m6_linebacker: [],
  // release 230 (the gun-hull lane): the T-72B3's measured stops (t72b3XArmor.ts) and the T-72 Ryś on its raised ring
  // (t80uXArmor.ts T80U_X_RING_RAISE_M; before it, its mount stood in the deck through most of the traverse)
  t72b3: [],
  t72_rys: [],
  // 2026-10-26: the M48A5's trunnion at 2.10 under its compact shield; its measured curve (supplementalFleetSpecs.ts)
  m48a5_patton: [],
  // 262: the Leopard 1A5 proportion rebuild (deck 1.58, cast B&V turret); its measured curve (modern2.ts)
  leo1a5: [],
  // release 231: the fleet T-80U and T-80UK on the raised T-80U X ring
  t80u: [],
  t80uk: [],
  // release 231: the C1 Ariete pre-series, its hull under the turret's sweep and its mantlet raked (profiles/misc.ts)
  c1_ariete_preserie: [],
  // release 231: the Ariete prototypes, their turrets' undersides at the hull slab and the roof ahead of the turret at the
  // print's fore line (profiles/italy.ts)
  c1_ariete_proto_serie1: [],
  c2_ariete_proto: [],
  // release 231: the M1A2 X family, its turret race cover and race inside the turret's ring disc
  // (profiles/abramsSourceXHull.ts)
  m1a2_abrams: [],
  m1a2_abrams_tusk: [],
  m1a2_abrams_sepv2: [],
  m1a2_abrams_sepv3: [],
  ua_m1a2_abrams: [],
  // release 240: the rebuilt MBT-70 (its cast mantlet's chin raised over the glacis array, modern2.ts)
  mbt70: [],
  // 242: the turrets whose squash 235 moved off rig_turret (turretScaleGunPitch.ts; mount windows: the sweep's
  // mountConflicts, the geometry fixes to make)
  t90am: [[179,180]],
  t90m_proryv: [],
  t90a_burlak_proto: [],
  strv81: [[2,34],[124,150]],
  challenger_x: [],
  challenger_x_sleek: [],
  fv4034: [],
  challenger2: [],
  challenger2e: [[177,177]],
  fv510: [],
  fv510_milan: [],
  merkava1b: [],
  merkava2b: [],
  merkava2d: [],
  ua_challenger2: [[177,177]],
  challenger3_td: [], // 262: measured with the mantlet's lower edge 6 cm over the deck (no mount conflict)
  challenger3_td_rws: [],
  leo2a5: [],
  leo2a6m: [],
  merkava3c: [],
  merkava3_baz: [],
  merkava4b: [],
  t62mv1: [],
  leo2a2: [],
  leo2a3: [],
  // 252: the K2B on the K2 gun front, its mantlet's lower corner trimmed to 0.24 m under the bore (profiles/korea.ts)
  k2b: [],
  // 262 (cn-type59-longwei lane): the Type 59 and the new T-55A on the T-54/T-55 family construction (over the driver's
  // periscopes and headlights ahead, the rear drums astern) and the Longwei on its new 99A-pattern hull, all swept with
  // tools/gun-depression-sweep.mjs
  type59: [],
  t55a: [],
  ztz99_longwei: [],
  // 262: the true T-64s on t64Foundation.ts (the measured curves in t64Armor.ts)
  t64bm1m: [],
  t64bv: [],
  t64b1v_2022: [],
  pt64_tur: [],
};
// Tanks whose camouflage suit (ghillieSuit.ts, cut to the gun's own stops, so it regrows under any stop it is given) comes
// within 25 mm of the gun: the curve holds their hull stock and the suit's working clearance is the suit's to fix (the Type
// 96B's hull net 15.8 mm at yaw 29 at its stop, the Zubr II's rear leaves 23.8 mm at yaw 174 at its stop). Release 230 (the
// gun-hull lane): the C2 Ariete's glacis net (13.2 mm at yaw 8) and the Ukrainian M1A1's leaves (touching the gun at level
// at yaw 143 and under the mantlet at -10 ahead) were fixed in their suits and are held with them, and so are the Type 96B
// (clothClearsGunStops) and the Zubr II (conservativeGunEnvelope), regenerated on the combined turret tree. Release 245:
// the T-90AM's suit (its front-deck net 10.9 mm under the barrel at yaw 37, its rear leaves 19.3 mm from it at yaw 180,
// regrown under its measured curve) and the M1A2 TUSK's hull net (22 mm at yaw 124) keep 25 mm with clothClearsGunStops,
// and the T-90AM's engine-deck leaves with a centre lane under the gun turned aft.
const SUIT_TOO_CLOSE = new Set([]);
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
