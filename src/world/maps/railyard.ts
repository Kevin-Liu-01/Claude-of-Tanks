// src/world/maps/railyard.ts — Cinder Junction, redesigned 2026-10-01 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, building tones, name and id are the map's identity and stay; the battlefield under
// them is new. The old layout was a 3 × 3 street lattice drawn edge to edge across the flattest ground in the
// rotation (relief σ 2.4 m), with seven hard-coded north–south sidings that no road served, under Verdant's landform
// skeleton and its three beat sites; 12.7 % of all sightlines ran 300 m or more down the straight streets.
//
// Reference: a Central European junction on the coalfield (Ruhr, Upper Silesia). A double-track main line crosses the
// graded valley floor on a low embankment. At the junction it opens into a flat yard of parallel sidings between the
// throats, with water towers and engine sheds at the throats, goods sheds on their loading stubs, a coal stage, a
// container terminal and the station. Service roads run along the yard, the main roads cross it at level crossings,
// and the spoil tips, spoil banks and works of the pits stand out on the valley floor.
//
// The story on the ground: the main line comes in on its embankment from the west-south-west, runs through the yard
// past the station square and leaves on its embankment to the east-north-east, through a cutting in each rim into a
// tunnel. Its two tracks close onto one before each cutting. Three sidings fan out each side between the throats; a
// loading stub runs into each goods side, a goods shed on one side of it and a coal stage on the other. The central
// road crosses the yard at the station square between the two station buildings, the crossing roads cross the line
// at the graded throat ends, and a service road runs along each side of the yard. Out on the valley floor stand two
// conical spoil tips, two flat-topped spoil banks run out from the washeries, and two works with their stacks.
//
// The layout is rotationally symmetric about the station square (0, 0). The main line is a straight chord through
// it, and every shed, stack, tip and bank in one half has its counterpart turned through 180°. Alpha comes in from
// the south, bravo from the north; the two station buildings screen the deployments from each other. The three
// zone-control objectives stand on the line and are equally far from both teams: the station square and the two
// level crossings. Three lanes cross the midfield: past the western washery and spoil bank, through the yard, and
// past the eastern works; the embankment and the banks give both sides hull-down ground.

import { WORN_YARD_PAINT } from '../hardstandSurface.ts';

import * as detMath from '../../sim/detMath.ts';
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The main line's centre: a straight chord through the station square, rising 6.6 m per 100 m of easting.
const MAIN_SLOPE = 0.066;
const lineZ = (x: number): number => Math.round(x * MAIN_SLOPE * 10) / 10;
// The double main line (centres 2.3 m either side of the chord) runs out to 352 m each side of the square, where the
// two roads close onto one: the through road eases onto the chord and leaves the square through a cutting into the
// tunnel beyond the rim; the other ends at the junction with it. Three through sidings fan out each side between the
// throats, and a loading stub runs into each goods side with a coal stage beside it (buffer stop at the shed end).
const PORTAL_X = 440;
function mainLine(offsetM: number, side: 1 | -1, through: boolean): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x <= 352; x += 32) out.push([side * x, lineZ(side * x) + offsetM]);
  out.push([side * 384, lineZ(side * 384) + offsetM * 0.5], [side * 416, lineZ(side * 416)]);
  if (through) out.push([side * PORTAL_X, lineZ(side * PORTAL_X)], [side * 512, lineZ(side * 512)]);
  return out;
}
function siding(offsetM: number): [number, number][] {
  return [[-236, lineZ(-236) + Math.sign(offsetM) * 2.3], [-204, lineZ(-204) + offsetM * 0.45], [-172, lineZ(-172) + offsetM],
    [172, lineZ(172) + offsetM], [204, lineZ(204) + offsetM * 0.45], [236, lineZ(236) + Math.sign(offsetM) * 2.3]];
}
// 2026-10-06 (the map-vehicles lane, P5): the yard's standing stock, as the Bundesbahn left a coalfield yard in the
// 1960s — a cut of Omm coal wagons under their loads, two tank wagons, G 10 vans, and a V 60 shunter with its wagon —
// each cut on a north siding with its twin turned through 180 degrees on the south one, so the yard's cover keeps the
// map's rotational symmetry. The station square and the throats stay clear (every cut stands 60-170 m out along the
// straight between the throats) and a gap of 20 m or more lies between cuts for a hull to cross the yard.
const STOCK_LENGTH: Readonly<Record<string, number>> = { omm: 10.0, g10: 9.1, tank: 9.0, v60: 10.45 };
/** Distance along a siding's path from its first point to the point over easting x (on its straight). */
function sidingDistanceAt(path: readonly (readonly [number, number])[], x: number): number {
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const run = detMath.hypot(bx - ax, bz - az);
    if (x <= bx) return walked + run * ((x - ax) / (bx - ax));
    walked += run;
  }
  return walked;
}
type StockCut = { fromX: number; kinds: readonly string[] };
/** A north siding's cuts and their 180-degree twins on the south one (the order reversed, the vehicles turned). */
// The yard's ballast tone (railSpurs.ts ballastShade): the sidings and stubs on cinder and coal dust at half the stone's
// tone, the main line through the yard dusted by it at four fifths
const YARD_BALLAST = 0.5, MAIN_BALLAST = 0.8;
type StockSpur = { path: [number, number][]; stock: { atM: number; kinds: readonly string[]; facingBack?: boolean }[]; ballastShade: number };
function stockPair(offsetM: number, cuts: readonly StockCut[]): [StockSpur, StockSpur] {
  const north = siding(offsetM), south = siding(-offsetM);
  const total = sidingDistanceAt(south, 236);
  const northStock = cuts.map((cut) => ({ atM: sidingDistanceAt(north, cut.fromX), kinds: cut.kinds }));
  const southStock = cuts.map((cut) => {
    const length = cut.kinds.reduce((sum, kind) => sum + STOCK_LENGTH[kind], 0);
    return { atM: total - sidingDistanceAt(north, cut.fromX) - length, kinds: [...cut.kinds].reverse(), facingBack: true };
  });
  // (round 3, 2026-10-11; waves 362 and 396b: "black cinder and coal-dust ballast") the sidings bedded in the yard's cinder
  return [{ path: north, stock: northStock, ballastShade: YARD_BALLAST }, { path: south, stock: southStock, ballastShade: YARD_BALLAST }];
}
const [STOCK_9N, STOCK_9S] = stockPair(9, [{ fromX: 72, kinds: ['omm', 'omm', 'omm'] }, { fromX: -122, kinds: ['tank', 'tank'] }]);
const [STOCK_15N, STOCK_15S] = stockPair(15, [{ fromX: -166, kinds: ['g10', 'g10'] }]);
const [STOCK_21N, STOCK_21S] = stockPair(21, [{ fromX: 122, kinds: ['omm', 'v60'] }]);

