// src/world/civic/plans/badlands.ts — Redrock Divide's civic plan (the maps lane, 229 b3; the owner, 2026-10-19: "expand
// its breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). Rum village, Wadi
// Rum, 2008; world metres, north +z, east +x.
//
// The square (pad 0, 60 x 60 at (8, 0); zone 2 and the turbo kickoff at its middle) stood as a sand lot between the
// Desert Patrol's fort on its east side and the souq's shop row facing it across the valley track. It becomes the fort's
// forecourt: the wadi's own packed sand kept and the middle left open (the zone; no inlay: no nation's symbol, the flag
// rule), sand-tone interlocking pavers before the fort's gate and before the souq row, date palms in their block planters
// along both, mastaba benches between them, the Bedouin guides' Hiluxes and Land Cruisers parked at the square's north
// and south edges. No lamps (the village's own), no monument.
//
// The village is rotationally symmetric about (8, 0): every piece has its twin at (16 - x, -z). The bots' routes (the 229
// routeheat probe: 169 of 560 cross the square) converge on the middle from the north-west and the north-east, and
// cross it on the 25 m lattice's diagonals and the x = 25 and z = 25 lines; those corridors, their twins and the track
// stay empty, which leaves the square's east and west edges and its north and south bands.
//
// Pathways: none (sand lanes).
import type { CivicBed, CivicFurniture, CivicPlan, CivicPoint, CivicRect } from '../types.ts';

const CX = 8, CZ = 0;
const rot = (x: number, z: number): [number, number] => [+(2 * CX - x).toFixed(2), +(2 * CZ - z).toFixed(2)];
const twins = (list: readonly CivicFurniture[]): CivicFurniture[] => list.flatMap((f) => {
  const [x, z] = rot(f.x, f.z);
  return [f, { ...f, x, z, yawDeg: (f.yawDeg + 180) % 360 }];
});
const corridor = (from: CivicPoint, to: CivicPoint, half: number) => [{ from, to, half }, { from: rot(from[0], from[1]), to: rot(to[0], to[1]), half }];
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);
// the track's own heading (the village's frame: u along the track toward the north mouth)
const TRACK_YAW = 13.5;

// the date palms along the fort's front (east) and the souq's (west, the twins), and one each in the north and south bands
const PALMS_EAST: ReadonlyArray<readonly [number, number]> = [[35.5, -6], [36.5, 6], [37.5, 18]];
// and two in the islands of sand the lanes leave between them (a smaller planter: the lanes either side)
const PALMS_ISLAND: ReadonlyArray<readonly [number, number]> = [[19.4, 4.0], [3.8, 19.8]];
const withTwins = (list: ReadonlyArray<readonly [number, number]>) => list.flatMap(([x, z]) => {
  const [tx, tz] = rot(x, z);
  return [{ x, z }, { x: tx, z: tz }];
});
const PALMS = withTwins([...PALMS_EAST, [-12, 34]]), ISLANDS = withTwins(PALMS_ISLAND);
/** A palm's block planter: a square bed `size` m across (its wall the planter's), closed. */
const planter = (x: number, z: number, id: string, size = 2.6): CivicBed => {
  const h = size / 2;
  const r: CivicRect = { x0: +(x - h).toFixed(2), x1: +(x + h).toFixed(2), z0: +(z - h).toFixed(2), z1: +(z + h).toFixed(2) };
  return { id, rect: r, mouths: [], paths: [], feature: null };
};

export const BADLANDS_CIVIC_PLAN: CivicPlan = {
  mapId: 'badlands',
  style: 'wadirum',
  overlay: {},
  pathways: null,
  areas: [{
    id: 'saha',
    room: { x0: -24, x1: 40, z0: -38, z1: 38 },
    // (the pad's own packed sand: with no lawn the terrain leaves its paint; the grass keeps off the square)
    paved: { x0: -22, x1: 38, z0: -30, z1: 30 },
    frontage: false,
    rinnen: [],
    vetoExempt: ['lamp'],
    keepOuts: [],
    // the patrol's checkpoint hut north of the middle (a single piece without its twin: the halves' cover) and its drums
    clears: [{ rect: { x0: -24, x1: 40, z0: -38, z1: 38 }, kinds: ['checkpointhut', 'drum', 'drumred'] }],
    pad: 0,
    arms: [],
    // (the 229 routeheat) into the middle from the north-west and the north-east lattice nodes, the z = 25 and x = 25
    // lines, the north-east-to-south-west diagonal; each with its twin; and the valley track through the square
    corridors: [
      ...corridor([-50, 28], [-25, 26], 5), ...corridor([-25, 26], [CX, CZ], 5),
      ...corridor([25, 50], [25, 25], 5), ...corridor([25, 25], [CX, CZ], 5),
      ...corridor([-25, 25], [25, 25], 4), ...corridor([25, 25], [25, -25], 4), ...corridor([25, -25], [-25, 25], 4),
      { from: [-28, -150], to: [44, 150], half: 7 },
    ],
    lanes: [],
    holds: [],
    centre: { x: CX, z: CZ, ringR: [8.5, 9.0], roseR: 3, rays: 8, inlay: false },
    beds: [...PALMS.map((p, i) => planter(p.x, p.z, `palm-${i}`)), ...ISLANDS.map((p, i) => planter(p.x, p.z, `island-${i}`, 2.0))],
    paving: [],
    // the pavers before the fort's gate (its west front runs along the track's heading) and, the twin, before the souq row
    strips: [
      { from: [37.6, -14], to: [40.5, -2], width: 3.6, kind: 'pavers' },
      { from: rot(37.6, -14), to: rot(40.5, -2), width: 3.6, kind: 'pavers' },
    ],
    monument: null,
    trees: { species: 'palm', scale: [0.95, 1.1], stations: [...PALMS, ...ISLANDS] },
    furniture: twins([
      // the mastaba benches between the palms along the fort's front, facing the square
      { kind: 'bench', x: 36.4, z: 0, yawDeg: -90 + TRACK_YAW }, { kind: 'bench', x: 37.3, z: 12, yawDeg: -90 + TRACK_YAW },
      // and in the north band under its palm
      { kind: 'bench', x: -8.5, z: 34, yawDeg: 180 },
      // one in the north-east corner facing the middle, two on the lane's edge before the palms
      { kind: 'bench', x: 31.5, z: 29, yawDeg: facing(31.5, 29, CX, CZ) },
      { kind: 'bench', x: 30.9, z: 13, yawDeg: -90 }, { kind: 'bench', x: 30.9, z: 20, yawDeg: -90 },
    ]),
    // the guides' Hilux and Land Cruiser at the square's north edge (their twins at the south)
    parking: twins([{ kind: 'pickup', x: -2, z: 34.5, yawDeg: 90 }, { kind: 'jeep', x: 4.5, z: 35, yawDeg: 90 }]),
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    // (the planters draw their own soil and sward: no terrain lawn, so the pad keeps its own paint)
    lawns: [],
    // (the lanes cross the square's middle: the sand they leave beside their edges is the open share)
    targets: { records: 16, benches: 12, lawnM2: 0, lampsAround: 0, openShare: 0.1, largestDisc: 8 },
  }],
};
