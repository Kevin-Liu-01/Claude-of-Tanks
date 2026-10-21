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
// the track's own heading (the village's frame: u along the track toward the north mouth)
const TRACK_YAW = 13.5;

// the date palms along the fort's front (east) and the souq's (west, the twins), and one each in the north and south bands
// (229 b3 r2, the coordinator's ruling: no piece on a driven line; probes/pace's six zone and six Frontline base battles)
// the fort front's south palm (its twin on the zone's lines) to the north-east corner, the north band's to its west end,
// the islands' palms between the lanes left out (the hulls cross them)
// (229 b3 r3, D1: the fort front's south palm stood 29.1 m from zone 2's middle, its north one in line-2's disc) the
// south one north of the fort's block beside the guides' cars, the north one out to the north-east corner (both seats
// and their twins quiet: probes/pace, six zone and six Frontline base battles)
const PALMS_EAST: ReadonlyArray<readonly [number, number]> = [[44, 9], [37.5, 18], [45, 26]];
const PALMS_ISLAND: ReadonlyArray<readonly [number, number]> = [];
// (229 b3 r1, the critic's D9: a palm and its twin each the same height, the pairs a little apart)
const withTwins = (list: ReadonlyArray<readonly [number, number]>) => list.flatMap(([x, z], i) => {
  // (229 b3 r3, the gameplay critic's D6: the pairs still differed 0.54-0.68 m, the form's noise read at each place) both
  // read at the first's place
  const [tx, tz] = rot(x, z), scale = +(0.96 + ((i * 37) % 13) / 100).toFixed(2), noiseAt = [x, z] as const;
  return [{ x, z, scale, noiseAt }, { x: tx, z: tz, scale, noiseAt }];
});
const PALMS = withTwins([...PALMS_EAST, [-17.5, 33.5]]), ISLANDS = withTwins(PALMS_ISLAND);
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
    // (229 b3 r3, the gameplay critic's D1 and the coordinator's ruling: zone and line discs get flat work only) zone 2's
    // disc and Frontline line-2's hold the plan's pieces out (the map's own stay the map's)
    holds: [{ id: 'zone-2', x: CX, z: CZ, r: 30, planOnly: true }, { id: 'line-2', x: 14.5, z: 39.4, r: 30, planOnly: true }],
    centre: { x: CX, z: CZ, ringR: [8.5, 9.0], roseR: 3, rays: 8, inlay: false },
    // (229 b3 r3) a palm past the forecourt's edge (beside the guides' cars, at the north-east corner, and their twins)
    // stands in the wadi's sand without a block planter: the planters are the forecourt's
    beds: [...PALMS.filter((p) => Math.abs(p.x - CX) <= 32 - 1.3 && Math.abs(p.z) <= 38 - 1.3).map((p, i) => planter(p.x, p.z, `palm-${i}`)),
      ...ISLANDS.map((p, i) => planter(p.x, p.z, `island-${i}`, 2.0))],
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
      // (229 b3 r3, D1: the gate's bench stood 28.4 m from zone 2's middle) under the new south palm instead
      { kind: 'bench', x: 44, z: 13, yawDeg: -90 + TRACK_YAW }, { kind: 'bench', x: 38.5, z: 14.5, yawDeg: -90 + TRACK_YAW },
      // and in the north band under its palm
      { kind: 'bench', x: -19.5, z: 32.5, yawDeg: 180 },
      // (229 b3 r3, D1: the lane-edge bench rammed in 3 of 12 base battles: left out)
    ]),
    // the guides' Hilux and Land Cruiser parked along the fort's front north of its gate (their twins before the souq)
    // (229 b3 r2: the north band was the Frontline's line; 26-28 hits a pair)
    parking: twins([{ kind: 'pickup', x: 40, z: 9.5, yawDeg: 180 + TRACK_YAW }, { kind: 'jeep', x: 40, z: 3.5, yawDeg: 180 + TRACK_YAW }]),
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    // (the planters draw their own soil and sward: no terrain lawn, so the pad keeps its own paint)
    lawns: [],
    // (the lanes cross the square's middle: the sand they leave beside their edges is the open share)
    // (229 b3 r2: the islands and the north and south bands cleared off the battles' lines — the open sand they leave is
    // the zone's own)
    targets: { records: 12, benches: 4, lawnM2: 0, lampsAround: 0, openShare: 0.3, largestDisc: 21 },
  }],
};
