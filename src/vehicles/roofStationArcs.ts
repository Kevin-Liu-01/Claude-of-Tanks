// VH.14 (2026-10-15): traverse arcs that keep a roof station's sweep out of its vehicle's drone stand. The decorative guns
// the ruling made working stations swept a full circle through the stand's seat on these hulls (the seat generator
// found no clear roof, tools/gen-mission-attachment-seats.mjs). Each arc is station-local yaw in radians round the rest
// bearing, measured against the stand's seat by tools/roof-station-arcs.mjs --dock (2 degrees of margin each side).
// The T-62MV's and Type 59's DShK stand 0.8 m from their stands on small round roofs: with the launch interlock
// (coordinator ruling 2026-10-15: the guns park while their own drone launches) each keeps 210 or 260 degrees round its
// bow and the side away from the stand, and the stand sits in the gap (the T-62's to the gun's left rear, the Type 59's
// to its right rear). An arc authored on
// the station itself (userData.yawArc: the M551A1 TTS, the MBT-70, the ZTZ-99A2) takes precedence. tools/vehicle-controls-inventory.mjs
// writes these into the inventory the authority, the presentation and the stand seats read. The ZTZ-99A2's QJC-88 left
// this table on 2026-10-20: its own arc stops short of the commander's sight and ends at the stand's
// (profiles/china.ts, src/vehicles/ztz99a2RoofArc.selftest.mjs).
export const ROOF_STATION_ARCS: Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>> = Object.freeze({
  merkava1b: { merkavaRoofMag1: [-1.7802, 1.8326] },
  merkava2b: { merkavaRoofMag1: [-2.1118, 2.1642], merkavaRoofMag2: [-1.85, 1.885] },
  merkava4b: { merkavaRoofMag1: [-3.4034, 1.9897] },
  t62_1975: { fitting_browningDerived_dshk: [-2.618, 1.0472] },
  t72bu_1989: { t72buXRoofNsvt: [-3.5256, 0.384] },
  // 262: the rebuilt Type 59 seats its loader (and DShK) on the vehicle's right, as the real one does (the old build had
  // it mirrored). The drone dock stands on the dome's left rear (the only dome patch its stand and airframe clear), so
  // the DShK turns from 175 degrees right to 25 degrees left of ahead: past 25 degrees left its sweep (the authority's
  // 20-degree chunks) crosses the dock, and from 85 degrees the commander's cupola (.qa-dev arc and dock probes, 262)
  type59: { type59RoofDShK: [-3.0543, 0.4363] },
  m551_sheridan: { m551CommanderM2: [-2.1118, 2.042], m551LoaderMg: [-2.2864, 2.3562] },
  t90: { t90XMountedNsvt: [-1.693, 1.7453] },
});