const RAIL_SPURS = [
  { path: mainLine(2.3, 1, true), cutting: { from: [PORTAL_X, lineZ(PORTAL_X)] as [number, number] }, ballastShade: MAIN_BALLAST },
  { path: mainLine(-2.3, 1, false), ballastShade: MAIN_BALLAST },
  { path: mainLine(-2.3, -1, true), cutting: { from: [-PORTAL_X, lineZ(-PORTAL_X)] as [number, number] }, ballastShade: MAIN_BALLAST },
  { path: mainLine(2.3, -1, false), ballastShade: MAIN_BALLAST },
  STOCK_9N, STOCK_15N, STOCK_21N,
  STOCK_9S, STOCK_15S, STOCK_21S,
  { path: [[64, lineZ(64) - 30], [180, lineZ(180) - 34]] as [number, number][], bufferStop: 'end' as const,
    coalStage: { side: -1 as const, fromM: 4, toM: 40 }, ballastShade: YARD_BALLAST },
  { path: [[-64, lineZ(-64) + 30], [-180, lineZ(-180) + 34]] as [number, number][], bufferStop: 'end' as const,
    coalStage: { side: -1 as const, fromM: 4, toM: 40 }, ballastShade: YARD_BALLAST },
];

// Yard plan: the authored lots below take the landmarks (engine shed, goods shed, water towers, station hall, gantries,
// stacks). (Round 2: the miners live in the colonies' terraces, so the plan's three loose cottage pairs went.)
// (Round 3, 2026-10-11: the r2 fairness read 16-4 to alpha at 20 games. The roadside plan seated its sheds, ruins and
// container rows where its stream put them — 13 in alpha's half and 6 in bravo's — so alpha came to the yard through
// twice the cover. The plan is frozen as it last placed them in the southern half, each building with its twin turned
// through 180 degrees about the station square (FROZEN_FRONTAGE below): the rotational symmetry the map's layout keeps
// for every authored lot now holds for every building. No generated plan.)
const PLAN: string[] = [];
// The southern half's frontage buildings as the r2 plan placed them (structure, pose); their twins are made below.
const FROZEN_FRONTAGE_SOUTH: readonly { structure: string; x: number; z: number; yawDeg: number }[] = [
  { structure: 'shed', x: -248.31, z: -68.03, yawDeg: 1.13 },
  { structure: 'shed', x: -226.86, z: -63.53, yawDeg: 80.52 },
  { structure: 'ruin', x: -223.1, z: -94.82, yawDeg: 81.58 },
  { structure: 'containerRow', x: -175.79, z: -61.36, yawDeg: 86.17 },
  { structure: 'shed', x: -125.79, z: -58.33, yawDeg: 89.31 },
  { structure: 'ruin', x: -99.24, z: -85.14, yawDeg: 88.68 },
  { structure: 'containerRow', x: -74.4, z: -83.98, yawDeg: 85.88 },
  { structure: 'warehouse', x: -54.64, z: -107.67, yawDeg: 3.76 },
  { structure: 'shed', x: 176.54, z: -67.91, yawDeg: 82.72 },
  { structure: 'warehouse', x: 201.46, z: -64.63, yawDeg: 83.61 },
  { structure: 'containerRow', x: 223.71, z: -34.64, yawDeg: 82.26 },
  // (2026-10-28, the world-reds lane; mapLayoutBrief since 241) 3.5 m south of where the r2 plan put it (z -20.44): built
  // as its twin's twin since the 241 restyle, its 27 m end stood 1.8 m on the east crossing's apron and 2 m inside zone
  // 3's 30 m disc (its twin likewise in zone 1's), so both zones seated 8 m off their aprons
  { structure: 'warehouse', x: 250.71, z: -23.94, yawDeg: 177.73 },
  { structure: 'shed', x: 251.23, z: -57.3, yawDeg: 84 },
];

