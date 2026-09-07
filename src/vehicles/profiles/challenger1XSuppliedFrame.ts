// Fixed authoring ruler approved before the supplied-file rebuild. These are
// scalar measurements, not a runtime source transform or imported geometry.
export type ChallengerPoint = readonly [number, number, number];
const SCALE = .022766597878026665;
const OFFSET: ChallengerPoint = [.000448134021952124, .002688968328105816, 1.225273105020766];
export const c1Length = (raw: number): number => raw * SCALE;
export function c1Point(x: number, y: number, z: number): [number, number, number] {
  return [x * SCALE + OFFSET[0], y * SCALE + OFFSET[1], z * SCALE + OFFSET[2]];
}
export const CHALLENGER1_SUPPLIED_DATUMS = Object.freeze({
  dims: { hullLengthM: 6.42125612, overallLengthM: 9.84520918, widthM: 3.51, heightM: 2.19061285 },
  structuralRoofY: 2.19061285, highestFittingM: 3.70270926,
  turretPivot: c1Point(-.059055, 61.2204705, -26.7519695) as ChallengerPoint,
  trunnion: c1Point(-.669291, 73.464565, 20.748032) as ChallengerPoint,
  muzzleZ: c1Point(-.669291, 73.464565, 216.220474)[2],
  // Actual octagonal source throat; cardinal bounds, circumcircle and
  // nominal120 mm donor gameplay caliber are distinct quantities.
  visualBoreAcrossCardinalBoundsM: c1Length(4.409449),
  visualBoreCircumdiameterM: c1Length(2 * 2.383416),
});
