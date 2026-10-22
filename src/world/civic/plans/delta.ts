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
// (229 b3 r3, the gameplay critic's D4: the walk ran under the field hospital, about 5 m2, and the longhouse, about 3 m2) the
// map's own buildings at the haat's north-west and south edges (their records' boxes); a run of the walk stops 1.3 m short
// of each (its half width and a joint), and a run under 2 m is left out
const SHEDS: ReadonlyArray<readonly [number, number, number, number]> = [[-26.1, 30.9, -15.2, 42.2], [-15.5, -27.7, -2.9, -14.5]];
function walkRuns(a: CivicPoint, b: CivicPoint, clearM = 1.3): Array<[CivicPoint, CivicPoint]> {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.ceil(len / 0.25), runs: Array<[CivicPoint, CivicPoint]> = [];
  const at = (t: number): CivicPoint => [+(a[0] + (b[0] - a[0]) * t).toFixed(2), +(a[1] + (b[1] - a[1]) * t).toFixed(2)];
  const clear = (t: number) => { const [x, z] = at(t); return SHEDS.every(([x0, z0, x1, z1]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) > clearM); };
  let start = -1;
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, ok = clear(t);
    if (ok && start < 0) start = t;
    if ((!ok || k === steps) && start >= 0) {
      const end = ok ? t : (k - 1) / steps;
      if ((end - start) * len >= 2) runs.push([at(start), at(end)]);
      start = -1;
    }
  }
  return runs;
}

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
      // (229 b3 r3) and each lane's runs 1.6 m short of the map's sheds (its half width and a joint)
      ...([[[CX, CZ + 30], [CX, CZ - 30]], [[CX - 33, CZ], [CX + 33, CZ]]] as Array<[CivicPoint, CivicPoint]>)
        .flatMap(([a, b]) => walkRuns(a, b, 1.6).map(([from, to]) => ({ from, to, width: 2.6, kind: 'brick' as const }))),
      // (229 b3 r2) a brick walk round the haat inside its edge, before the stalls and sheds: corner to corner
      ...RING.flatMap((a, k) => walkRuns(a, RING[(k + 1) % 4]).map(([from, to]) => ({ from, to, width: 2.0, kind: 'brick' as const }))),
    ],
    platforms: [],
    monument: null,
    // (229 b3 r2) none: the bot-tolas are left out (see the head)
    trees: { species: 'acacia', scale: [1.45, 1.6], stations: [] },
    furniture: twins([
      // (229 b3 r2) the market at the haat's west corner, past the disc: the tea stall facing the haat, the DPHE tubewell
      // behind it, a rug frame and a thela
      // (229 b3 r3, the gameplay critic's D3: bravo's twins stood on road 1's carriageway, 0.7-1.7 m off its line, and
      // the west stall on the map's firewood) each seat and its twin 4.6 m and more off every road's line, 1.4 m off the
      // map's records and structures, quiet in the base battles (probes/pace); the thela left out (no third seat clears)
      { kind: 'stall', x: -41.5, z: 4, yawDeg: facing(-41.5, 4, CX, CZ) },
      { kind: 'well', x: -50, z: 16, yawDeg: 45 },
      { kind: 'rugframe', x: -38.5, z: 6.5, yawDeg: 45 },
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
    targets: { records: 6, benches: 0, lawnM2: 0, lampsAround: 0, openShare: 0.08, largestDisc: 9 },
  }],
};
