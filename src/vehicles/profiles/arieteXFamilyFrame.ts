// Owner-directed enlarged supplied C1 and its explicitly derived C2. These
// metre datums are boot-light; the original source frame remains immutable.
import { ARIETE_SUPPLIED_X_DATUMS as SOURCE } from './arieteXSuppliedFrame.ts';

export const ARIETE_X_FAMILY_SCALE = 1.12 * 1.10;
const S = ARIETE_X_FAMILY_SCALE;
const point = (p: readonly number[]): [number, number, number] =>
  [p[0] * S, p[1] * S, p[2] * S];

export const ARIETE_C1_X_DATUMS = Object.freeze({
  dims: { hullLengthM: SOURCE.dims.hullLengthM * S,
    overallLengthM: SOURCE.dims.overallLengthM * S,
    widthM: SOURCE.dims.widthM * S, heightM: SOURCE.dims.heightM * S },
  turretPivot: point(SOURCE.turretPivot), trunnion: point(SOURCE.trunnion),
  muzzleZ: SOURCE.muzzleZ * S, boreFloorZ: SOURCE.boreFloorZ * S,
  barrelLengthM: (SOURCE.muzzleZ - SOURCE.trunnion[2]) * S,
  barrelRadiusM: .12248 * S,
  boreRadiusM: .060, highestFittingM: SOURCE.highestFittingM * S,
  fixedOpticHeightM: SOURCE.fixedOpticHeightM * S,
  wheelRadiusM: SOURCE.wheelRadiusM * S, wheelX: SOURCE.wheelX * S,
  // The actual shared gear law seats the axle 0.647 mm above the old scalar.
  wheelY: (.045 + .012 + SOURCE.wheelRadiusM) * S,
  trackX: SOURCE.trackX * S, trackWidthM: .6097973 * S,
});

export const ARIETE_C2_X_DATUMS = Object.freeze({
  ...ARIETE_C1_X_DATUMS,
  dims: { ...ARIETE_C1_X_DATUMS.dims,
    overallLengthM: ARIETE_C1_X_DATUMS.dims.overallLengthM + ARIETE_C1_X_DATUMS.barrelLengthM * .22 },
  muzzleZ: ARIETE_C1_X_DATUMS.trunnion[2] + ARIETE_C1_X_DATUMS.barrelLengthM * 1.22,
  barrelLengthM: ARIETE_C1_X_DATUMS.barrelLengthM * 1.22,
  boreFloorZ: ARIETE_C1_X_DATUMS.trunnion[2] + (ARIETE_C1_X_DATUMS.boreFloorZ - ARIETE_C1_X_DATUMS.trunnion[2]) * 1.22,
  barrelRadiusM: ARIETE_C1_X_DATUMS.barrelRadiusM * 1.18,
  trackWidthM: .6497973 * S,
});

// Actual whole-barrel/hull sweeps reveal a local front-skirt shoulder and a
// separate engine-deck stop. Keep full depression through the useful sides.
// 2026-10-20 follow-up (tools/gun-depression-sweep.mjs: the whole gun 26 mm off every hull mesh at every degree,
// src/vehicles/nationalGunClearance.selftest.mjs): the C1 keeps its earlier stops and adds where they were short, the front
// skirt shoulder at 13-54 (down to -5 at 34-36) and the engine deck from 118.
export const ARIETE_C1_X_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  [0, -9], [13, -9], [16, -8.7], [20, -8.7], [23, -8], [29, -5.4], [32, -5.1], [34, -5], [36, -5], [37, -5.1],
  [47, -7.9], [49, -8], [54, -9], [118, -9], [130, -6.4], [140, -1.4], [143, -0.2], [144, 0.1], [168, 1], [180, 1],
] as const);
// The C2 likewise keeps its stops and adds where its hull stock (the camouflage suit left out: ghillieSuit.ts cuts it to
// these stops) was short: the glacis fittings and skirt shoulders at 3-58 (down to -4 at 34-36) and the engine deck from
// 112, up to +4 behind.
export const ARIETE_C2_X_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  [0, -8], [2, -8], [3, -7.1], [4, -6.5], [7, -6.3], [27, -5.2], [33, -4.1], [34, -4], [36, -4], [37, -4.1], [51, -7.4],
  [59, -9], [112, -9], [113, -8.6], [133, -5.2], [137, -3.2], [139, -0.4], [140, 0.4], [141, 0.6], [151, 1], [153, 1.8],
  [155, 2.1], [170, 3.3], [171, 3.5], [175, 3.9], [180, 4],
] as const);