// 2026-10-11 (the map-revival lane, Cinder Junction round 2; gauntlet wave 362, village-mid: "a thin scatter of clean
// orange brick boxes on protruding slab plinths standing in wide empty dirt lots beside a uniformly tiled cobbled street
// with no kerbs, pavements, gutters, street trees or clutter ... nothing like the dense, soot-darkened terraced streets
// round a 1962 Ruhr junction"): a colliery colony (Zechenkolonie) behind each service road, as the pits built them for
// their miners — two-storey brick terraces in rows along the service road and along a back street 52 m behind it, the
// rows back to back over their gardens, two side streets cutting each colony into three blocks, kerbs and pavements on
// every street. The southern colony stands east of the central road (alpha's side), its twin turned through 180° about
// the station square west of it (bravo's side). The rows are the buildings lane's Ruhr terrace kit ('terrace': one site a
// row, plot.w the frontage, 2-8 units of about 5.5 m; doors on the plot's +z edge, the pavement's outer edge).
const SERVICE_ROAD_SOUTH: readonly (readonly [number, number])[] = [[-448, -96], [-400, -96], [-300, -88], [-200, -76],
  [-100, -70], [0, -66], [100, -60], [200, -50], [300, -40], [400, -30], [448, -27]];
/** A path's twin, turned through 180° about the station square (the point order kept, as roads 4 and 6 have it). */
const twinPath = (path: readonly (readonly [number, number])[]): [number, number][] =>
  path.map(([x, z]) => [-x, -z] as [number, number]);
/** The service road's centre over easting x (the road runs west to east, once over every x). */
function serviceZ(x: number): number {
  const l = SERVICE_ROAD_SOUTH;
  for (let i = 1; i < l.length; i++) {
    if (x <= l[i][0]) return l[i - 1][1] + (l[i][1] - l[i - 1][1]) * (x - l[i - 1][0]) / (l[i][0] - l[i - 1][0]);
  }
  return l[l.length - 1][1];
}
const COLONY_BACK_M = 52;      // the back street's offset behind the service road
const ROW_FRONT_M = 7.5;       // a row's doorsteps: the pavement's outer edge (kerb 5.05 m, walk 6.35 ± 1.1 m)
const ROW_DEPTH_M = 11;        // the plot: the 8.2 m block and its wash-house additions
const ROW_STRUCTURE = 'terrace';
// the back street: off the central road (on its line at z -119.5) to the works road (on its line at t 0.551)
const COLONY_BACK_SOUTH: [number, number][] = [-39.35, 0, 100, 165.71].map((x) => [x, +(serviceZ(x) - COLONY_BACK_M).toFixed(2)]);
const COLONY_SIDE_X = [46, 112] as const;
// (a side street authored every 6.5 m: the junction grading blends three nodes either side of a junction, and a
// street of three nodes took its far end's grade at its near one — the back street's 2 m up the hill foot stood as a
// step at the service road, 22 per cent over its first 4 m)
const colonySideStreet = (x: number): [number, number][] =>
  Array.from({ length: 9 }, (_, i) => [x, +(serviceZ(x) - COLONY_BACK_M * i / 8).toFixed(2)] as [number, number]);
/**
 * One terrace row fronting a street that runs west to east as z = streetZ(x), from easting xa to xb: on the street's
 * south side facing north (side -1) or its north side facing south (side +1). Its plot runs along the chord between the
 * street's points over xa and xb, its front on the pavement's outer edge.
 */
function terraceRow(streetZ: (x: number) => number, xa: number, xb: number, side: 1 | -1) {
  const ax = xa, az = streetZ(xa), bx = xb, bz = streetZ(xb);
  const len = detMath.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
  const nx = -uz, nz = ux; // the street's left: north
  const off = side * (ROW_FRONT_M + ROW_DEPTH_M / 2);
  const fx = -side * nx, fz = -side * nz; // the doors face the street
  return {
    structure: ROW_STRUCTURE, x: +((ax + bx) / 2 + nx * off).toFixed(2), z: +((az + bz) / 2 + nz * off).toFixed(2),
    yawDeg: +(detMath.atan2(fx, fz) * 180 / Math.PI).toFixed(2), plot: { w: +len.toFixed(2), d: ROW_DEPTH_M }, terrace: true,
  };
}
const backZ = (x: number): number => serviceZ(x) - COLONY_BACK_M;
// The southern colony's blocks, west to east between the central road, the side streets and the works road: each a
// row on the service road (facing north) and a row on the back street (facing south), back to back over their gardens.
// A 5 m ginnel (a hull fits through) splits the first block; every row's gables stand clear of the cross streets'
// pavements.
const COLONY_BLOCKS_SOUTH: readonly { north: readonly [number, number]; south: readonly [number, number] }[] = [
  { north: [-26, 2.5], south: [-26, 2.5] }, { north: [7.5, 36], south: [7.5, 36] },
  { north: [56, 100], south: [56, 100] }, { north: [120, 142], south: [120, 152] },
];
const COLONY_ROWS_SOUTH = COLONY_BLOCKS_SOUTH.flatMap((b) => [
  terraceRow(serviceZ, b.north[0], b.north[1], -1), terraceRow(backZ, b.south[0], b.south[1], 1)]);
const twinSite = <T extends { x: number; z: number; yawDeg: number }>(site: T): T =>
  ({ ...site, x: -site.x, z: -site.z, yawDeg: +(site.yawDeg + 180).toFixed(2) });
