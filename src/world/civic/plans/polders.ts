// src/world/civic/plans/polders.ts — Tidegate Polders' civic plan (the maps lane, 229 b2; the owner, 2026-10-19: "expand
// its breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). The Scheldt polders,
// autumn 1944; world metres, north +z, east +x.
//
// The farm village's court (pad 0, 60 x 60 at (-40, 0); zone 2 and the turbo kickoff at its middle, the ac130 extraction
// at (-52.7, 3.8)) became a grazed green after the 10-17 blind ruling ("a dark flat square plot reads as an untextured
// void"). It becomes a Zeeland brink: the green kept, a klinker roundel at the zone, two kerbed lawns behind a low brick
// wall on hardstone kerbs, rows of lindens (the oak's form stands in), the village pump at the south lawn's paths' crossing
// with its benches about it, a tulip bed on the north lawn, farm carts and a Traction Avant by the east road; no lamps
// (the blackout). The bots' routes (the 229 routeheat probe) run north-south down x = -28 into the middle, east-west
// along z = 4 and in from the north-west on the diagonal: those are the corridors, and the lawns keep the quarters the
// routes leave (the south-west, and the north-west between the diagonal and the north run).
//
// Pathways: the map never laid the legacy kerbs; the mill lane (road 0) takes a Zeeland stoep, a brick strip before each
// front on a brick-on-edge kerb, as a lane; the crowned causeway (road 2) takes none.
import type { CivicPlan, CivicRect } from '../types.ts';

const ROOM = { x0: -75, x1: -12, z0: -30, z1: 36 } as const;
const SW = { x0: -72, x1: -46, z0: -28, z1: -10 } as const;
// (229 b2 r1, the gameplay critic's D1: the north lawn stood on the hulls' lines along z 22 and z 30 and lost 11 of its 12
// pieces a match) the north lawn in the band the battles leave quiet (the lane's track grids over 6 base battles: z 26..35,
// x -55..-37)
const NW = { x0: -55, x1: -37, z0: 26, z1: 35 } as const;
const PUMP = { x: -59, z: -19 } as const, ROSE = { x: -46.5, z: 30.5 } as const;
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);
/** A klinker walk round a lawn: four strips 1.2 m wide outside its kerb. */
const walk = (r: CivicRect): Array<{ rect: CivicRect; kind: 'setts' }> => [
  { rect: { x0: r.x0 - 1.2, x1: r.x1 + 1.2, z0: r.z0 - 1.2, z1: r.z0 }, kind: 'setts' },
  { rect: { x0: r.x0 - 1.2, x1: r.x1 + 1.2, z0: r.z1, z1: r.z1 + 1.2 }, kind: 'setts' },
  { rect: { x0: r.x0 - 1.2, x1: r.x0, z0: r.z0, z1: r.z1 }, kind: 'setts' },
  { rect: { x0: r.x1, x1: r.x1 + 1.2, z0: r.z0, z1: r.z1 }, kind: 'setts' },
];

