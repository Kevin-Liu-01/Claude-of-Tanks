// Owner-directed enlarged supplied C1 and its explicitly derived C2. These
// metre datums are boot-light; the original source frame remains immutable.
import { ARIETE_SUPPLIED_X_DATUMS as SOURCE } from './arieteXSuppliedFrame.ts';

export const ARIETE_X_FAMILY_SCALE = 1.12;
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
  dims: { ...ARIETE_C1_X_DATUMS.dims },
  trackWidthM: .6497973 * S,
});

// Actual whole-barrel/hull sweeps reveal a local front-skirt shoulder and a
// separate engine-deck stop. Keep full depression through the useful sides.
const PITCH_FRONT_AND_SHOULDER = [
  [0, -9], [22, -9], [30, -6], [35, -5], [42, -7], [47, -9],
  [120, -9], [130, -7], [135, -5], [145, 0],
] as const;
export const ARIETE_C1_X_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  ...PITCH_FRONT_AND_SHOULDER, [170, 1], [180, 1],
] as const);
export const ARIETE_C2_X_GUN_PITCH_BY_YAW_DEG = Object.freeze([
  ...PITCH_FRONT_AND_SHOULDER, [160, 1], [170, 2], [180, 2],
] as const);