const COLONY_ROWS = [...COLONY_ROWS_SOUTH, ...COLONY_ROWS_SOUTH.map(twinSite)];
// The gardens behind the rows (props.gardenFences, the Ruhr colony's rough boards): a divider on every party wall and at
// each gable, from the row's back edge to the block's middle, and the back fence along the middle, where the two rows'
// gardens meet. The kit's unit rule (clamp(round(w / 5.5), 2, 8) units of w / units) sets the party walls.
const GARDEN_M = (COLONY_BACK_M - 2 * (ROW_FRONT_M + ROW_DEPTH_M)) / 2;
function rowGardenLines(row: (typeof COLONY_ROWS_SOUTH)[number]): [number, number, number, number][] {
  const yaw = row.yawDeg * Math.PI / 180, c = detMath.cos(yaw), sn = detMath.sin(yaw);
  const units = Math.min(8, Math.max(2, Math.round(row.plot.w / 5.5)));
  const at = (lx: number, lz: number): [number, number] =>
    [+(row.x + lx * c + lz * sn).toFixed(2), +(row.z - lx * sn + lz * c).toFixed(2)];
  const lines: [number, number, number, number][] = [];
  for (let k = 0; k <= units; k++) {
    const lx = -row.plot.w / 2 + k * row.plot.w / units;
    lines.push([...at(lx, -row.plot.d / 2), ...at(lx, -row.plot.d / 2 - GARDEN_M)]);
  }
  return lines;
}
const COLONY_GARDENS_SOUTH: [number, number, number, number][] = [
  ...COLONY_ROWS_SOUTH.flatMap(rowGardenLines),
  ...COLONY_BLOCKS_SOUTH.map((b): [number, number, number, number] => {
    const x0 = Math.min(b.north[0], b.south[0]), x1 = Math.max(b.north[1], b.south[1]);
    const mid = (x: number) => +(serviceZ(x) - COLONY_BACK_M / 2).toFixed(2);
    return [x0, mid(x0), x1, mid(x1)];
  }),
];
const COLONY_GARDENS = [...COLONY_GARDENS_SOUTH,
  ...COLONY_GARDENS_SOUTH.map(([x0, z0, x1, z1]): [number, number, number, number] => [-x0, -z0, -x1, -z1])];
// Poplars along the back streets' far verge, over the hill (vegetation.authoredTrees: donors from the procedural stands,
// so no other tree's draw moves).
const COLONY_POPLARS_SOUTH: [number, number][] = [[-30, backZ(-30) - 9], [100, backZ(100) - 9], [158, backZ(158) - 9]];

/** The light buildings the roadside pass seated on round 3's tree (kind, pose; rot in radians), pinned with their twins. */
const LIGHT_BUILDINGS = [
  { kind: 'quonsethut', x: 100.88, z: 52.34, rot: -89.04 * Math.PI / 180 },
  { kind: 'transformershed', x: 50.69, z: 50.85, rot: -96.59 * Math.PI / 180 },
  { kind: 'motorpool', x: -167.03, z: 118.65, rot: -91.29 * Math.PI / 180 },
  { kind: 'guardpost', x: -253.74, z: -95.37, rot: -0.02 * Math.PI / 180 },
] as const;

