// Kevin B. Liu — mechanical stops measured from the authored M1A1 rigs.
// These are model clearance envelopes, not historical gun-performance claims.
// Yaw is absolute and hull-relative; the front keeps its full ten-degree
// depression. Rear deck, side stowage and camouflage require local stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

// 2026-10-20 follow-up (tools/gun-depression-sweep.mjs: the whole gun 26 mm off every hull mesh at every degree,
// src/vehicles/nationalGunClearance.selftest.mjs): each curve keeps its stops and adds the sectors that were short.
// BARE: the front skirt shoulders at 18-40 (-9.7) and the engine deck from 128 (-4 at 136, +0.9 by 148).
// Release 268 builder E (owner, 2026-11-03: "mantlet and cannon ... match the model"): the M256 on the owner's model's
// 1.875 m axis (6.7 cm lower) with its 0.182 m bore evacuator at 1.28-1.78 m out: over the front fenders' arch above the
// idler at 27-37 (-8.4), the engine deck from 126 (0 at 142) and astern to +2.6 (+3 at 160-162, the HA's deck stowage).
// tools/gun-depression-sweep.mjs --envelope (m1a1, m1a1ha, m1a1_abrams_hc, 26 mm) --keep-published: stops only added.
const BARE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [4,-10], [6,-9.8], [10,-9.8], [13,-9.9], [14,-10], [16,-10], [27,-9.1], [31,-8.4], [34,-8.4], [35,-8.6], [37,-9.8],
  [43,-9.8], [44,-10], [126,-10], [136,-2.8], [137,-2.1], [138,-1.6], [142,0], [143,1], [144,1.5], [149,1.8],
  [157,2], [160,3], [162,3], [166,2.5], [172,2.6], [178,2.6], [180,2.2],
]);
// URBAN: the front quarters at 18-42 and, over the rear stowage, the mantlet's underside at 118-149 (up to +3.4).
// Release 268 builder E: the lower, model-measured M256 (BARE above) over the TUSK kit's front quarter at 26-31 (-3.1)
// and astern to +2.6 (--keep-published, 26 mm).
const URBAN: GunPitchByYawCurve = Object.freeze([
  [0,-10], [4,-10], [6,-9.8], [10,-9.8], [13,-9.9], [14,-10], [16,-10], [20,-7], [21,-6], [22,-5.2], [23,-5], [25,-5],
  [26,-3.9], [27,-3.2], [28,-3.1], [30,-3.1], [31,-3.3], [32,-4.1], [34,-5.5], [43,-9.8], [44,-10], [106,-10],
  [107,-9.4], [109,-5.6], [111,-1.2], [112,0.5], [113,1], [116,1.5], [117,2.3], [118,2.8], [121,3.4], [141,3.4],
  [142,3.3], [145,2.5], [147,2.5], [148,3.3], [151,9.1], [152,10.5], [153,11], [169,11], [170,10.5], [171,9],
  [174,3], [178,2.6], [180,2.2],
]);
// REAR_STOWAGE: the front skirt shoulders at 17-44 (-8.4) and the engine deck from 128. Dead ahead (yaw 0-8) the full
// depression holds since release 230 (the gun-hull lane removed the glacis wind-sensor mast that stood in the barrel's
// own path at every pitch below +11; profiles/abrams.ts).
// Release 268 builder E: the lower, model-measured M256 (BARE above): the engine deck from 126 and astern to +2.6
// (--keep-published, 26 mm).
const REAR_STOWAGE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [4,-10], [6,-9.8], [10,-9.8], [13,-9.9], [14,-10], [15,-10], [20,-9.2], [21,-8.7], [22,-8.4], [44,-8.4], [46,-10],
  [126,-10], [136,-2.8], [137,-2.1], [138,-1.6], [142,0], [143,1], [144,1.5], [147,1.7], [149,5], [151,9],
  [152,10.5], [153,11], [169,11], [170,10.5], [171,9], [174,3], [178,2.6], [180,2.2],
]);
// Release 268 builder E: the lower, model-measured M256 (BARE above) under the FEP's net (--keep-published, 26 mm).
const NETTED: GunPitchByYawCurve = Object.freeze([
  [0,-10], [4,-10], [6,-9.8], [10,-9.8], [13,-9.9], [14,-8.9], [18,-0.1], [19,1], [46,1], [47,0.8], [51,-0.8], [52,-1.5],
  [56,-5.5], [60,-5.8], [88,-5], [91,-5], [92,-5.1], [96,-5.9], [97,-6.2], [99,-7], [103,0.1], [104,1], [131,1],
  [132,0.6], [135,-1.8], [137,-1.6], [144,1.5], [148,4.6], [149,5], [164,5], [165,4.8], [169,2.6], [178,2.6], [180,2.2],
]);
// Release 268 builder E: the lower, model-measured M256 (BARE above) under the UA's suit, its hull net trimmed under the
// gun (ghillieSuit.ts gunStopTrimM) so the full depression holds ahead (--keep-published, 26 mm).
const UKRAINIAN: GunPitchByYawCurve = Object.freeze([
  [0,-10], [3,-10], [5,-9.8], [11,-9.8], [13,-10], [14,-8.9], [18,-0.1], [19,1.4], [23,4.6], [24,5], [61,5],
  [62,4.3], [66,-1.3], [68,-2.1], [81,-2.9], [82,-3.5], [86,-7.5], [89,-8], [93,-8], [95,-6.2], [98,-2.6], [99,-2],
  [139,-1.7], [143,1], [144,1.5], [149,1.8], [157,2], [160,3], [162,3], [166,2.5], [172,2.6], [178,2.6], [180,2.2],
]);

// M1E3 (m1a3, rebuilt 2026-10-28 in m1e3-264 on the M1 hull loft, its own turret and a 4.95 m gun from a trunnion
// 0.56 m further back): the front fender caps at 13-41 (-8 at 24), the engine deck from 127 and, over the rear shoulder
// chests, up to +1.2 at 155 (tools/gun-depression-sweep.mjs, 26 mm, --no-suit, fitted with --envelope).
const M1E3: GunPitchByYawCurve = Object.freeze([
  [0,-10], [10,-10], [13,-9.6], [17,-9.5], [19,-8.3], [24,-8], [33,-8.5], [36,-9], [41,-10], [126,-10], [127,-9.3],
  [130,-5], [131,-3.7], [132,-2.6], [135,-0.5], [136,0], [139,0], [140,-0.2], [142,-1.4], [147,-1.5], [148,-1],
  [149,0.5], [150,0.9], [155,1.2], [161,1], [163,0.8], [164,0.2], [165,-1], [167,-0.8], [180,-0.8],
]);

export const M1A1_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  m1a1: BARE, m1a1ha: BARE, m1a1_abrams_hc: BARE,
  m1a1_abrams_sa: URBAN, m1a1_abrams_aim: REAR_STOWAGE,
  m1a1_abrams_fep: NETTED, ua_m1a1: UKRAINIAN,
});
// The M1E3 rides the same apply step but is no M256-mount M1A1: tools/m1a1-fill-clearance.mjs reads only the table above.
const M1_HULL_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({ m1a3: M1E3 });

// Apply after derivative construction: the modern M1A2 models have their own
// unrelated frame and must not inherit the legacy donor's mechanical stops.
export function applyM1A1GunLimits(specs: TankSpecRegistry): void {
  for (const [id, curve] of [...Object.entries(M1A1_GUN_PITCH_BY_YAW), ...Object.entries(M1_HULL_GUN_PITCH_BY_YAW)]) {
    const spec = specs[id];
    if (spec) spec.gunPitchByYawDeg = curve;
  }
}
