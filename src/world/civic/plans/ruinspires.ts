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
import type { CivicAreaPlan, CivicBed, CivicFurniture, CivicPlan, CivicRect } from '../types.ts';

/** A point's rotation twin about the centre (the map's symmetry). */
const rot = (p: { x: number; z: number; yawDeg?: number }) => ({ x: -p.x, z: -p.z, yawDeg: ((p.yawDeg ?? 0) + 180) % 360 });
const rotRect = (r: CivicRect): CivicRect => ({ x0: -r.x1, x1: -r.x0, z0: -r.z1, z1: -r.z0 });
/** Each piece and its twin. */
const twins = (list: readonly CivicFurniture[]): CivicFurniture[] => list.flatMap((f) => [f, { ...f, ...rot(f) }]);

const ROOM = { x0: -38, x1: 38, z0: -30, z1: 30 } as const;
// the south-east quarter's planter bed (the north-west's its twin): clear of the boulevard's arm and the x = 4 route
// (229 b1 r1, the gameplay critic: the bots carry the trunk roads' lines x = +-25 straight across the square, and the
// planner's lattice node (25, -25) stood in the bed) the bed west of the trunk axis; east of it a row of planes
const SE = { x0: 10, x1: 19.5, z0: -27, z1: -13 } as const;
const NW = rotRect(SE);
const SE_MID_X = 14.75, SE_MID_Z = -20;

const BED_SE = {
  id: 'planter-se', rect: SE,
  mouths: [{ side: 'n' as const, at: SE_MID_X, width: 3 }, { side: 'w' as const, at: SE_MID_Z, width: 3 }],
  paths: [{ from: [SE_MID_X, SE.z0 + 0.6] as const, to: [SE_MID_X, SE.z1] as const, width: 3 }, { from: [SE.x0, SE_MID_Z] as const, to: [SE.x1 - 0.6, SE_MID_Z] as const, width: 3 }],
  feature: { kind: 'flowerRondell' as const, x: SE_MID_X, z: SE_MID_Z, r: 1.8, ring: 3.2 },
};
const BED_NW = {
  id: 'planter-nw', rect: NW,
  mouths: [{ side: 's' as const, at: -SE_MID_X, width: 3 }, { side: 'e' as const, at: -SE_MID_Z, width: 3 }],
  paths: [{ from: [-SE_MID_X, NW.z1 - 0.6] as const, to: [-SE_MID_X, NW.z0] as const, width: 3 }, { from: [NW.x1, -SE_MID_Z] as const, to: [NW.x0 + 0.6, -SE_MID_Z] as const, width: 3 }],
  feature: { kind: 'flowerRondell' as const, x: -SE_MID_X, z: -SE_MID_Z, r: 1.8, ring: 3.2 },
};

const facing = (x: number, z: number, tx: number, tz: number): number => +(Math.atan2(tx - x, tz - z) * 180 / Math.PI).toFixed(2);

/** (229 b1 r1, the blind critics: "a second Ruinspires square is left completely empty") the west square (pad 1 at
 *  (-225, 0); zone 1) as a smaller plaza of the same make, and the east square (pad 2; zone 3) its rotation twin. The
 *  bots' routes (the 229 routeheat probe: 168 of 560 cross it) come in from the south-east trunk road's mouth to the
 *  zone, along the boulevard's east arm and up x = -225 from the south: the beds stand in the north quarters and the
 *  south-west one, the routes' quarter left open. */