export default {
  id: 'railyard',
  name: 'Cinder Junction',
  blurb: 'A coalfield rail junction — a yard of sidings on the main line, level crossings, spoil tips and works',

  terrain: {
    hillScale: 0.6,   // the valley floor's broad drainage grades (was 0.45: the flattest map in the rotation)
    microScale: 0.8,
    rimH: 22,
    marshes: [],
    // The yard: one graded rect around the station square, out past the throats to the level crossings.
    village: { x0: -270, x1: 270, z0: -96, z1: 96, cx: 0, cz: 0, feather: 46, flatten: 0.93, relief: 0.2 },
    railSpurs: RAIL_SPURS,
    roads: { paths: [
      // 0 — the central road: south edge, across the yard at the station square, north edge. Road 0 carries the
      // utility-pole line (mapQuality).
      // It enters the square past the south-west corner of the station building and leaves past the north-east
      // corner of its twin, so no street runs from one deployment to the other.
      [[-28, -448], [-30, -420], [-34, -320], [-38, -220], [-40, -130], [-36, -66], [-24, -34], [0, 0], [24, 34],
        [36, 66], [40, 130], [38, 220], [34, 320], [30, 420], [28, 448]],
      // 1 / 2 — the crossing roads: over the line at a level crossing at each graded throat end.
      [[-288, -448], [-286, -400], [-276, -280], [-266, -150], [-262, -40], [-266, 80], [-282, 220],
        [-300, 360], [-304, 448]],
      [[288, 448], [286, 400], [276, 280], [266, 150], [262, 40], [266, -80], [282, -220], [300, -360],
        [304, -448]],
      // 3 / 4 — the yard service roads, edge to edge along each side of the yard.
      SERVICE_ROAD_SOUTH.map(([x, z]) => [x, z] as [number, number]),
      twinPath(SERVICE_ROAD_SOUTH),
      // 5 / 6 — the works roads: off the service road, through the works gate, out to the crossing road.
      [[150, -55], [158, -90], [172, -118], [204, -150], [244, -184], [281, -210]],
      [[-150, 55], [-158, 90], [-172, 118], [-204, 150], [-244, 184], [-281, 210]],
      // 7 / 8 — the colonies' back streets, central road to works road; 9-12 — their side streets (round 2)
      COLONY_BACK_SOUTH, twinPath(COLONY_BACK_SOUTH),
      ...COLONY_SIDE_X.flatMap((x) => [colonySideStreet(x), twinPath(colonySideStreet(x))]),
    ] },
    // The station square and the two level-crossing aprons: level paved ground the zone-control placement seats
    // its 30 m discs on (the crossings lie inside the yard's grading, so their roads reach them at a road grade).
    hardstands: [
      { x: 0, z: 0, width: 62, length: 62, yawDeg: 0, grade: 0, paint: WORN_YARD_PAINT },
      { x: -262, z: lineZ(-262) - 4, width: 60, length: 60, yawDeg: 4, grade: 0, paint: WORN_YARD_PAINT },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): at its ground's median height, a 16 m bank
      { x: 262, z: lineZ(262) + 4, width: 60, length: 60, yawDeg: 4, level: 1.6, grade: 0, bankM: 16, paint: WORN_YARD_PAINT },
    ],
    landforms: [
      // The main-line embankment outside the yard, each half from the throat to the cutting.
      { kind: 'ridge', x: -372, z: lineZ(-372), length: 300, width: 44, height: 2.8, yawDeg: 3.8, settlementScale: 0.6 },
      { kind: 'ridge', x: 372, z: lineZ(372), length: 300, width: 44, height: 2.8, yawDeg: 3.8, settlementScale: 0.6 },
      // The spoil tips: tall black cones out on the valley floor, one in each half.
      // (round 3, 2026-10-11; wave 396b: "bare rounded hills with empty ridges") each tip's flanks cut by the rain's rills
      // down the shale, a rough surface and a broken foot (landformGeology.ts): a tip, not a rounded mound
      { kind: 'knoll', x: -322, z: -238, rx: 70, rz: 62, height: 15, yawDeg: 20,
        geology: { profile: 'cone', outline: 0.12, gullies: { count: 12, depthM: 1.4, width: 0.42 }, fans: { reach: 0.22, heightM: 0.9 }, rough: 0.7 } },
      { kind: 'knoll', x: 322, z: 238, rx: 70, rz: 62, height: 15, yawDeg: 20,
        geology: { profile: 'cone', outline: 0.12, gullies: { count: 12, depthM: 1.4, width: 0.42 }, fans: { reach: 0.22, heightM: 0.9 }, rough: 0.7 } },
      // The spoil banks: long flat-topped tips run out from the washeries across the valley floor, their flanks at
      // the spoil's angle of repose — south-west of the yard and, turned through 180°, north-east of it.
      // (round 3) their flanks rilled as the tips' are
      { kind: 'ridge', x: -176, z: -160, length: 150, width: 40, height: 11, yawDeg: 84,
        geology: { outline: 0.12, gullies: { count: 9, depthM: 1.1, width: 0.4 }, rough: 0.6 } },
      { kind: 'ridge', x: 176, z: 160, length: 150, width: 40, height: 11, yawDeg: 84,
        geology: { outline: 0.12, gullies: { count: 9, depthM: 1.1, width: 0.4 }, rough: 0.6 } },
      // The drainage grades: a shallow trough in the open fields in front of each deployment's works.
      { kind: 'basin', x: 60, z: -230, rx: 150, rz: 60, height: -2.4, yawDeg: 6 },
      { kind: 'basin', x: -60, z: 230, rx: 150, rz: 60, height: -2.4, yawDeg: 6 },
    ],
  },

  spawns: {
    // Alpha deploys south of the yard between the spoil bank and the eastern works; bravo's pads are the rotation.
    player: { x: -40, z: -400 },
    enemies: [
      { x: 40, z: 400 }, { x: -12, z: 388 }, { x: 92, z: 388 }, { x: -58, z: 368 },
      { x: 138, z: 368 }, { x: 14, z: 430 }, { x: 66, z: 430 },
    ],
  },

  splat: {
    grassTone: (h: number, s: number, l: number) => [0.16, clamp01(s * 0.42), clamp01(l * 0.88)], // trodden verge scrub
    dirtTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.30), clamp01(l * 0.98 + 0.02)], // ash/cinder
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.25), clamp01(l * 0.95)], // concrete grey
    mudTone: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.5), clamp01(l * 0.9)],
    tintA: [1.02, 1.0, 0.92], tintB: [0.82, 0.84, 0.80], tintC: [1.04, 1.02, 0.96],
    // concrete-grey carriageway, fully paved (R layer = warm-neutral sett)
    roadTint: [0.60, 0.60, 0.58],
    roadTexMix: 0.9,
    townWear: 2.6, // the yard floor is worked bare — cinder, not lawn (r2: +0.4)
    microAmp: 0.7,
  },

  vegetation: {
    species: ['poplar', 'birch', 'oak'],
    clusterMix: [['poplar', 0.42], ['birch', 0.33], ['oak', 0.25]],
    loneMix: [['poplar', 0.44], ['birch', 0.31], ['oak', 0.25]],
    rimMix: [['poplar', 0.38], ['birch', 0.34], ['oak', 0.28]],
    clusterCount: 9,  // scrub survives only outside the worked ground
    // (2026-10-11, round 3d, the map-revival lane; round 3b's fairness: alpha 27-13 at 40 with every authored site, road,
    // siding and cut of stock in rotational pairs — the census of the shard: the woods south of the town stood where
    // alpha comes up (alpha's half 157 concealers in the core, bravo's 104; a 40 m cell of 43 trees at (40..80, -280..-240)
    // with none at its twin), and its kills came from the cover beside the square; evening the halves' counts (the Redrock
    // lane's coverHalvesAbout, try 3c) left 58 concealers against 11 within 150 m) the playable square's trees and shrubs
    // in rotational pairs about the square (vegetation.ts rotationalCover)
    rotationalCover: { x: 0, z: 0 },
    loneCount: 34,
    rimCount: 66,
    grassDensity: 0.45,
    bushCount: 0.7,
    bushSpecies: 'oak',
    // round 2: the colonies' back streets lined with poplars on their far verge
    authoredTrees: [
      { id: 'colony-south-poplars', species: 'poplar', path: COLONY_POPLARS_SOUTH, count: 18, width: 0.5 },
      { id: 'colony-north-poplars', species: 'poplar', path: COLONY_POPLARS_SOUTH.map(([x, z]) => [-x, -z] as [number, number]), count: 18, width: 0.5 },
    ],
    grassTexTone: (h: number, s: number, l: number) => [0.14, clamp01(s * 0.55), clamp01(l * 0.95)],
    tuftTone: (h: number, s: number, l: number) => [0.135, clamp01(s * 0.6), clamp01(l * 0.88)],
    palettes: {
      oak: { // soot-dulled wasteland scrub
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.85), clamp01(s * 0.6), clamp01(l * 0.94)],
        cardHue: 0.17, cardSat: 0.22,
        canopy: { hue: 0.18, sat: 0.22, l0: 0.24, l1: 0.36 },
      },
      birch: {
        texTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.5), clamp01(l * 0.9 + 0.04)],
        cardHue: 0.14, cardSat: 0.26, cardL0: 0.36,
        canopy: { hue: 0.15, sat: 0.26, l0: 0.32, l1: 0.46 },
        jitterHue: 0.5,
      },
    },
  },

  props: {
    // regional-buildings lane: the Ruhr colliery-junction kit (maps/regional/ruhr.ts)
    architecture: 'ruhr',
    plan: PLAN,
    // round 2: the settlement the props dress reaches the colonies' back streets (the graded yard stays as it was), and
    // every street in it has its kerbs and pavements
    town: { x0: -270, x1: 270, z0: -128, z1: 128, cx: 0, cz: 0 },
    curbs: true,
    // round 2: a plan building the new streets leave standing in a carriageway steps clear of it; the colonies' gardens
    gardenFences: { kind: 'fenceplank', lines: COLONY_GARDENS },
    roadBuildingClearance: true,
    // the crossing roads' corners with the service roads: a long roadside shed seated there reached into both roads
    roadBuildingKeepouts: [{ x: 252, z: 96, r: 16 }, { x: -252, z: -96, r: 16 }],
    destructibleBuildings: ['quonsethut', 'transformershed', 'motorpool', 'guardpost'],
    // (the maps-restyle lane, 2026-10-22: the fairness ask's twin law, props.ts PropsMapConfig.rotationalCentre) the layout
    // turns about the station square: the random hulks stand in twins about it (the light buildings are pinned below)
    rotationalCentre: [0, 0],
    // (2026-10-11, the map-revival lane, round 3's fairness: alpha won 26-14 at 40 all-bot games, the north team dying
    // round the centre under fire from the south-east quarter) the light buildings stand in rotational pairs about the
    // centre: the four the roadside pass seated (a quonset hut and a transformer shed in the north-east quarter by the
    // centre, a motor pool to the north-west, a guard post to the south-west), each with its twin turned through 180
    // degrees, pinned (the pass draws nothing: its own stream, so no other draw moves)
    townLightPlan: [
      ...LIGHT_BUILDINGS,
      ...LIGHT_BUILDINGS.map(({ kind, x, z, rot }) => ({ kind, x: -x, z: -z, rot: rot + Math.PI })),
    ],
    // Rotational pairs about the station square, each at least 180 m from every other: a post covering each level
    // crossing from the open field beyond it, a gate at each works, a camp at the outer foot of each spoil bank.
    tacticalBeats: [
      { id: 'west-crossing-post', role: 'brawl', x: -310, z: -66, yawDeg: 40,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 } },
      { id: 'east-crossing-post', role: 'brawl', x: 310, z: 66, yawDeg: 220,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 } },
      { id: 'south-works-gate', role: 'support', x: 198, z: -112, yawDeg: 135,
        structure: 'transformershed', redoubt: true, outcrop: { count: 5, radius: 9 } },
      { id: 'north-works-gate', role: 'support', x: -198, z: 112, yawDeg: 315,
        structure: 'transformershed', redoubt: true, outcrop: { count: 5, radius: 9 } },
      { id: 'south-bank-camp', role: 'scout', x: -200, z: -260, yawDeg: 20,
        structure: 'quonsethut', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
      { id: 'north-bank-camp', role: 'scout', x: 200, z: 260, yawDeg: 200,
        structure: 'quonsethut', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
    ],
    // The yard's buildings and the works, every lot with its 180° twin. A building's long side follows the tracks
    // (yaw 86.2: its local +Z along the line's bearing).
    plannedSites: [
      // the station buildings, on the square's south and north sides
      { structure: 'depot', x: -4, z: -44, yawDeg: 86.2 },
      { structure: 'depot', x: 4, z: 44, yawDeg: 266.2 },
      // the goods sheds beside their loading tracks
      { structure: 'warehouse', x: -120, z: 38, yawDeg: 86.2 },
      { structure: 'warehouse', x: 120, z: -38, yawDeg: 266.2 },
      // the water towers at the throats, and an engine shed across the line from each
      { structure: 'watertower', x: -196, z: 24, yawDeg: 0 },
      { structure: 'watertower', x: 196, z: -24, yawDeg: 180 },
      { structure: 'warehouse', x: -200, z: -50, yawDeg: 86.2 },
      { structure: 'warehouse', x: 200, z: 50, yawDeg: 266.2 },
      // the goods (the freight rows: the period's crates, sheeted loads, steel and timber — maps/periodFreight.ts) by the
      // station on the north side, and its twin; (round 3, 2026-10-11; gauntlet wave 396b: "the goods aren't at the
      // stubs") the other two rows of each side at the loading stub, past its goods shed on the coal stage's side, where
      // the wagons are loaded (were at x 110 and 150 off the stub's yard side)
      { structure: 'containerRow', x: 70, z: 40, yawDeg: -3.8 },
      { structure: 'containerRow', x: -145, z: 29.6, yawDeg: -3.8 },
      { structure: 'containerRow', x: -168, z: 29, yawDeg: -3.8 },
      { structure: 'containerRow', x: -70, z: -40, yawDeg: 176.2 },
      { structure: 'containerRow', x: 145, z: -29.6, yawDeg: 176.2 },
      { structure: 'containerRow', x: 168, z: -29, yawDeg: 176.2 },
      // the coal washeries at the foot of the spoil banks, between the service road and the bank
      { structure: 'warehouse', x: -130, z: -104, yawDeg: 0 },
      { structure: 'warehouse', x: 130, z: 104, yawDeg: 180 },
      // the works: the shop along the works road, its stack and shed behind, the manager's house past the gate
      { structure: 'factory', x: 178, z: -144, yawDeg: 135 },
      { structure: 'factory', x: -178, z: 144, yawDeg: 315 },
      { structure: 'stack', x: 196, z: -166, yawDeg: 0 },
      { structure: 'stack', x: -196, z: 166, yawDeg: 180 },
      { structure: 'shed', x: 158, z: -132, yawDeg: 135 },
      { structure: 'shed', x: -158, z: 132, yawDeg: 315 },
      { structure: 'rowhouse', x: 240, z: -165, yawDeg: 130.4 },
      { structure: 'rowhouse', x: -240, z: 165, yawDeg: 310.4 },
      // round 2: the colonies' terraces (each from its own stream: every lot and the plan keep their draws)
      ...COLONY_ROWS,
      // round 3: the yard's frontage buildings, the southern half's and their twins (each from its own stream and past the
      // spacing check, as the terraces: their poses are the plan's own, which kept them apart)
      ...[...FROZEN_FRONTAGE_SOUTH, ...FROZEN_FRONTAGE_SOUTH.map(twinSite)].map((site) => ({ ...site, terrace: true })),
    ],
    // 2026-10-01: the hard-coded north-south siding fan (maps/mapKits.ts dressRailYard) gives way to the authored
    // main line and sidings above (terrain.railSpurs): no legacy rail kit.
    extraKits: [],
    blockFill: false, // (round 3: no generated plan, nothing to fill — was true)
    sideSkip: 0.08, spacingPad: 6,
    buildingLat: [12, 5], maxSpread: 2.4,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.30), clamp01(l * 0.88)], // sooty render
      plaster2: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.35 + 0.06), clamp01(l * 0.80)],
      plaster3: (h: number, s: number, l: number) => [0.55, clamp01(s * 0.15 + 0.03), clamp01(l * 0.78)],
      roof: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.18), clamp01(l * 0.80 + 0.04)], // weathered sheet grey (r2: lifted — read near-black under the deck)
      stone: (h: number, s: number, l: number) => [0.05, clamp01(s * 0.55 + 0.08), clamp01(l * 0.98 + 0.03)], // smoke-stained brick (r2: lifted)
      wood: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.55), clamp01(l * 0.85)], // creosoted timber
      straw: null,
    },
    // (round 3; wave 396b: "identical white pebbles") the stones slag and sooted rubble, half their lightness (was l x 0.82)
    rockTone: (h: number, s: number, l: number) => [0.07, 0.06, clamp01(l * 0.45 + 0.03)], // slag and sooted rubble
    wallStoneChance: 0.75,
    // Brick walls: the yard's outer boundary behind each service road, the works compounds and field walls on the
    // approaches, each run with its 180° twin.
    wallRuns: [
      [-228, -90, -120, -86, 2], [228, 90, 120, 86, 2],
      [-130, -300, -70, -304, 3], [130, 300, 70, 304, 3], [60, -332, 124, -322, 1], [-60, 332, -124, 322, 1],
      [-420, -150, -360, -140, 2], [420, 150, 360, 140, 2],
    ],
    well: false, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // (round 3; wave 396b: "identical white pebbles" on the yard floor) a third of the loose stones (60 -> 20)
    haystacks: 0, rocks: 20, outcrops: 4, craters: 62, rubblePiles: 60,
    lampposts: true, hedgehogs: 8,
    // Legacy-map quality backport: modern hulks on the yard aprons (baked roster tanks) —
    // the armor that fought over the railhead
    // the map-vehicles lane (2026-10-06, the period ruling): a German coalfield junction in the 1960s: the
    // Bundeswehr's M48s and M47s, the Rhine Army's Centurions
    // (round 3's fairness: two random hulks stood by the centre in the north-east quarter with no twins) the hulks stand
    // in twins about the station square (props.rotationalCentre below; the maps-restyle lane, 2026-10-22, in place of
    // round 3b's count 0); the crossing posts' own wrecks are off (the east post's never found ground, so the west one
    // stood alone)
    tankWrecks: { era: 'cold-war', count: 6, debris: true, ids: ['m48a5_patton', 'centurion5_2', 'm47_patton'] },
    sandbagLines: 10,
    // (round 3c) no field works at random: round 3b's three stood both pillboxes in bravo's half (x 13-18, z 151-198)
    fieldWorks: 0,
    // (round 3e, 2026-10-12) each planned site's twin built as one building turned about the square (props.ts
    // plannedSiteTwins): r3d's fairness still leaned 17-11 with the woods paired, its kills from x 40-80 just south of the
    // line, and the pairs stood as different buildings (the depots 20.3 and 17.8 m wide, the goods sheds 17.9 and 15.4 m)
    plannedSiteTwins: { x: 0, z: 0 },
    // world-dressing r1: brick yard walls; industrial inhabitants — oil-drum
    // ranks + pallet/crate stacks along the aprons, benches by the depot
    wallStyle: 'brick',
    // (2026-10-11, the map-revival lane; gauntlet wave 362: "plain beige cartons with tan edge tape on bright white pallet
    // slats ... none of it reads as 1962"; "the regionally wrong white picket fence by the shed") no carton and pallet
    // scatter in the yard — its goods are the freight rows' crates, sheets and timber — and the yards' fences post-and-rail,
    // as the road fences are (was coreClutter 10, the yards' default picket)
    inhabit: {
      benches: 3, coreClutter: 0,
      drums: 16,
      handcarts: 1, carts: 1,
      roadFence: 'fencerail', yardFence: 'fencerail',
      // DESTRUCTIBLES r1: railhead logistics — truck ranks on the aprons,
      // fuel points between the sidings, ammo stacks
      trucks: 4, jeeps: 1, drumClusters: 4, camps: 1,
      modernClutter: { barrier: 9, roadsign: 7, cone: 10, transformer: 7, cablespool: 7 },
    },
    townCraters: true, // shell pocks on the hardstand
  },


  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the coalfield's grid. A
  // 220 kV line strides across the south of the junction on lattice towers, past the spoil tips.
  scenery: {
    powerLines: [{ towers: [[-445, -140], [-180, -300], [110, -330], [430, -300]], heightM: 34, name: 'the 220 kV line' }],
  },
  horizon: {
    // industrial hinterland: low escarpment under smoke-grey haze
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): Ruhr and Silesian junction country:
    // low rolling hills under the haze, no range
    baseHex: 0x4f554a, amp: 0.6, style: 'escarpment', treeline: 0.90, panorama: { regional: 'upland', ampM: 160, trees: 10 },
    forestHex: 0x35402f, rockHex: 0x62655c, haze: 1.06, grain: 0.8,
  },

  // 2026-10-16 (the coordinator's ruling: Cinder Junction goes cumulus everywhere — desktop, the phones' bake and the
  // Garage — nearer the owner's fair-weather bar): the closed industrial deck gives way to a junction's hazy summer
  // cumulus, Verdant's type, fuller in the smoky air (coverage 0.45, base 1100 m, 800 m deep, a few towers). The industrial
  // character stays in the haze, the smoke and the aerial perspective (the sky block's grade and smog band), not in a
  // ceiling; the works' glow stays on the bases at night
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.45, baseM: 1100, thicknessM: 800, towers: 0.15, streets: 0.3, cirrus: 0.2, nightGlow: 0.85, nightGlowHex: 0xffa050 },
  sky: {
    // (2026-10-14: the flat overcast went with the deck — the sky.ts deck auto-detect no longer trips: a hazy high sun,
    // the turbidity 9 -> 6.5 of a smoky summer day, the fill lowered toward a sunlit yard's; the phones' baked deck takes
    // Verdant's cumulus deck in a smoke-warmed white)
    sunElevationDeg: 42, sunAzimuthDeg: 115,
    turbidity: 6.5, rayleigh: 1.9, mieCoefficient: 0.004, mieDirectionalG: 0.78,
    // round 76 (2026-09-26, the deck pass): the fog (the fleet's heaviest) a quarter thinner; 2026-10-14: mixed a little
    // less toward its grey under the open sky
    fogDensity: 0.00060, fogTintHex: 0x9aa0a6, fogMix: 0.62, envIntensity: 0.24,
    cloudOpacity: 1.05, cloudOpacity2: 0.6, cloudTintHex: 0xefebe4,
    cloudAltM: 620, cloudHazeK: 0.00014, cloudUvM: 3200,
    sunIntensity: 3.6, sunColorHex: 0xfbe9d0, hemiIntensity: 0.4,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x736f69 },
    // 2026-10-14 (the SKY lane, SKY-02: a sky grade per place; atmosphere.ts sky grade, faded at a low sun and at night): a rail junction's coal smoke — a brown-grey smog band, a dulled blue over it
    atmosphere: { horizonTintHex: 0xccc2b2, horizonTintAmount: 0.5, horizonBandDeg: 11, zenithTintHex: 0x8597b0, zenithTintAmount: 0.3 },
  },

  minimap: {
    base: [104, 102, 92], hard: [96, 96, 98], soft: [84, 88, 76],
    forest: 'rgba(52,66,42,0.85)', forestStroke: 'rgba(32,42,26,0.9)',
    water: 'rgba(70,84,88,0.7)', waterStroke: 'rgba(42,52,56,0.8)',
    roadCasing: 'rgba(30,30,34,0.9)', roadFill: 'rgba(130,130,132,0.95)',
    buildingFill: '#c9c2b2',
  },

  // from the south-east, over the open field and its fire-trench parapet and across the south service road to the yard:
  // the siding fan with its wagons, the goods sheds and the station building, with the water tower and the western
  // works' stack beyond, framed by the two spoil banks
  shot: { pos: [150, 44, -240], look: [-20, 4, 10] },
} satisfies import('./contracts.ts').MapCompositionConfig;
