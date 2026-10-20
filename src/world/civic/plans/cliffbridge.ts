// src/world/civic/plans/cliffbridge.ts — Aegis Crossing's civic plan (the maps lane, 229 b1; the owner, 2026-10-19:
// "expand its breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). Ronda and
// the Tajo, 1972; world metres, north +z, east +x.
//
// The two towns either side of the gorge each had an empty 72 x 80 m pad between the casa consistorial and the parish
// church (zones 1 and 2 at (0, -172) and (0, 172)). Each becomes a Ronda plaza in the manner of the Plaza Duquesa de
// Parcent: the road (road 0) crosses it as a prop-free arm round an empty roundel, and either side of it two parterre
// beds behind whitewashed walls under a low wrought-iron rail, their albero paths crossing at a stone glorieta, orange
// trees in their quarters (the map's olive form stands in), stone-and-timber benches about the fountains, cast-iron
// column lamps at the beds' corners, the town's SEATs parked along the casa consistorial. The church's front is left
// open to the plaza. The two plazas are mirror twins across z = 0 (the map's symmetry).
//
// Pathways: the map never laid the legacy kerbs (no curbs), so the kit lays its own on the towns' streets (no draws to
// spend): the road through each town is a main street, the four ford roads lanes, each town its own polygon (the
// viaduct between them keeps its parapets).
import type { CivicAreaPlan, CivicBed, CivicFurniture, CivicPlan, CivicRect } from '../types.ts';

/** A rect's, a piece's and a bed's mirror twin across z = 0. */
const mirRect = (r: CivicRect): CivicRect => ({ x0: r.x0, x1: r.x1, z0: -r.z1, z1: -r.z0 });
const mirPiece = (f: CivicFurniture): CivicFurniture => ({ ...f, z: -f.z, yawDeg: (540 - f.yawDeg) % 360 });
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

/** A parterre bed: its rect, a mouth mid each side, its two paths crossing at a glorieta. */
function parterre(id: string, r: CivicRect): CivicBed {
  const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
  return {
    id, rect: r,
    mouths: [{ side: 'n', at: mx, width: 2.6 }, { side: 's', at: mx, width: 2.6 }, { side: 'e', at: mz, width: 2.6 }, { side: 'w', at: mz, width: 2.6 }],
    paths: [{ from: [mx, r.z0], to: [mx, r.z1], width: 2.6 }, { from: [r.x0, mz], to: [r.x1, mz], width: 2.6 }],
    feature: { kind: 'fountain', x: mx, z: mz, r: 1.7, ring: 3.4 },
  };
}

