// src/world/civic/plans/delta.ts — Jade River Delta's civic plan (the maps lane, 229 b3; the owner, 2026-10-19: "expand its
// breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). A market village on a
// Jamuna char, Bangladesh, 2010; world metres, north +z, east +x.
//
// The haat (pad 0, the 50 m square turned 45 degrees at (-4, 14); zone 2 and the turbo kickoff at its middle) stood as
// bare beaten earth between the bazaar's tin sheds. It becomes the hat-khola of a char: the beaten earth kept, two lanes
// of brick soling laid herringbone (HBB) crossing it corner to corner (the village's lanes run on into it) and a brick
// walk round it inside its edge before the sheds; the market at its west and east corners: a tea stall facing the haat,
// the DPHE tubewell, a rug frame, a thela. No lamps (a char has none), no monument (the Shaheed Minar is a national
// memorial and would become a destructible target).
//
// (229 b3 r2, the gameplay critic's D1 and the coordinator's ruling: no piece on a driven line) zone 2's 30 m disc is the
// whole haat bar its corners, and in six zone and six Frontline base battles (probes/pace) the hulls crossed all of it:
// nothing hull-high stands inside 30 m of the point. The market stands past the disc at the corners the battles leave
// alone, each seat and its twin touched at most once a match. The bot-tolas are left out: no seat for an acacia's crown
// outside the disc clears the sheds, the roads and the west landmark's footprint on both twins.
//
// The char is rotationally symmetric about (-4, 14): every piece has its twin at (-8 - x, 28 - z).
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

// the haat's diamond inset 3 m: its brick walk's corners (west, north, east, south)
const IN = 25 * Math.SQRT2 - 3 * Math.SQRT2;
const RING: CivicPoint[] = [[CX - IN, CZ], [CX, CZ + IN], [CX + IN, CZ], [CX, CZ - IN]].map(([x, z]) => [+x.toFixed(2), +z.toFixed(2)] as CivicPoint);

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
    // (229 b3 r2, the gameplay critic's D1 and the coordinator's ruling: no piece on a driven line) zone 2's 30 m capture
    // disc is the whole haat bar its corners, and the base battles' hulls cross all of it: nothing hull-high stands in it
    holds: [{ id: 'zone-2', x: CX, z: CZ, r: 30, planOnly: true }],
    centre: { x: CX, z: CZ, ringR: [8.5, 9.0], roseR: 3, rays: 8, inlay: false },
    beds: [],
    paving: [],
    // the brick soling: corner to corner across the haat, north to south (the bots' lane) and west to east (between the
    // bot-tolas)
    strips: [
      // (229 b3 r1, the critic's D4: the south end ran under the longhouse) 30 m out each way
      { from: [CX, CZ + 30], to: [CX, CZ - 30], width: 2.6, kind: 'brick' },
      { from: [CX - 33, CZ], to: [CX + 33, CZ], width: 2.6, kind: 'brick' },
      // (229 b3 r2) a brick walk round the haat inside its edge, before the stalls and sheds: corner to corner
      ...RING.map((a, k) => ({ from: a, to: RING[(k + 1) % 4], width: 2.0, kind: 'brick' as const })),
    ],
    platforms: [],
    monument: null,
    // (229 b3 r2) none: the bot-tolas are left out (see the head)
    trees: { species: 'acacia', scale: [1.45, 1.6], stations: [] },
    furniture: twins([
      // (229 b3 r2) the market at the haat's west corner, past the disc: the tea stall facing the haat, the DPHE tubewell
      // behind it, a rug frame and a thela
      { kind: 'stall', x: -46.5, z: 13.5, yawDeg: facing(-46.5, 13.5, CX, CZ) },
      { kind: 'well', x: -49.5, z: 16.5, yawDeg: 45 },
      { kind: 'rugframe', x: -49, z: 10.5, yawDeg: 45 }, { kind: 'handcart', x: -44.5, z: 15.8, yawDeg: 135 },
    ]),
    // (229 b3 r2: no seat for a Hiace within reach of the haat that its twin's hulls leave alone) none
    parking: [],
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    lawns: [],
    // (229 b3 r2: the zone's hold covers the haat but for its corners, where the market stands past it; the room's fill
    // is the map's own and the brick lanes)
    targets: { records: 8, benches: 0, lawnM2: 0, lampsAround: 0, openShare: 0.08, largestDisc: 9 },
  }],
};
