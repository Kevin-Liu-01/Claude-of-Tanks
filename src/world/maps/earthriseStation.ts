// src/world/maps/earthriseStation.ts — Taurus-Littrow Station's plan (the Earthrise 228 rebuild, 2026-10-18), its own module so
// the map file's other rounds merge beside it (the Moon's version of marsSettlement.ts and deltaVillage.ts).
//
// The station is a planned base, not a ring of toys round an apron: every building stands on its plot (the kit builds
// its sintered pad, its berm or its slab over it, maps/regional/littrow.ts) along the two graded rover roads that cross
// at the hub apron (the landing field: zone 2 and the turbo-ball kickoff), each with its yard (the kit's YardStyle: a
// course of regolith bags, the EVA tool locker in the far corner). Four districts:
//   - north-east and south-west: the habitat rows — two bermed habitats with the airlock node between them and the rover
//     garage at the row's outer end, every porch turned to the hub;
//   - north-west: the logistics yard — the offloading crane over its pad and two banked rows of logistics modules along the
//     north road, the comms tower at the apron's corner, the water and hydrogen tank farm beyond;
//   - south-east: the oxygen works (a set piece, props.landmarks) where the logistics yard's rotation falls, the sample lab
//     at the apron's opposite corner, the oxygen tank farm beyond.
// Every site has its rotation partner about the landing field (0, 0) with an equal footprint, but the logistics yard's,
// which the works' plant takes; every plot stands 12 m or more off a carriageway and 35 m or more off an objective disc
// (the station receipt, earthriseStation.selftest.mjs). The sites are terraces in the props' sense (an authored site, its
// own stream, its author holding the footprints apart), so each stands exactly where it is written.
export interface StationSite {
  structure: string;
  x: number;
  z: number;
  yawDeg: number;
  terrace: true;
}

const site = (structure: string, x: number, z: number, yawDeg: number): StationSite => ({ structure, x, z, yawDeg, terrace: true });
/** A site's rotation partner about the landing field. */
const twin = (s: StationSite, structure = s.structure): StationSite => site(structure, -s.x, -s.z, ((s.yawDeg + 360) % 360) - 180);

/** The north-east habitat row: two habitats with the node between them, the garage at the row's end, porches to the hub. */
const HABITAT_ROW: readonly StationSite[] = [
  site('barn', 34, 48, -150),
  site('barn', 64, 30, -150),
  site('cottage', 54, 52, -150),
  site('schoolhouse', 88, 62, -150),
];

/** The logistics yard along the north road (its long axes the road's, its fronts to the road) and the comms tower. */
const LOGISTICS_YARD: readonly StationSite[] = [
  site('gantry', -46, 44, 73.3),
  site('containerRow', -48, 70, 73.3),
  site('containerRow', -74, 82, 73.3),
];

/** The station: the two habitat rows, the logistics yard, the comms tower and the sample lab, the two tank farms. */
export const EARTHRISE_STATION: readonly StationSite[] = [
  ...HABITAT_ROW,
  ...HABITAT_ROW.map((s) => twin(s)),
  ...LOGISTICS_YARD,
  // the comms tower at the apron's north-west corner and the sample lab at its south-east corner
  // (each just off the apron's hardstand, which no plot may stand on)
  site('mill', -48, 22, 180),
  site('chapel', 48, -22, 0),
  // the tank farms beyond the yard and the works, their long axes along their service lanes, their fronts to them
  site('farmhouse', -100, 80, 74.5),
  twin(site('farmhouse', -100, 80, 74.5)),
];

/** The oxygen works' plant (props.landmarks isruWorks) where the logistics yard's rotation falls, and its heading. */
export const ISRU_PLANT = Object.freeze({ x: 56, z: -65, yawDeg: 253.3 });
/** Challenger's site, its gate (local -z) toward the station, and the works' excavation front at its rotation. */
export const APOLLO_SITE = Object.freeze({ x: 150, z: 225, yawDeg: Math.round(Math.atan2(150, 225) * 1800 / Math.PI) / 10 });
export const EXCAVATION_FRONT = Object.freeze({ x: -150, z: -225, yawDeg: APOLLO_SITE.yawDeg - 180 });