function sideSquare(id: string, pad: number, twin: boolean): CivicAreaPlan {
  const P = (x: number, z: number): [number, number] => (twin ? [-x, -z] : [x, z]);
  const R = (r: CivicRect): CivicRect => (twin ? rotRect(r) : r);
  const F = (f: CivicFurniture): CivicFurniture => (twin ? { ...f, ...rot(f) } : f);
  const room = R({ x0: -263, x1: -187, z0: -30, z1: 30 });
  const NWB = { x0: -258, x1: -234, z0: 13, z1: 27 }, SWB = { x0: -258, x1: -238, z0: -27, z1: -13 };
  const bed = (bid: string, r: CivicRect, side: 's' | 'n'): CivicBed => {
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2, rr = R(r), [cx, cz] = P(mx, mz);
    const flip = twin ? (side === 's' ? 'n' : 's') : side;
    return {
      id: bid, rect: rr,
      mouths: [{ side: flip, at: cx, width: 3 }, { side: twin ? 'w' : 'e', at: cz, width: 3 }],
      paths: [{ from: [cx, rr.z0 + 0.6], to: [cx, rr.z1 - 0.6], width: 3 }, { from: [rr.x0 + 0.6, cz], to: [rr.x1 - 0.6, cz], width: 3 }],
      feature: { kind: 'flowerRondell', x: cx, z: cz, r: 2.0, ring: 3.8 },
    };
  };
  const beds = [bed(`${id}-nw`, NWB, 's'), bed(`${id}-sw`, SWB, 'n')];
  const ring = (r: CivicRect) => { const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    return [[mx - 3.4, mz - 3.4], [mx + 3.4, mz - 3.4], [mx - 3.4, mz + 3.4], [mx + 3.4, mz + 3.4]].map(([x, z]) => ({ kind: 'bench', x, z, yawDeg: facing(x, z, mx, mz) })); };
  const furniture: CivicFurniture[] = [
    // (229 b1 r2, the base battles' tracks: the zone's hulls drive the north bed's south side and the pocket by the trunk
    // route) the north bed's benches on its north side only, its corner planter by the boulevard gone
    ...ring(NWB).filter((b) => b.z > (NWB.z0 + NWB.z1) / 2), ...ring(SWB),
    ...[[-258.8, 12.2], [-258.8, -12.2], [-237.2, -12.2]].map(([x, z]) => ({ kind: 'pflanzkuebel', x, z, yawDeg: 0 })),
    // the north-east quarter's planes in their grates, benches under them facing the boulevard
    { kind: 'bench', x: -212.5, z: 12.4, yawDeg: 180 },
    { kind: 'trashcan', x: -216, z: 12.6, yawDeg: 0 },
    // the strip east of the north lane and the pocket between the south-west bed and the trunk route: planes, benches
    { kind: 'bench', x: -189.6, z: 18.5, yawDeg: -90 },
  ].map(F);
  return {
    id, room,
    paved: R({ x0: -267, x1: -183, z0: -34, z1: 34 }),
    rinnen: [],
    vetoExempt: ['lamp'],
    // (229 b1 r1) the ground beside the square's street mouths the hedgehogs keep off (its own placement, the overlay off:
    // the 6 m pivot discs)
    keepOuts: [R({ x0: -194, x1: -179, z0: -8, z1: 8 }), R({ x0: -271, x1: -256, z0: -8, z1: 8 }), R({ x0: -208, x1: -192, z0: -38, z1: -23 })],
    clears: [],
    pad,
    arms: [R({ x0: -263, x1: -187, z0: -10, z1: 10 }), R({ x0: -207, x1: -193, z0: -30, z1: -10 })],
    corridors: [
      { from: P(-200, -25), to: P(-225, 0), half: 5 }, { from: P(-225, -25), to: P(-225, 0), half: 5 },
      { from: P(-205, -30), to: P(-225, -25), half: 4 }, { from: P(-200, -25), to: P(-195, -5), half: 4 },
      { from: P(-200, 0), to: P(-200, 30), half: 4 },
    ],
    lanes: [],
    holds: [],
    centre: { x: P(-225, 0)[0], z: P(-225, 0)[1], ringR: [8.5, 9.0], roseR: 3, rays: 8 },
    beds,
    paving: [
      { rect: R({ x0: NWB.x0, x1: NWB.x1, z0: 10, z1: NWB.z0 }), kind: 'granite' },
      { rect: R({ x0: SWB.x0, x1: SWB.x1, z0: SWB.z1, z1: -10 }), kind: 'granite' },
    ],
    monument: null,
    trees: {
      species: 'oak', scale: [1.05, 1.2],
      // (229 b1 r2: the north bed's south-east plane and the trunk route's pocket planes stood on the zone's driven lines)
      stations: [[-252.5, 16], [-252.5, 24], [-239.5, 24], [-252.5, -16], [-243.5, -16], [-252.5, -24], [-243.5, -24],
        [-219.5, 17], [-212.5, 17], [-219.5, 24], [-212.5, 24], [-192, 15], [-192, 22]].map(([x, z], i) => {
        const [px, pz] = P(x, z);
        return i >= 7 ? { x: px, z: pz, grate: true } : { x: px, z: pz };
      }),
    },
    furniture,
    parking: [],
    bayMarks: [],
    lamps: [F({ kind: 'lamp', x: -246.5, z: 11.2, yawDeg: 0 }), F({ kind: 'lamp', x: -209, z: 11.0, yawDeg: 0 })],
    fountainRing: null,
    steps: [],
    lawns: [R(NWB), R(SWB)],
    // (229 b1 r2: the zone's driven lines cleared — the open ground they leave is the zone's own)
    targets: { records: 26, benches: 8, lawnM2: 500, lampsAround: 0, openShare: 0.15, largestDisc: 17 },
  };
}