/** A plaza's area from its southern twin's numbers (the north's is its mirror). */
function plaza(id: string, pad: number, mirror: boolean): CivicAreaPlan {
  const R = (r: CivicRect) => (mirror ? mirRect(r) : r);
  const P = (list: readonly CivicFurniture[]) => (mirror ? list.map(mirPiece) : [...list]);
  // (229 b1 r1, the blind critics: no pavement along the town hall and the church, a hard edge against bare dirt) the room
  // out to the house fronts east and to the casa consistorial's front west, the paving under them
  const room = R({ x0: -49.5, x1: 38.5, z0: -212, z1: -132 });
  const beds = [
    parterre(`${id}-w1`, R({ x0: -32, x1: -13, z0: -205, z1: -178 })), parterre(`${id}-w2`, R({ x0: -32, x1: -13, z0: -166, z1: -139 })),
    parterre(`${id}-e1`, R({ x0: 13, x1: 32, z0: -205, z1: -178 })), parterre(`${id}-e2`, R({ x0: 13, x1: 32, z0: -166, z1: -139 })),
  ];
  const cz = mirror ? 172 : -172;
  // orange trees in each bed's four quarters, the quarters' middles
  const stations = [...beds.flatMap((b) => {
    const r = b.rect, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    return [[(r.x0 + mx) / 2, (r.z0 + mz) / 2], [(mx + r.x1) / 2, (r.z0 + mz) / 2], [(r.x0 + mx) / 2, (mz + r.z1) / 2], [(mx + r.x1) / 2, (mz + r.z1) / 2]]
      .map(([x, z]) => ({ x: +x.toFixed(2), z: +z.toFixed(2) }));
  }),
  // (229 b1 r1, the critics: a wide empty band round the parterres) a row down the paseo between each side's two beds, in
  // their grates, and a row before the casa consistorial
  ...[16, 22.5, 29].flatMap((x) => [{ x, z: cz, grate: true }, { x: -x, z: cz, grate: true }]),
  ...[-170, -163.5, -157, -150.5, -144].map((z) => ({ x: -45, z: mirror ? -z : z, grate: true }))];
  // benches on each glorieta's diagonals facing in
  const benches = [...beds.flatMap((b) => {
    const r = b.rect, mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    return [[-3.0, -3.0], [3.0, -3.0], [-3.0, 3.0], [3.0, 3.0]].map(([dx, dz]) => ({ kind: 'bench', x: mx + dx, z: mz + dz, yawDeg: facing(mx + dx, mz + dz, mx, mz) }));
  }),
  // (229 b1 r1) the paseo's benches between its trees, facing across it, and before the casa consistorial between its
  // trees, facing the plaza
  ...P([[19.25, -174.4, 0], [25.75, -169.6, 180], [-19.25, -174.4, 0], [-25.75, -169.6, 180],
    [-45, -166.75, 90], [-45, -153.75, 90], [-45, -147.25, 90]].map(([x, z, yawDeg]) => ({ kind: 'bench', x, z, yawDeg })))];
  return {
    id, room,
    paved: R({ x0: -52, x1: 43, z0: -216, z1: -128 }),
    // (229 b1 r1, the blind critics: the gutters' two light rows read from above as painted lane lines) none
    rinnen: [],
    vetoExempt: ['lamp'],
    keepOuts: [],
    clears: [],
    pad,
    arms: [R({ x0: -9, x1: 9, z0: -212, z1: -132 })],
    // (the 229 routeheat) the road's arm, and the route west along the plaza's bridgehead edge to the tollhouse
    corridors: [mirror
      ? { from: [0, 132], to: [0, 212], half: 9 } : { from: [0, -212], to: [0, -132], half: 9 },
    mirror ? { from: [-36, 131], to: [-8, 131], half: 4 } : { from: [-36, -131], to: [-8, -131], half: 4 }],
    lanes: [],
    holds: [],
    centre: { x: 0, z: cz, ringR: [8.5, 9.0], roseR: 3, rays: 8 },
    beds,
    // (229 b1 r1, the blind critics: "raw dark asphalt" round the beds) the plaza floored in pale stone tiles round its beds,
    // the road's arm with it
    paving: [
      { rect: R({ x0: room.x0, x1: -32, z0: -212, z1: -132 }), kind: 'tiles' },
      { rect: R({ x0: -13, x1: 13, z0: -212, z1: -132 }), kind: 'tiles' },
      { rect: R({ x0: 32, x1: room.x1, z0: -212, z1: -132 }), kind: 'tiles' },
      ...[[-32, -13], [13, 32]].flatMap(([x0, x1]) => [[-212, -205], [-178, -166], [-139, -132]].map(([z0, z1]) => ({ rect: R({ x0, x1, z0, z1 }), kind: 'tiles' as const }))),
      // over the apron's painted edge outside the room, to the street and the bridgehead (no dark band at the plaza's ends)
      { rect: R({ x0: -40, x1: 38.5, z0: -218, z1: -212 }), kind: 'tiles' }, { rect: R({ x0: -40, x1: 38.5, z0: -132, z1: -127 }), kind: 'tiles' },
    ],
    monument: null,
    // (229 b1 r1, the critics: the acacia form read oversized, spiky and sparse) the oak slot (the map's holm oak) small,
    // a round dark crown standing for the orange tree
    trees: { species: 'oak', scale: [0.5, 0.58], stations },
    // (the benches come off the beds, already the plaza's own)
    furniture: benches,
    // the town's SEATs along the casa consistorial's front, outside the beds
    parking: P([
      { kind: 'sedan', x: -38.6, z: -199.0, yawDeg: 1.2 }, { kind: 'wagon', x: -38.5, z: -193.2, yawDeg: -0.6 },
      { kind: 'sedan', x: -38.7, z: -150.5, yawDeg: 179.0 },
    ]),
    bayMarks: [],
    // cast-iron column lamps at the beds' corners by the arm
    lamps: P([[-11.2, -203.5], [11.2, -203.5], [-11.2, -140.5], [11.2, -140.5],
      // (229 b1 r1) at the paseo's ends by the arm, and before the casa consistorial
      [11.5, -172], [-11.5, -172], [-41.5, -160.25], [-41.5, -147.25]].map(([x, z]) => ({ kind: 'lamp', x, z, yawDeg: 0 }))),
    fountainRing: null,
    steps: [],
    lawns: beds.map((b) => b.rect),
    targets: { records: 60, benches: 12, lawnM2: 1500, lampsAround: 4, openShare: 0.08, largestDisc: 10 },
  };
}

const TOWN_SOUTH: ReadonlyArray<readonly [number, number]> = [[-140, -282], [140, -282], [140, -106], [-140, -106]];

export const CLIFFBRIDGE_CIVIC_PLAN: CivicPlan = {
  mapId: 'cliffbridge',
  style: 'andalusian',
  overlay: {},
  pathways: {
    classes: { 0: 'main', 1: 'gasse', 2: 'gasse', 3: 'gasse', 4: 'gasse' },
    kerbM: 3.8,
    frontage: [1.2, 3.5],
    returnR: 2.5,
    maxWalkM: 1.6,
    openWalkM: 1.2,
    lane: { face: 0.06, maxWalkM: 1.0, openWalkM: 0.8 },
    exclude: [{ x0: -49.5, x1: 38.5, z0: -212, z1: -132 }, { x0: -49.5, x1: 38.5, z0: 132, z1: 212 }],
    // (229 b1 r1, the blind critics: kerb slabs floating on open ground at the plazas' entries) only the fronted stretches,
    // joined over gaps of up to 15 m
    openGapM: 15,
    gates: [],
    inside: [TOWN_SOUTH, TOWN_SOUTH.map(([x, z]) => [x, -z] as const)],
    mouths: [[0, -212], [0, -132], [0, 132], [0, 212]],
  },
  areas: [plaza('plaza-sur', 0, false), plaza('plaza-norte', 1, true)],
};
