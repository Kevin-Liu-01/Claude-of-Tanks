// src/world/civic/plans/urban.ts — Steinburg's civic plan (the maps lane, 228; the owner's pick, 2026-10-18: "a civic
// square with a tree-lined green, memorial column and parked period cars"; 2026-10-19: Steinburg is the pilot of the
// shared civic-area and pathway kit). World metres; north is +z, east +x.
//
// The Friedensplatz: the Hauptstrasse (road 0) and the trade road (road 1) cross the 64 m apron at (-50, 0) as two
// prop-free arms (18 m and 17 m) round an empty roundel (r 9: the zone hold disc and the ball's kickoff). West of the
// trade road, the green: two kerbed quarters of lawn behind Burgsandstein dwarf walls and a cast-iron railing, the
// north one a flower roundel on its paths' crossing, the south one the memorial grove (Ehrenhain) with the
// Friedenssäule at its head, its forecourt open to the square. Sixteen oaks in rows on the two quarters, nine in iron
// grates in the paving east of the trade road, three screening the north-east lot. East of the trade road, the Platz:
// the market corner's stalls, a kiosk, two Litfaßsäulen, two phone boxes, and the parked period cars in their bays
// (the 1980s' Golfs, W123 estates and Caddys, a Bundespost LP 813). Thirty gas lanterns light it at night.
//
// The column's seat (review R2): the incentre of the south triangle of the planner cell x -75..-50, z -25..0, 5.18 m
// from its six lattice segments and 13.5 m from the nearest node, in front of the oak rows, facing the crossing.
import type { CivicPlan } from '../types.ts';

const ROOM = { x0: -92.4, x1: -8.7, z0: -40.3, z1: 40.2 } as const;
const NW = { x0: -83.4, x1: -59.0, z0: 9.5, z1: 31.0 } as const;
const SW = { x0: -83.4, x1: -59.0, z0: -31.0, z1: -9.5 } as const;
const MID_X = -71.2, NW_Z = 20.25, SW_AXIS = -19.8;
const COLUMN = { x: -62.5, z: -19.8 } as const;

/** Each bench's front turned to face (tx, tz) from (x, z), degrees (0 = +z, 90 = +x). */
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

/** A pair of bollards at a mouth: either side of the path, on the granite band outside the bed. */
function bollards(side: 'n' | 's' | 'e' | 'w', rect: { x0: number; x1: number; z0: number; z1: number }, at: number, half = 2.2) {
  if (side === 'n') return [[at - half, rect.z1 + 0.25], [at + half, rect.z1 + 0.25]] as const;
  if (side === 's') return [[at - half, rect.z0 - 0.25], [at + half, rect.z0 - 0.25]] as const;
  if (side === 'e') return [[rect.x1 + 0.25, at - half], [rect.x1 + 0.25, at + half]] as const;
  return [[rect.x0 - 0.25, at - half], [rect.x0 - 0.25, at + half]] as const;
}

const POLLER = [
  ...bollards('n', NW, MID_X), ...bollards('s', NW, MID_X), ...bollards('e', NW, NW_Z), ...bollards('w', NW, NW_Z),
  ...bollards('n', SW, MID_X), ...bollards('s', SW, MID_X), ...bollards('w', SW, SW_AXIS),
  // the Ehrenhof's opening (6 m): one each side of it
  [SW.x1 + 0.25, SW_AXIS - 3.6], [SW.x1 + 0.25, SW_AXIS + 3.6],
].map(([x, z]) => ({ kind: 'poller', x: +x.toFixed(2), z: +z.toFixed(2), yawDeg: 0 }));

const OAK_X = [-81.8, -75.2, -67.2, -60.6];

