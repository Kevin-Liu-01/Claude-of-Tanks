// src/world/civic/plans/ruinspires.ts — Ruinspires' civic plan (the maps lane, 229 b1; the owner, 2026-10-19: "expand its
// breadth to finalize all 'pathway' architecture and civic areas for maps that would need that"). Sarajevo under siege,
// 1992-96; world metres, north +z, east +x.
//
// The Square of the Republic (pad 0, 76 x 60 at the centre; zone 2, the turbo kickoff and the ac130 extraction at (0, 0))
// stood empty between its towers. It becomes a Yugoslav-modernist plaza: the boulevard (road 0, "Sniper Alley") and the
// two trunk roads' mouths cross it as prop-free arms round an empty roundel, and its two far quarters each hold a cast-
// concrete planter bed of worn lawn under a row of plane trees (the oak's form stands in), a bed of red and gold
// flowers at its paths' crossing, concrete benches; a pair of trees by each trunk road's mouth; the city's own cars
// parked at the kerb along the frontages. Its shot-out cobra-head lamps are the map's own. No market, no casualty
// staging (Markale): a square of the siege, swept and empty, its planters kept.
//
// The map is rotationally symmetric about (0, 0) (alpha south, bravo north): every piece has its twin at (-x, -z). The
// bots' routes (the 229 routeheat probe) run from each trunk road's mouth diagonally into the centre, along the room's
// trunk-side edge and up x = ±4: those are the corridors, and the beds stand in the quarters the routes leave.
//
// Pathways: the city's streets are kerbed by the kit in place of the legacy strips (1,376 pieces, 84 % of them under
// houses, without frontage or on the squares): the boulevard, the trunk roads and the terrace streets are main streets,
// the cross streets lanes; there is no wall, so the town's inside is the valley floor's rectangle.
import type { CivicFurniture, CivicPlan, CivicRect } from '../types.ts';

/** A point's rotation twin about the centre (the map's symmetry). */
const rot = (p: { x: number; z: number; yawDeg?: number }) => ({ x: -p.x, z: -p.z, yawDeg: ((p.yawDeg ?? 0) + 180) % 360 });
const rotRect = (r: CivicRect): CivicRect => ({ x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0 });
/** Each piece and its twin. */
const twins = (list: readonly CivicFurniture[]): CivicFurniture[] => list.flatMap((f) => [f, { ...f, ...rot(f) }]);

const ROOM = { x0: -38, x1: 38, z0: -30, z1: 30 } as const;
// the south-east quarter's planter bed (the north-west's its twin): clear of the boulevard's arm and the x = 4 route
const SE = { x0: 10, x1: 34, z0: -27, z1: -13 } as const;
const NW = rotRect(SE);
const SE_MID_X = 22, SE_MID_Z = -20;

const BED_SE = {
  id: 'planter-se', rect: SE,
  mouths: [{ side: 'n' as const, at: SE_MID_X, width: 3 }, { side: 'w' as const, at: SE_MID_Z, width: 3 }],
  paths: [{ from: [SE_MID_X, SE.z0 + 0.6] as const, to: [SE_MID_X, SE.z1] as const, width: 3 }, { from: [SE.x0, SE_MID_Z] as const, to: [SE.x1 - 0.6, SE_MID_Z] as const, width: 3 }],
  feature: { kind: 'flowerRondell' as const, x: SE_MID_X, z: SE_MID_Z, r: 2.2, ring: 4.2 },
};
const BED_NW = {
  id: 'planter-nw', rect: NW,
  mouths: [{ side: 's' as const, at: -SE_MID_X, width: 3 }, { side: 'e' as const, at: -SE_MID_Z, width: 3 }],
  paths: [{ from: [-SE_MID_X, NW.z1 - 0.6] as const, to: [-SE_MID_X, NW.z0] as const, width: 3 }, { from: [NW.x1, -SE_MID_Z] as const, to: [NW.x0 + 0.6, -SE_MID_Z] as const, width: 3 }],
  feature: { kind: 'flowerRondell' as const, x: -SE_MID_X, z: -SE_MID_Z, r: 2.2, ring: 4.2 },
};

const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

