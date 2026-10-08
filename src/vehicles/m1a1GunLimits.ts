// Kevin B. Liu — mechanical stops measured from the authored M1A1 rigs.
// These are model clearance envelopes, not historical gun-performance claims.
// Yaw is absolute and hull-relative; the front keeps its full ten-degree
// depression. Rear deck, side stowage and camouflage require local stops.
import type { GunPitchByYawCurve } from '../sim/gunPitchLimits.ts';
import type { TankSpecRegistry } from './specContracts.ts';

const BARE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [130,-10], [140,-2], [150,1], [180,1],
]);
const URBAN: GunPitchByYawCurve = Object.freeze([
  [0,-10], [20,-10], [25,-5], [30,-5], [35,-8], [40,-10],
  [110,-10], [115,1], [145,1], [150,1], [155,11], [167,11],
  [172,1], [180,1],
]);
const REAR_STOWAGE: GunPitchByYawCurve = Object.freeze([
  [0,-10], [130,-10], [140,-2], [150,1], [155,11], [167,11],
  [172,1], [180,1],
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

export const M1A1_GUN_PITCH_BY_YAW: Readonly<Record<string, GunPitchByYawCurve>> = Object.freeze({
  m1a1: BARE, m1a1ha: BARE, m1a2: BARE,
  m1a2_tusk: URBAN, m1a2_sepv2: REAR_STOWAGE,
  m1a2_sepv3: NETTED, ua_m1a1: UKRAINIAN,
});

// Apply after derivative construction: the modern M1A2 models have their own
// unrelated frame and must not inherit the legacy donor's mechanical stops.
export function applyM1A1GunLimits(specs: TankSpecRegistry): void {
  for (const [id, curve] of Object.entries(M1A1_GUN_PITCH_BY_YAW)) {
    const spec = specs[id];
    if (spec) spec.gunPitchByYawDeg = curve;
  }
}