export const URBAN_CIVIC_PLAN: CivicPlan = {
  mapId: 'urban',
  style: 'franconian',
  overlay: { hedgehogsAtApproaches: true, monumentKind: 'memorialcolumn' },
  pathways: {
    // the Hauptstrasse and the trade road are the main streets; the back lanes and the alleys are Gassen
    classes: { 0: 'main', 1: 'main', 6: 'gasse', 7: 'gasse', 8: 'gasse', 9: 'gasse', 10: 'gasse', 11: 'gasse', 12: 'gasse', 13: 'gasse' },
    kerbM: 3.8,
    frontage: [1.2, 3.5],
    returnR: 3.0,
    maxWalkM: 2.5,
    exclude: [ROOM],
    gates: [
      { x: -51.839, z: 100.564, halfWidth: 4.1, yawDeg: 2 },
      { x: -48.339, z: -101.256, halfWidth: 4.1, yawDeg: 184 },
    ],
    // the town wall's line (props.wallRuns' town stretches), west gate round to the west gate
    inside: [[-226, 18], [-216, 50], [-188, 80], [-150, 96], [-104, 104], [-64, 101], [-36, 100], [0, 94], [34, 80], [58, 56], [68, 22],
      [68, -26], [58, -64], [34, -90], [-2, -104], [-38, -102], [-66, -100], [-104, -104], [-156, -98], [-196, -76], [-218, -44], [-226, -12]],
    mouths: [[ROOM.x0, 0], [ROOM.x1, 0], [-50, ROOM.z1], [-50, ROOM.z0]],
  },
  areas: [{
    id: 'friedensplatz',
    room: ROOM,
    paved: { x0: -96, x1: -6, z0: -47.5, z1: 41.5 },
    // the carriageways' gutters at 3.8 m either side of each street through the square, stopping short of the roundel
    rinnen: [
      { from: [ROOM.x0, -3.8], to: [-59.4, -3.8] }, { from: [ROOM.x0, 3.8], to: [-59.4, 3.8] },
      { from: [-40.6, -3.8], to: [ROOM.x1, -3.8] }, { from: [-40.6, 3.8], to: [ROOM.x1, 3.8] },
      { from: [-53.8, ROOM.z0], to: [-53.8, -9.6] }, { from: [-46.2, ROOM.z0], to: [-46.2, -9.6] },
      { from: [-53.8, 9.6], to: [-53.8, ROOM.z1] }, { from: [-46.2, 9.6], to: [-46.2, ROOM.z1] },
    ],
    vetoExempt: ['lamp'],
    // the Pfarrgarten behind the church's north-west corner (the orange-ringed crater that sat there)
    keepOuts: [{ x0: -116, x1: -92.4, z0: 19, z1: 48 }],
    pad: 0,
    arms: [{ x0: ROOM.x0, x1: ROOM.x1, z0: -9, z1: 9 }, { x0: -58.5, x1: -41.5, z0: -41, z1: 41 }],
    // the study's routeheat (C11): the north-east diagonal to frontline line-2 and the spur to the ac130 extraction
    corridors: [
      { from: [-22, 0], to: [-22, 24], half: 4 }, { from: [-22, 24], to: [-36, 38], half: 4 },
      { from: [-50, 0], to: [-39.1, -9.7], half: 4 },
    ],
    centre: { x: -50, z: 0, ringR: [8.5, 9.0], roseR: 3, rays: 8 },
    beds: [
      {
        id: 'blumenrondell', rect: NW,
        mouths: [{ side: 'n', at: MID_X, width: 3 }, { side: 's', at: MID_X, width: 3 }, { side: 'e', at: NW_Z, width: 3 }, { side: 'w', at: NW_Z, width: 3 }],
        paths: [{ from: [MID_X, NW.z0], to: [MID_X, NW.z1], width: 3 }, { from: [NW.x0, NW_Z], to: [NW.x1, NW_Z], width: 3 }],
        feature: { kind: 'flowerRondell', x: MID_X, z: NW_Z, r: 2.5, ring: 5.0 },
      },
      {
        id: 'ehrenhain', rect: SW,
        mouths: [{ side: 'w', at: SW_AXIS, width: 3 }, { side: 'n', at: MID_X, width: 3 }, { side: 's', at: MID_X, width: 3 },
          { side: 'e', at: SW_AXIS, width: 6, open: 6 }],
        paths: [{ from: [SW.x0, SW_AXIS], to: [COLUMN.x - 2.9, SW_AXIS], width: 3 }, { from: [MID_X, SW.z0], to: [MID_X, SW.z1], width: 3 }],
        // the clipped box semicircle behind the column, open where the axis path comes in from the west
        feature: { kind: 'hedgeArc', x: COLUMN.x, z: COLUMN.z, r: 3.4, height: 0.55, fromDeg: 190, toDeg: 350 },
      },
    ],
    paving: [
      // the granite bands between the beds' kerbs and the arms
      { rect: { x0: NW.x0, x1: -58.5, z0: 9.0, z1: NW.z0 }, kind: 'granite' },
      { rect: { x0: NW.x1, x1: -58.5, z0: NW.z0, z1: NW.z1 }, kind: 'granite' },
      { rect: { x0: SW.x0, x1: -58.5, z0: SW.z1, z1: -9.0 }, kind: 'granite' },
      { rect: { x0: SW.x1, x1: -58.5, z0: SW.z0, z1: SW_AXIS - 3 }, kind: 'granite' },
      { rect: { x0: SW.x1, x1: -58.5, z0: SW_AXIS + 3, z1: SW.z1 }, kind: 'granite' },
      // the Ehrenhof: the trade road's small setts carried in as the column's forecourt
      { rect: { x0: COLUMN.x - 2.9, x1: -58.5, z0: SW_AXIS - 3, z1: SW_AXIS + 3 }, kind: 'setts' },
      // the Kirchweg from the church's west door to the green's north mouth
      { rect: { x0: -77.0, x1: -74.6, z0: 31.25, z1: 39.4 }, kind: 'flags' },
      { rect: { x0: -74.6, x1: -69.9, z0: 31.25, z1: 33.65 }, kind: 'flags' },
    ],
    monument: { kind: 'memorialcolumn', x: COLUMN.x, z: COLUMN.z, faceX: -50, faceZ: 0 },
    trees: {
      species: 'oak', scale: [1.45, 1.6],
      stations: [
        ...OAK_X.flatMap((x) => [{ x, z: 29.4 }, { x, z: 11.1 }]),
        ...OAK_X.flatMap((x) => [{ x, z: -11.1 }, { x, z: -29.4 }]),
        // the pits in the paving east of the trade road, and its east side
        { x: -38.5, z: 11, grate: true }, { x: -30.5, z: 11, grate: true }, { x: -15.5, z: 11, grate: true },
        { x: -31, z: -11, grate: true }, { x: -24, z: -11, grate: true }, { x: -17, z: -11, grate: true },
        { x: -40, z: 33, grate: true }, { x: -40, z: -25, grate: true }, { x: -40, z: -33, grate: true },
        // (the fill, 228 r1: the stretches the green and the Platz left blank) a pit tree in the Platz's north-east quarter,
        // two before the south frontage, two in the green's west walk
        { x: -29.5, z: 21.5, grate: true }, { x: -79, z: -36, grate: true }, { x: -63, z: -36, grate: true },
        { x: -88.5, z: 34, grate: true }, { x: -88.5, z: -34, grate: true },
        // the north-east lot's screen, and the Pfarrgarten behind the church
        { x: -8, z: 14, grate: true }, { x: -8, z: 21, grate: true }, { x: -8, z: 28, grate: true },
        { x: -104, z: 24 }, { x: -112, z: 34 }, { x: -103, z: 44 },
      ],
    },
    furniture: [
      // the flower roundel's benches on the diagonals, facing in
      ...[[-75.16, 24.21], [-67.24, 24.21], [-75.16, 16.29], [-67.24, 16.29]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, MID_X, NW_Z) })),
      // the Ehrenhain's benches facing its axis
      { kind: 'bench', x: -67.0, z: -16.6, yawDeg: 180 }, { kind: 'bench', x: -76.0, z: -16.6, yawDeg: 180 },
      { kind: 'bench', x: -67.0, z: -23.0, yawDeg: 0 }, { kind: 'bench', x: -76.0, z: -23.0, yawDeg: 0 },
      // round the new pit trees and along the south and west walks
      { kind: 'bench', x: -29.5, z: 18.4, yawDeg: 180 }, { kind: 'bench', x: -29.5, z: 24.6, yawDeg: 0 },
      { kind: 'bench', x: -74.0, z: -36.2, yawDeg: 0 }, { kind: 'bench', x: -68.0, z: -36.2, yawDeg: 0 },
      { kind: 'bench', x: -87.6, z: 25.5, yawDeg: 90 }, { kind: 'bench', x: -87.6, z: -25.5, yawDeg: 90 },
      { kind: 'pflanzkuebel', x: -34.0, z: -14.0, yawDeg: 0 }, { kind: 'trashcan', x: -71.2, z: -36.6, yawDeg: 0 },
      // the Brunnenplatz: two benches against the church's east flank, facing the Marktbrunnen
      { kind: 'bench', x: -69.0, z: 45.5, yawDeg: 90 }, { kind: 'bench', x: -69.0, z: 48.5, yawDeg: 90 },
      ...POLLER,
      { kind: 'trashcan', x: -60.2, z: 17.6, yawDeg: 0 }, { kind: 'trashcan', x: -60.2, z: -27.5, yawDeg: 0 },
      { kind: 'trashcan', x: -66.5, z: 41.2, yawDeg: 0 }, { kind: 'trashcan', x: -29.0, z: -19.5, yawDeg: 0 },
      ...[[-64.0, 41.5], [-60.0, 41.5], [-29.5, -17.0], [-23.0, -17.0], [-10.8, 9.6], [-10.8, -9.6]].map(([x, z]) => ({ kind: 'pflanzkuebel', x, z, yawDeg: 0 })),
      // the market corner: Franconian stalls, their crates
      { kind: 'stall', x: -35.0, z: -22.5, yawDeg: 0 }, { kind: 'stall', x: -31.5, z: -22.5, yawDeg: 0 },
      { kind: 'stall', x: -37.5, z: 25.75, yawDeg: -90 }, { kind: 'stall', x: -37.5, z: 29.25, yawDeg: -90 },
      { kind: 'stall', x: -33.5, z: 22.0, yawDeg: -135 },
      { kind: 'crate', x: -35.6, z: -24.2, yawDeg: 12 }, { kind: 'crate', x: -32.0, z: -24.3, yawDeg: -8 },
      { kind: 'crate', x: -35.9, z: 26.4, yawDeg: 31 }, { kind: 'crate', x: -35.8, z: 30.4, yawDeg: 4 },
      { kind: 'kiosk', x: -15.5, z: -14.5, yawDeg: -45 },
      { kind: 'litfass', x: -31.5, z: -15.5, yawDeg: 0 }, { kind: 'litfass', x: -16.5, z: 12.5, yawDeg: 20 },
      { kind: 'telzelle', x: -11.0, z: -21.0, yawDeg: -90 }, { kind: 'telzelle', x: -15.0, z: 33.5, yawDeg: -90 },
      { kind: 'handcart', x: -26.5, z: -24.6, yawDeg: 70 },
    ],
    parking: [
      // north, head-in, noses east at x = -39
      { kind: 'sedan', x: -39.0, z: 14.25, yawDeg: 90 }, { kind: 'wagon', x: -39.0, z: 16.75, yawDeg: 90 },
      { kind: 'sedan', x: -39.0, z: 19.25, yawDeg: 90 }, { kind: 'wagon', x: -39.0, z: 21.75, yawDeg: 90 },
      // north-east, angled 60 degrees at the lot
      { kind: 'pickup', x: -13.5, z: 21.5, yawDeg: 60 }, { kind: 'wagon', x: -13.5, z: 25.8, yawDeg: 60 },
      // south, head-in, noses south at z = -34.5
      { kind: 'sedan', x: -30.75, z: -34.5, yawDeg: 180 }, { kind: 'wagon', x: -28.25, z: -34.5, yawDeg: 180 },
      { kind: 'sedan', x: -25.75, z: -34.5, yawDeg: 180 }, { kind: 'pickup', x: -23.25, z: -34.5, yawDeg: 180 },
      { kind: 'sedan', x: -20.75, z: -34.5, yawDeg: 180 }, { kind: 'wagon', x: -18.25, z: -34.5, yawDeg: 180 },
      // the Bundespost's LP 813 box at the market corner, its nose east
      { kind: 'truckbox', x: -20.0, z: -22.5, yawDeg: 90 },
    ],
    bayMarks: [
      // the north row's separators (along the cars) and its head row, the south row's
      ...[13.0, 15.5, 18.0, 20.5, 23.0].map((z) => ({ x: -39.0, z, yawDeg: 90, length: 5.0 })),
      { x: -36.4, z: 18.0, yawDeg: 0, length: 10.0 },
      ...[-32.0, -29.5, -27.0, -24.5, -22.0, -19.5, -17.0].map((x) => ({ x, z: -34.5, yawDeg: 0, length: 5.0 })),
      { x: -24.5, z: -37.1, yawDeg: 90, length: 15.0 },
    ],
    lamps: [
      [-73.4, 30.4], [-59.6, 22.45], [-82.8, 18.05], [-59.6, -24.6], [-82.8, -22.45], [-59.4, 42.6],
      [-41.0, 9.9], [-27.5, -11.0], [-14.0, 17.5], [-59.4, 9.9], [-59.6, -15.0],
    ].map(([x, z]) => ({ kind: 'lamp', x, z, yawDeg: 0 })),
    fountainRing: { x: -62, z: 47, r: 5.5 },
    steps: [{ x: -75.8, z: 39.9, width: 6, yawDeg: 180, count: 2, rise: 0.12 }],
    lawns: [NW, SW],
  }],
};