export const RUINSPIRES_CIVIC_PLAN: CivicPlan = {
  mapId: 'ruinspires',
  style: 'sarajevo',
  overlay: { plazaNest: false, hedgehogsAtApproaches: true },
  pathways: {
    // the boulevard, the trunk roads and the terrace streets main; the cross streets lanes
    classes: { 0: 'main', 1: 'main', 2: 'main', 3: 'main', 4: 'main', 5: 'main', 6: 'main', 7: 'gasse', 8: 'gasse', 9: 'gasse', 10: 'gasse' },
    kerbM: 5.0,
    frontage: [1.2, 3.5],
    returnR: 4.0,
    maxWalkM: 3.0,
    openWalkM: 2.5,
    lane: { face: 0.12, maxWalkM: 2.0, openWalkM: 1.5 },
    exclude: [ROOM, { x0: -263, x1: -187, z0: -30, z1: 30 }, { x0: 187, x1: 263, z0: -30, z1: 30 }],
    gates: [],
    // no wall: the valley floor, its edges well off the terrace streets and their ends
    inside: [[[-330, -200], [330, -200], [330, 200], [-330, 200]]],
    mouths: [[ROOM.x0, 0], [ROOM.x1, 0], [-25, ROOM.z0], [25, ROOM.z1], [-263, 0], [-187, 0], [187, 0], [263, 0], [-200, -30], [200, 30]],
  },
  areas: [{
    id: 'trg-republike',
    room: ROOM,
    paved: { x0: -44, x1: 44, z0: -36, z1: 36 },
    // the boulevard's channels either side of its carriageway, stopping short of the roundel
    rinnen: [
      { from: [ROOM.x0, -5.2], to: [-9.4, -5.2] }, { from: [ROOM.x0, 5.2], to: [-9.4, 5.2] },
      { from: [9.4, -5.2], to: [ROOM.x1, -5.2] }, { from: [9.4, 5.2], to: [ROOM.x1, 5.2] },
    ],
    vetoExempt: ['lamp'],
    keepOuts: [],
    clears: [],
    pad: 0,
    // the boulevard's arm and the two trunk roads' mouths
    arms: [{ x0: ROOM.x0, x1: ROOM.x1, z0: -10, z1: 10 }, { x0: -32, x1: -18, z0: ROOM.z0, z1: -10 }, { x0: 18, x1: 32, z0: 10, z1: ROOM.z1 }],
    // (the 229 routeheat) each trunk mouth's diagonal into the centre, the trunk-side edge and the x = +-4 runs
    corridors: [
      { from: [-28, -30], to: [-3, -3], half: 5 }, { from: [28, 30], to: [3, 3], half: 5 },
      { from: [-32, -27], to: [4, -27], half: 4 }, { from: [32, 27], to: [-4, 27], half: 4 },
      { from: [4, -30], to: [4, -9], half: 4 }, { from: [-4, 30], to: [-4, 9], half: 4 },
    ],
    lanes: [],
    holds: [{ id: 'ac130-extraction', x: 0, z: 0.1, r: 8 }],
    centre: { x: 0, z: 0, ringR: [8.5, 9.0], roseR: 3, rays: 8 },
    beds: [BED_SE, BED_NW],
    paving: [
      // the granite bands between the beds' kerbs and the boulevard's arm, and along their open ends
      { rect: { x0: SE.x0, x1: SE.x1, z0: SE.z1, z1: -10 }, kind: 'granite' },
      { rect: rotRect({ x0: SE.x0, x1: SE.x1, z0: SE.z1, z1: -10 }), kind: 'granite' },
    ],
    monument: null,
    trees: {
      // plane trees (the oak's form stands in), in the beds' quarters and by the trunk mouths
      species: 'oak', scale: [1.05, 1.2],
      stations: [
        { x: 15.5, z: -16 }, { x: 29, z: -16 }, { x: 15.5, z: -24 }, { x: 29, z: -24 },
        { x: -15.5, z: 16 }, { x: -29, z: 16 }, { x: -15.5, z: 24 }, { x: -29, z: 24 },
        { x: -35.5, z: -13, grate: true }, { x: -35.5, z: -20, grate: true }, { x: 35.5, z: 13, grate: true }, { x: 35.5, z: 20, grate: true },
      ],
    },
    furniture: twins([
      // benches round the bed's flower bed, on its diagonals, facing in
      ...[[18.6, -16.6], [25.4, -16.6], [18.6, -23.4], [25.4, -23.4]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, SE_MID_X, SE_MID_Z) })),
      // benches on the granite band facing the boulevard
      { kind: 'bench', x: 14.0, z: -11.4, yawDeg: 0 }, { kind: 'bench', x: 30.0, z: -11.4, yawDeg: 0 },
      // the concrete planters at the bed's corners and along the room's trunk-side frontage east of the routes
      ...[[9.2, -12.4], [34.8, -12.4], [9.2, -27.8], [34.8, -27.8]].map(([x, z]) => ({ kind: 'pflanzkuebel', x, z, yawDeg: 0 })),
      { kind: 'trashcan', x: 11.6, z: -11.6, yawDeg: 0 }, { kind: 'trashcan', x: 33.0, z: -28.6, yawDeg: 0 },
    ]),
    // the city's own cars parked at the kerb along the trunk-side frontages, nose to tail (the yugoslav1990s fleet)
    parking: twins([
      { kind: 'sedan', x: 12.5, z: -32.6, yawDeg: 90.8 }, { kind: 'wagon', x: 18.3, z: -32.7, yawDeg: 89.4 },
      { kind: 'sedan', x: 24.0, z: -32.55, yawDeg: 90.5 }, { kind: 'pickup', x: 30.2, z: -32.7, yawDeg: 89.6 },
    ]),
    bayMarks: [],
    lamps: [],
    fountainRing: null,
    steps: [],
    lawns: [SE, NW],
    targets: { records: 50, benches: 8, lawnM2: 600, lampsAround: 0, openShare: 0.06, largestDisc: 10 },
  }],
};
