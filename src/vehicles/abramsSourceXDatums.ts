// Boot-light scalar authoring frame. Measurements come from the selected
// local SEP v2 study; no mesh data or rendering dependencies live here.
// OBJ has no skeleton: these bearing/bore-based pivots are inferred joints.
export const ABRAMS_SOURCE_X_FRAME = Object.freeze({
  turret: [-.000286, 1.513295, .392712] as [number, number, number],
  gun: [-.020003, 1.849085, 1.396] as [number, number, number],
});

export const ABRAMS_SOURCE_X_MEASUREMENTS = Object.freeze({
  structuralHullLengthM: 7.95389,
  overallLengthM: 9.82426,
  standardWidthM: 3.66219,
  rectangularUrbanArmorWidthM: 4.06304,
  curvedUrbanArmorWidthM: 4.39543,
  muzzleZ: 5.809425,
  barrelRadiusM: .09043,
  // Antenna-inclusive span is NOT the vehicle's published roof height.
  antennaTopM: 4.176975,
  turretRoofM: 2.360795,
});

