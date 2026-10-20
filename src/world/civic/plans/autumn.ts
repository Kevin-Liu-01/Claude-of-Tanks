// src/world/civic/plans/autumn.ts — Amberford's civic plan (the maps lane, 229 b3; the owner, 2026-10-19: "expand its
// breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). A Lorraine market town
// on the Moselle, autumn 1944; world metres, north +z, east +x.
//
// The place at the crossroads (no pad: the town's own ground at (-110, 100), where the coach road, the mill lane and the
// north lane meet) stood as a scatter of stalls, benches and a well between the church on its north edge and the inn on
// its west. It becomes the village place of Lorraine: its ground the roads' own crushed limestone out to the fronts, the
// crossing left open (no inlay: the columns' crossroads); in the south-east quarter the monument aux morts (the map's
// Croix de Lorraine, walked here from the edge of town) in its bed of grass behind a low Jaumont wall under a cast-iron
// railing, four limes (the oak's form stands in) at the bed's corners, benches round it; the church's parvis in grey
// sandstone pavés with its benches; the market's corner in the south-west quarter with the village well, two stalls and a
// charrette; a Traction Avant parked along the south houses. No lamps (a village of 1944).
//
// The bots' measured routes (the 229 routeheat probe: 16 of 700) cross the place on one line down the inn's front at
// x = -124, from the north lane's mouth to the mill lane's: that corridor stays empty, and so do the four carriageways
// (corridors along the roads, 5 m each side: they cross the place on the diagonal, which the kit's axis-aligned arms
// cannot follow). The usoirs and the street village round the place are the map's own and untouched.
//
// Pathways: none. The village-rue's usoirs, the beaten fore-yards between the fronts and the carriageway, are authored;
// kerbs would erase them.
import type { CivicPlan, CivicRect } from '../types.ts';

const ROOM = { x0: -127, x1: -84, z0: 74, z1: 119.5 } as const;
// the monument's bed in the south-east quarter, between the coach road south and the north lane east
// (the monument in its planner cell's north triangle, 5 m off the cell's diagonals: it closes no lattice edge)
const BED: CivicRect = { x0: -97, x1: -84, z0: 82, z1: 99 };
const MONUMENT = { x: -87.5, z: 94.6 } as const;
const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

export const AUTUMN_CIVIC_PLAN: CivicPlan = {
  mapId: 'autumn',
  style: 'lorrain',
  overlay: { monumentKind: 'monument' },
  pathways: null,
  areas: [{
    id: 'la-place',
    room: ROOM,
    paved: ROOM,
    rinnen: [],
    vetoExempt: ['lamp'],
    keepOuts: [],
    clears: [],
    pad: -1,
    arms: [],
    corridors: [
      // (the 229 routeheat) the bots' line down the inn's front, and the one sniper's hop across the crossing
      { from: [-124, 66], to: [-124, 134], half: 4.5 }, { from: [-125, 100], to: [-100, 100], half: 3 },
      // the four carriageways through the place: the coach road south and north, the mill lane west, the north lane east
      { from: [-110, 100], to: [-99.3, 68], half: 5 }, { from: [-110, 100], to: [-116.9, 124], half: 5 },
      { from: [-110, 100], to: [-131, 88], half: 5 }, { from: [-110, 100], to: [-80, 115], half: 5 },
    ],
    lanes: [],
    holds: [],
    centre: { x: -110, z: 100, ringR: [8.5, 9.0], roseR: 3, rays: 8, inlay: false },
    beds: [{
      id: 'monument-bed', rect: BED,
      // the gate toward the crossing, its path to the monument's gravel
      mouths: [{ side: 'w', at: MONUMENT.z, width: 2.4 }],
      paths: [{ from: [BED.x0, MONUMENT.z], to: [MONUMENT.x - 2.9, MONUMENT.z], width: 2.4 }],
      feature: null,
    }],
    // the church's parvis in pavés before its door, up to its south front (which runs back north-west of the door)
    // (229 b3 r1, the critic's D4: a corner ran under the church) stepped back with its front
    paving: [{ rect: { x0: -107.5, x1: -102.5, z0: 113, z1: 121.2 }, kind: 'setts' }, { rect: { x0: -102.5, x1: -98, z0: 113, z1: 119.5 }, kind: 'setts' },
      { rect: { x0: -98, x1: -90, z0: 116, z1: 119.3 }, kind: 'setts' }],
    monument: { kind: 'monument', x: MONUMENT.x, z: MONUMENT.z, faceX: -110, faceZ: 100 },
    trees: {
      // limes (the oak's form stands in): a row down the bed's west side and one at its south-east, and one by the market
      species: 'oak', scale: [0.95, 1.08],
      stations: [{ x: -95, z: 97 }, { x: -95, z: 90.5 }, { x: -95, z: 84 }, { x: -88.5, z: 84 }, { x: -116.5, z: 78.5 }],
    },
    furniture: [
      // the benches in the bed, on its diagonals, facing the monument; and two on the parvis facing the place
      ...[[-90.5, 91.6], [-90.5, 97.6], [-87.5, 90.0], [-91.5, 86.5]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, MONUMENT.x, MONUMENT.z) })),
      { kind: 'bench', x: -105, z: 115.5, yawDeg: 160 }, { kind: 'bench', x: -98.5, z: 114, yawDeg: 200 },
      // one against the farmhouse's gable, facing the bed
      { kind: 'bench', x: -85.2, z: 101.5, yawDeg: -90 },
      // the market's corner: the village well, two stalls toward the crossing, a charrette
      { kind: 'well', x: -113.5, z: 87, yawDeg: 30 },
      { kind: 'stall', x: -113, z: 80.5, yawDeg: facing(-113, 80.5, -110, 100) }, { kind: 'stall', x: -117, z: 85.5, yawDeg: facing(-117, 85.5, -110, 100) },
      { kind: 'handcart', x: -111, z: 76.5, yawDeg: 70 },
    ],
    // a Traction Avant along the south houses
    parking: [{ kind: 'sedan', x: -90.5, z: 78.5, yawDeg: 90 }],
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    lawns: [BED],
    // (the largest free disc stands in the 2 m sliver between the bots' line down the inn's front and the north arm, where
    // nothing may stand)
    targets: { records: 30, benches: 7, lawnM2: 150, lampsAround: 0, openShare: 0.1, largestDisc: 9 },
  }],
};
