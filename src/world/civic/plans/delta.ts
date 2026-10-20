// src/world/civic/plans/delta.ts — Jade River Delta's civic plan (the maps lane, 229 b3; the owner, 2026-10-19: "expand its
// breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). A market village on a
// Jamuna char, Bangladesh, 2010; world metres, north +z, east +x.
//
// The haat (pad 0, the 50 m square turned 45 degrees at (-4, 14); zone 2 and the turbo kickoff at its middle) stood as
// bare beaten earth between the bazaar's tin sheds. It becomes the hat-khola of a char: the beaten earth kept, two lanes
// of brick soling laid herringbone (HBB) crossing it corner to corner (the village's lanes run on into it), and in its
// west and east corners a bot-tola each — the market's tree (the acacia's umbrella stands in for a raintree) on its
// whitewashed brick platform — with the tea stalls under it, bamboo benches round it, the DPHE tubewell beside it, rug
// frames, a thela and a Hiace parked at the haat's edge. No lamps (a char has none), no monument (the Shaheed Minar is a
// national memorial and would become a destructible target).
//
// The char is rotationally symmetric about (-4, 14): every piece has its twin at (-8 - x, 28 - z). The bots' routes (the
// 229 routeheat probe: 236 of 560 cross the haat) come in to the middle from its north and south corners and from the
// north-west and north-east; those corridors and their twins stay empty, which leaves the west and east corners for the
// bot-tolas.
//
// Pathways: none (the char's lanes are earth or brick soling without kerbs).
import type { CivicFurniture, CivicPlan, CivicPoint } from '../types.ts';

const CX = -4, CZ = 14;
/** A point's, a piece's and a segment's rotation twin about the haat's middle (the char's symmetry). */
const rot = (x: number, z: number): [number, number] => [+(2 * CX - x).toFixed(2), +(2 * CZ - z).toFixed(2)];
const twins = (list: readonly CivicFurniture[]): CivicFurniture[] => list.flatMap((f) => {
  const [x, z] = rot(f.x, f.z);
  return [f, { ...f, x, z, yawDeg: (f.yawDeg + 180) % 360 }];
});
const corridor = (from: CivicPoint, to: CivicPoint, half: number) => [{ from, to, half }, { from: rot(from[0], from[1]), to: rot(to[0], to[1]), half }];
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

// the west corner's bot-tola (the east's its twin)
const TOLA = { x: -27, z: 8 } as const;

export const DELTA_CIVIC_PLAN: CivicPlan = {
  mapId: 'delta',
  style: 'bengal',
  overlay: {},
  pathways: null,
  areas: [{
    id: 'haat',
    // the pad's own diamond: its 50 m square turned to the char
    room: { x0: CX - 25, x1: CX + 25, z0: CZ - 25, z1: CZ + 25 },
    roomYawDeg: 45,
    // (the square inside the diamond: the ground the grass keeps off; the pad paints its own earth)
    paved: { x0: -21.7, x1: 13.7, z0: -3.7, z1: 31.7 },
    frontage: false,
    rinnen: [],
    vetoExempt: ['lamp'],
    keepOuts: [],
    clears: [],
    pad: 0,
    arms: [],
    // (the 229 routeheat) into the middle from the north and south corners, the north-west and the north-east, the lane
    // up x = 0, the north-west lane's dog-leg; each with its twin
    corridors: [
      ...corridor([0, 50], [CX, CZ], 5), ...corridor([-25, 50], [CX, CZ], 5), ...corridor([25, 50], [CX, CZ], 5),
      ...corridor([0, -25], [0, 0], 5), ...corridor([0, 0], [CX, CZ], 5), ...corridor([25, 0], [CX, CZ], 4),
      ...corridor([0, -25], [0, 50], 4), ...corridor([-25, 50], [-25, 25], 4), ...corridor([-25, 25], [0, 0], 4),
    ],
    lanes: [],
    holds: [],
    centre: { x: CX, z: CZ, ringR: [8.5, 9.0], roseR: 3, rays: 8, inlay: false },
    beds: [],
    paving: [],
    // the brick soling: corner to corner across the haat, north to south (the bots' lane) and west to east (between the
    // bot-tolas)
    strips: [
      { from: [CX, CZ + 35], to: [CX, CZ - 35], width: 2.6, kind: 'brick' },
      { from: [CX - 35, CZ], to: [CX + 35, CZ], width: 2.6, kind: 'brick' },
    ],
    platforms: [{ x: TOLA.x, z: TOLA.z, half: 2.8, height: 0.5, yawDeg: 45 }, { x: rot(TOLA.x, TOLA.z)[0], z: rot(TOLA.x, TOLA.z)[1], half: 2.8, height: 0.5, yawDeg: 45 }],
    monument: null,
    trees: {
      // the bot-tolas' trees (the acacia's umbrella stands in for a raintree)
      species: 'acacia', scale: [1.45, 1.6],
      stations: [{ x: TOLA.x, z: TOLA.z }, { x: rot(TOLA.x, TOLA.z)[0], z: rot(TOLA.x, TOLA.z)[1] }],
    },
    furniture: twins([
      // the tea stalls toward the haat, the bamboo benches facing the bot-tola, the tubewell
      { kind: 'stall', x: -33, z: 12, yawDeg: facing(-33, 12, CX, CZ) }, { kind: 'stall', x: -22, z: 4, yawDeg: facing(-22, 4, CX, CZ) },
      { kind: 'bench', x: -24, z: 11.5, yawDeg: facing(-24, 11.5, TOLA.x, TOLA.z) }, { kind: 'bench', x: -30, z: 11.5, yawDeg: facing(-30, 11.5, TOLA.x, TOLA.z) },
      { kind: 'well', x: -20, z: 9, yawDeg: 45 },
      // the rug frames at the corner, a thela
      { kind: 'rugframe', x: -35, z: 15, yawDeg: 45 }, { kind: 'rugframe', x: -36.5, z: 12.8, yawDeg: 45 },
      { kind: 'handcart', x: -25, z: 15.5, yawDeg: 135 },
    ]),
    // a Hiace at the haat's north-west edge (and its twin at the south-east)
    parking: twins([{ kind: 'van', x: -32, z: 18, yawDeg: 45 }]),
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    lawns: [],
    targets: { records: 18, benches: 4, lawnM2: 0, lampsAround: 0, openShare: 0.08, largestDisc: 8 },
  }],
};