export const POLDERS_CIVIC_PLAN: CivicPlan = {
  mapId: 'polders',
  style: 'polder',
  overlay: {},
  pathways: {
    classes: { 0: 'gasse' },
    kerbM: 2.3,
    frontage: [1.2, 3.5],
    returnR: 2.0,
    maxWalkM: 1.6,
    openWalkM: 0.6,
    lane: { face: 0.05, maxWalkM: 1.6, openWalkM: 0.6 },
    exclude: [ROOM],
    gates: [],
    inside: [[[-178, -96], [68, -96], [68, 122], [-178, 122]]],
    mouths: [],
  },
  areas: [{
    id: 'brink',
    room: ROOM,
    // the green stays grass: only the klinker roundel at the zone is paved
    paved: { x0: -49.5, x1: -30.5, z0: -9.5, z1: 9.5 },
    rinnen: [],
    vetoExempt: ['lamp'],
    keepOuts: [],
    clears: [],
    pad: 0,
    arms: [],
    // (the 229 routeheat) the north run into the middle, the east-west run through it, the north-west diagonal, and the
    // causeway across the south-east corner
    corridors: [
      { from: [-28, 40], to: [-28, 10], half: 5 }, { from: [-28, 10], to: [-40, 0], half: 5 },
      { from: [-12, 4], to: [-75, 4], half: 5 },
      { from: [-80, 20], to: [-58, 4], half: 5 },
      { from: [-38, -33], to: [-9.2, 5.1], half: 6 },
      // (229 b2 r1, the track grids) the hulls' line west along z 22, and the west edge's run north at x -60
      { from: [-76, 22], to: [-24, 22], half: 3.5 }, { from: [-60, 24], to: [-59, 36], half: 3 },
    ],
    lanes: [],
    holds: [{ id: 'ac130-extraction', x: -52.7, z: 3.8, r: 8 }],
    centre: { x: -40, z: 0, ringR: [8.0, 9.0], roseR: 3, rays: 8 },
    beds: [
      {
        id: 'brink-south', rect: SW,
        mouths: [{ side: 'n', at: PUMP.x, width: 2.6 }, { side: 'e', at: PUMP.z, width: 2.6 }, { side: 's', at: PUMP.x, width: 2.6 }],
        paths: [{ from: [PUMP.x, SW.z0], to: [PUMP.x, SW.z1], width: 2.6 }, { from: [SW.x0 + 0.6, PUMP.z], to: [SW.x1, PUMP.z], width: 2.6 }],
        feature: null,
      },
      {
        id: 'brink-north', rect: NW,
        mouths: [{ side: 's', at: ROSE.x, width: 2.6 }, { side: 'e', at: ROSE.z, width: 2.6 }],
        paths: [{ from: [ROSE.x, NW.z0], to: [ROSE.x, NW.z1 - 0.6], width: 2.6 }, { from: [NW.x0 + 0.6, ROSE.z], to: [NW.x1, ROSE.z], width: 2.6 }],
        feature: { kind: 'flowerRondell', x: ROSE.x, z: ROSE.z, r: 1.6, ring: 2.6 },
      },
    ],
    paving: [...walk(SW), ...walk(NW)],
    monument: null,
    trees: {
      species: 'oak', scale: [1.0, 1.12],
      stations: [
        // (229 b2 r1: six south, five north — the halves' trees within one)
        ...[-63.4, -56.8, -50.2].flatMap((x) => [{ x, z: -25.5 }, { x, z: -12.5 }]),
        ...[-53, -46.5, -40].map((x) => ({ x, z: 27 })), ...[-49.75, -43.25].map((x) => ({ x, z: 33.5 })),
      ],
    },
    furniture: [
      // the village pump at the south lawn's crossing, its benches about it facing it
      { kind: 'well', x: PUMP.x, z: PUMP.z, yawDeg: 0 },
      ...[[-62, -16], [-56, -16], [-62, -22], [-56, -22]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, PUMP.x, PUMP.z) })),
      // the north lawn's benches either side of its tulip bed
      { kind: 'bench', x: -50.5, z: 30.5, yawDeg: 90 }, { kind: 'bench', x: -42.5, z: 30.5, yawDeg: -90 },
      // (229 b2 r1: the haycart off the hulls' z 22 line, the handcart off the mill lane's roadway: the critic's D3) the hay
      // wagon in the quiet north band, the handcart by the pump
      { kind: 'haycart', x: -38.5, z: 34.2, yawDeg: 90 }, { kind: 'handcart', x: -66.5, z: -19, yawDeg: 15 },
    ],
    parking: [{ kind: 'sedan', x: -18, z: 13.5, yawDeg: 15 }],
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    lawns: [SW, NW],
    // (a village green: the grass between its lawns stays open by design)
    // (229 b2 r1: the green between the lawns is where the hulls drive in both modes — the open share is that grass)
    targets: { records: 20, benches: 6, lawnM2: 600, lampsAround: 0, openShare: 0.3, largestDisc: 18 },
  }],
};
