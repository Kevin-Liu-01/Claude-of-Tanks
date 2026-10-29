// Kevin B. Liu — mechanical stops measured from the authored M1A1 rigs.
// These are model clearance envelopes, not historical gun-performance claims.
// Yaw is absolute and hull-relative; the front keeps its full ten-degree
// depression. Rear deck, side stowage and camouflage require local stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

// 2026-10-20 follow-up (tools/gun-depression-sweep.mjs: the whole gun 26 mm off every hull mesh at every degree,
// src/vehicles/nationalGunClearance.selftest.mjs): each curve keeps its stops and adds the sectors that were short.
// BARE: the front skirt shoulders at 18-40 (-9.7) and the engine deck from 128 (-4 at 136, +0.9 by 148).
const BARE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [18,-10], [25,-9.7], [33,-9.7], [40,-10], [128,-10], [136,-4], [138,-2.4], [139,-1.8], [148,0.9],
  [149,1], [180,1],
]);
// URBAN: the front quarters at 18-42 and, over the rear stowage, the mantlet's underside at 118-149 (up to +3.4).
const URBAN: GunPitchByYawCurve = Object.freeze([
  [0,-10], [18,-10], [21,-7.5], [23,-5.5], [24,-5], [31,-5], [32,-5.3], [40,-9.4], [42,-10], [108,-10],
  [109,-8.9], [113,-0.1], [114,1], [117,1], [118,2], [119,2.6], [122,3.3], [132,3.4], [139,3.4], [141,3.2],
  [142,2.5], [148,2.4], [149,2.3], [153,10], [154,11], [168,11], [169,10], [173,2], [174,1], [180,1],
]);
// REAR_STOWAGE: the front skirt shoulders at 17-44 (-8.4) and the engine deck from 128. Dead ahead (yaw 0-8) the full
// depression holds since release 230 (the gun-hull lane removed the glacis wind-sensor mast that stood in the barrel's
// own path at every pitch below +11; profiles/abrams.ts).
const REAR_STOWAGE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [17,-10], [21,-9.5], [23,-8.5], [28,-8.4], [41,-8.4], [43,-8.5], [44,-10], [128,-10], [136,-4],
  [138,-2.4], [139,-1.8], [148,0.9], [149,2], [153,10], [154,11], [168,11], [169,10], [173,2], [174,1], [180,1],
]);
const NETTED: GunPitchByYawCurve = Object.freeze([
  [0,-10], [15,-10], [20,1], [45,1], [50,-1], [55,-6],
  [90,-5], [95,-6], [100,-8], [105,1], [130,1], [135,-3],
  [145,1], [150,5], [163,5], [170,1], [180,1],
]);
const UKRAINIAN: GunPitchByYawCurve = Object.freeze([
  [0,-10], [15,-10], [20,1], [25,5], [60,5], [65,-2],
  [80,-3], [85,-8], [95,-8], [100,-2], [140,-2], [145,1],
  [180,1],
]);

// M1E3 (m1a3, rebuilt 2026-10-28 in m1e3-264 on the M1 hull loft, its own turret and a 4.45 m gun from a trunnion
// 0.56 m further back): the front fender caps at 13-41 (-8 at 24), the engine deck from 127 and, over the rear shoulder
// chests, up to +1.2 at 155 (tools/gun-depression-sweep.mjs, 26 mm, --no-suit, fitted with --envelope).
const M1E3: GunPitchByYawCurve = Object.freeze([
  [0,-10], [10,-10], [13,-9.6], [17,-9.5], [19,-8.3], [24,-8], [33,-8.5], [36,-9], [41,-10], [126,-10], [127,-9.3],
  [130,-5], [131,-3.7], [132,-2.6], [135,-0.5], [136,0], [139,0], [140,-0.2], [142,-1.4], [147,-1.5], [148,-1],
  [149,0.4], [150,0.9], [155,1.2], [161,1], [163,0.8], [164,0.2], [165,-1], [167,-0.8], [180,-0.8],
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
