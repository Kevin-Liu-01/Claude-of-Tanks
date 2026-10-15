// VH.14 (2026-10-15): traverse arcs that keep a roof station's sweep out of its vehicle's drone stand. The decorative guns
// the ruling made working stations swept a full circle through the stand's seat on these hulls (the seat generator
// found no clear roof, tools/gen-mission-attachment-seats.mjs). Each arc is station-local yaw in radians round the rest
// bearing, measured against the stand's seat by tools/roof-station-arcs.mjs --dock (2 degrees of margin each side);
// the T-62's DShK and the Type 59's DShK stood over their old seats at rest, so they take the front and flank arc of a
// loader's AA gun (120 degrees each side) and their stands moved to the rear the arc leaves clear. An arc authored on
// the station itself (userData.yawArc: the M551A1 TTS, the MBT-70) takes precedence. tools/vehicle-controls-inventory.mjs
// writes these into the inventory the authority, the presentation and the stand seats read.
export const ROOF_STATION_ARCS: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>> = Object.freeze({
  merkava1b: { merkavaRoofMag1: [-1.7802, 1.8326] },
  merkava2b: { merkavaRoofMag1: [-2.1118, 2.1642], merkavaRoofMag2: [-1.85, 1.885] },
  merkava4b: { merkavaRoofMag1: [-3.4034, 1.9897] },
  t62mv1: { fitting_browningDerived_dshk: [-2.0944, 2.0944] },
  t72bu: { t72buXRoofNsvt: [-3.5256, 0.384] },
  type59: { type59RoofDShK: [-2.0944, 2.0944] },
  ztz85_iii: { fitting_browningDerived_qjc88: [-0.8029, 2.7925] },
  ztz99a2: { fitting_browningDerived_qjc88: [-1.7104, 1.6581] },
  m551_sheridan: { m551CommanderM2: [-2.1118, 2.042], m551LoaderMg: [-2.2864, 2.3562] },
  t90_x: { t90XMountedNsvt: [-1.693, 1.7453] },
});