export const RUINSPIRES_CIVIC_PLAN: CivicPlan = {
  mapId: 'ruinspires',
  style: 'sarajevo',
  // (the plaza's sandbag nest is left out by the room's veto after its draws: the overlay keeps its pass running)
  // (229 b1 r1, the gameplay critic's D6: the hedgehogs-at-approaches overlay moved the whole city's hedgehogs, 51 to 28)
  // none: the city's own placement
  overlay: {},
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
    // (229 b1 r1, the blind critics: pavements floating on open ground along the vacant lots) only the fronted stretches,
    // joined over gaps of up to 20 m
    openGapM: 20,
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
      // (229 b1 r1, the gameplay critic's D4) the trunk roads' lines carried across the square
      { from: [25, 36], to: [25, -36], half: 5 }, { from: [-25, -36], to: [-25, 36], half: 5 },
    ],
    lanes: [],
    // (229 b1 r2, the coordinator's ruling: no piece on a driven line) zone 2's 30 m capture disc is the square itself, and
    // the Frontline opening's race to line-2 (7.5, 40.6) crosses it on every diagonal: over twelve base battles (six zone,
    // six Frontline; probes/pace) no ground inside 30 m of the point stays untouched by a hull. Nothing hull-high stands in
    // it: the beds, their lawns and flower rounds, the bands and the roundel are flush; the planes, benches, the planter and
    // the lamps stand in the pockets the battles leave at the square's edges (each pocket's twin as quiet)
    holds: [{ id: 'ac130-extraction', x: 0, z: 0.1, r: 8 }, { id: 'zone-2', x: 0, z: 0, r: 30 }],
    centre: { x: 0, z: 0, ringR: [8.5, 9.0], roseR: 3, rays: 8 },
    beds: [BED_SE, BED_NW],
    paving: [
      // the granite bands between the beds' kerbs and the boulevard's arm, and along their open ends
      { rect: { x0: SE.x0, x1: SE.x1, z0: SE.z1, z1: -10 }, kind: 'granite' },
      { rect: rotRect({ x0: SE.x0, x1: SE.x1, z0: SE.z1, z1: -10 }), kind: 'granite' },
      // (229 b1 r1) the trunk axis across the square laid as a granite band, the planes' row east of it on its own
      { rect: { x0: 30.5, x1: 36.5, z0: -28, z1: -12 }, kind: 'granite' },
      { rect: rotRect({ x0: 30.5, x1: 36.5, z0: -28, z1: -12 }), kind: 'granite' },
    ],
    monument: null,
    trees: {
      // (229 b1 r2) the planes in their grates in the pockets the battles leave, each pocket's twin as quiet and clear of
      // the houses: the north-west corner's pavement and the north edge by the trunk mouth; each with its twin
      species: 'oak', scale: [1.05, 1.2],
      stations: [[-37.5, 33.5], [-31, 34], [-18.8, 31.8]]
        .flatMap(([x, z]) => [{ x, z, grate: true }, { x: -x, z: -z, grate: true }]),
    },
    furniture: twins([
      // (229 b1 r2) two benches under the north-west corner's planes facing the square, its bin; a planter at the
      // south-west corner's pavement (each with its twin)
      { kind: 'bench', x: -34.5, z: 33.5, yawDeg: 180 }, { kind: 'bench', x: -40, z: 35, yawDeg: facing(-40, 35, 0, 0) },
      { kind: 'trashcan', x: -36.5, z: 35.6, yawDeg: 0 },
      { kind: 'pflanzkuebel', x: -44, z: -34, yawDeg: 0 },
    ]),
    // (229 b1 r1, the blind critics: the cars in a row on open paving south of the bed "read like a car-park row") none
    parking: [],
    bayMarks: [],
    // a post of the city's own (shot-out) lamps at the boulevard's west mouth's north corner (229 b1 r2: off the trunk
    // mouths' diagonals, where every battle drove), and its twin at the east mouth's south corner
    lamps: twins([{ kind: 'lamp', x: -38, z: 11.5, yawDeg: 0 }]),
    fountainRing: null,
    steps: [],
    lawns: [SE, NW],
    // (229 b1 r1: the beds west of the trunk axes, 9.5 x 14 m each; r2: the hull-high pieces out of zone 2's disc to the
    // pockets the battles leave, so the room keeps its beds, lawns, flowers and bands and few records)
    targets: { records: 8, benches: 4, lawnM2: 250, lampsAround: 0, openShare: 0.06, largestDisc: 10 },
  }, sideSquare('trg-zapad', 1, false), sideSquare('trg-istok', 2, true)],
};
