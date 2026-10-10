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
    const run = Math.hypot(bx - ax, bz - az);
    if (x <= bx) return walked + run * ((x - ax) / (bx - ax));
    walked += run;
  }
  return walked;
}
type StockCut = { fromX: number; kinds: readonly string[] };
/** A north siding's cuts and their 180-degree twins on the south one (the order reversed, the vehicles turned). */
type StockSpur = { path: [number, number][]; stock: { atM: number; kinds: readonly string[]; facingBack?: boolean }[] };
function stockPair(offsetM: number, cuts: readonly StockCut[]): [StockSpur, StockSpur] {
  const north = siding(offsetM), south = siding(-offsetM);
  const total = sidingDistanceAt(south, 236);
  const northStock = cuts.map((cut) => ({ atM: sidingDistanceAt(north, cut.fromX), kinds: cut.kinds }));
  const southStock = cuts.map((cut) => {
    const length = cut.kinds.reduce((sum, kind) => sum + STOCK_LENGTH[kind], 0);
    return { atM: total - sidingDistanceAt(north, cut.fromX) - length, kinds: [...cut.kinds].reverse(), facingBack: true };
  });
  return [{ path: north, stock: northStock }, { path: south, stock: southStock }];
}
const [STOCK_9N, STOCK_9S] = stockPair(9, [{ fromX: 72, kinds: ['omm', 'omm', 'omm'] }, { fromX: -122, kinds: ['tank', 'tank'] }]);
const [STOCK_15N, STOCK_15S] = stockPair(15, [{ fromX: -166, kinds: ['g10', 'g10'] }]);
const [STOCK_21N, STOCK_21S] = stockPair(21, [{ fromX: 122, kinds: ['omm', 'v60'] }]);

const RAIL_SPURS = [
  { path: mainLine(2.3, 1, true), cutting: { from: [PORTAL_X, lineZ(PORTAL_X)] as [number, number] } },
  { path: mainLine(-2.3, 1, false) },
  { path: mainLine(-2.3, -1, true), cutting: { from: [-PORTAL_X, lineZ(-PORTAL_X)] as [number, number] } },
  { path: mainLine(2.3, -1, false) },
  STOCK_9N, STOCK_15N, STOCK_21N,
  STOCK_9S, STOCK_15S, STOCK_21S,
  { path: [[64, lineZ(64) - 30], [180, lineZ(180) - 34]] as [number, number][], bufferStop: 'end' as const,
    coalStage: { side: -1 as const, fromM: 4, toM: 40 } },
  { path: [[-64, lineZ(-64) + 30], [-180, lineZ(-180) + 34]] as [number, number][], bufferStop: 'end' as const,
    coalStage: { side: -1 as const, fromM: 4, toM: 40 } },
];

// Yard plan: the road frontages inside the yard take the sheds, rowhouses and ruins; the authored lots below take
// the landmarks (engine shed, goods shed, water towers, station hall, gantries, stacks).
const PLAN = [
  'warehouse', 'shed', 'containerRow', 'ruin', 'shed', 'rowhouse', 'containerRow', 'shed',
  'warehouse', 'ruin', 'rowhouse', 'shed', 'containerRow', 'shed', 'ruin', 'containerRow',
  'shed', 'warehouse', 'rowhouse', 'containerRow', 'shed', 'ruin',
];

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
      [[-448, -96], [-400, -96], [-300, -88], [-200, -76], [-100, -70], [0, -66], [100, -60], [200, -50],
        [300, -40], [400, -30], [448, -27]],
      [[448, 96], [400, 96], [300, 88], [200, 76], [100, 70], [0, 66], [-100, 60], [-200, 50],
        [-300, 40], [-400, 30], [-448, 27]],
      // 5 / 6 — the works roads: off the service road, through the works gate, out to the crossing road.
      [[150, -55], [158, -90], [172, -118], [204, -150], [244, -184], [281, -210]],
      [[-150, 55], [-158, 90], [-172, 118], [-204, 150], [-244, 184], [-281, 210]],
    ] },
    // The station square and the two level-crossing aprons: level paved ground the zone-control placement seats
    // its 30 m discs on (the crossings lie inside the yard's grading, so their roads reach them at a road grade).
    hardstands: [
      { x: 0, z: 0, width: 62, length: 62, yawDeg: 0, grade: 0 },
      { x: -262, z: lineZ(-262) - 4, width: 60, length: 60, yawDeg: 4, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): at its ground's median height, a 16 m bank
      { x: 262, z: lineZ(262) + 4, width: 60, length: 60, yawDeg: 4, level: 1.6, grade: 0, bankM: 16 },
    ],
    landforms: [
      // The main-line embankment outside the yard, each half from the throat to the cutting.
      { kind: 'ridge', x: -372, z: lineZ(-372), length: 300, width: 44, height: 2.8, yawDeg: 3.8, settlementScale: 0.6 },
      { kind: 'ridge', x: 372, z: lineZ(372), length: 300, width: 44, height: 2.8, yawDeg: 3.8, settlementScale: 0.6 },
      // The spoil tips: tall black cones out on the valley floor, one in each half.
      { kind: 'knoll', x: -322, z: -238, rx: 70, rz: 62, height: 15, yawDeg: 20 },
      { kind: 'knoll', x: 322, z: 238, rx: 70, rz: 62, height: 15, yawDeg: 20 },
      // The spoil banks: long flat-topped tips run out from the washeries across the valley floor, their flanks at
      // the spoil's angle of repose — south-west of the yard and, turned through 180°, north-east of it.
      { kind: 'ridge', x: -176, z: -160, length: 150, width: 40, height: 11, yawDeg: 84 },
      { kind: 'ridge', x: 176, z: 160, length: 150, width: 40, height: 11, yawDeg: 84 },
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
    loneCount: 34,
    rimCount: 66,
    grassDensity: 0.45,
    bushCount: 0.7,
    bushSpecies: 'oak',
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
    destructibleBuildings: ['quonsethut', 'transformershed', 'motorpool', 'guardpost'],
    // Rotational pairs about the station square, each at least 180 m from every other: a post covering each level
    // crossing from the open field beyond it, a gate at each works, a camp at the outer foot of each spoil bank.
    tacticalBeats: [
      { id: 'west-crossing-post', role: 'brawl', x: -310, z: -66, yawDeg: 40,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -15 },
      { id: 'east-crossing-post', role: 'brawl', x: 310, z: 66, yawDeg: 220,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
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
      // the container terminal east of the station on the north side, and its twin
      { structure: 'containerRow', x: 70, z: 40, yawDeg: -3.8 },
      { structure: 'containerRow', x: 110, z: 42, yawDeg: -3.8 },
      { structure: 'containerRow', x: 150, z: 45, yawDeg: -3.8 },
      { structure: 'containerRow', x: -70, z: -40, yawDeg: 176.2 },
      { structure: 'containerRow', x: -110, z: -42, yawDeg: 176.2 },
      { structure: 'containerRow', x: -150, z: -45, yawDeg: 176.2 },
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
    ],
    // 2026-10-01: the hard-coded north-south siding fan (maps/mapKits.ts dressRailYard) gives way to the authored
    // main line and sidings above (terrain.railSpurs): no legacy rail kit.
    extraKits: [],
    blockFill: true, // r3: leftover plan slots fill the block interiors
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
    rockTone: (h: number, s: number, l: number) => [0.085, 0.07, clamp01(l * 0.82)], // concrete rubble
    wallStoneChance: 0.75,
    // Brick walls: the yard's outer boundary behind each service road, the works compounds and field walls on the
    // approaches, each run with its 180° twin.
    wallRuns: [
      [-228, -90, -120, -86, 2], [228, 90, 120, 86, 2],
      [-130, -300, -70, -304, 3], [130, 300, 70, 304, 3], [60, -332, 124, -322, 1], [-60, 332, -124, 322, 1],
      [-420, -150, -360, -140, 2], [420, 150, 360, 140, 2],
    ],
    well: false, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 0, rocks: 60, outcrops: 4, craters: 62, rubblePiles: 60,
    lampposts: true, hedgehogs: 8,
    // Legacy-map quality backport: modern hulks on the yard aprons (baked roster tanks) —
    // the armor that fought over the railhead
    // the map-vehicles lane (2026-10-06, the period ruling): a German coalfield junction in the 1960s: the
    // Bundeswehr's M48s and M47s, the Rhine Army's Centurions
    tankWrecks: { era: 'cold-war', count: 6, debris: true, ids: ['m48', 'centurion5', 'm47_patton'] },
    sandbagLines: 10,
    // world-dressing r1: brick yard walls; industrial inhabitants — oil-drum
    // ranks + pallet/crate stacks along the aprons, benches by the depot
    wallStyle: 'brick',
    inhabit: {
      benches: 3, coreClutter: 10,
      drums: 16,
      handcarts: 1, carts: 1,
      roadFence: 'fencerail',
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

  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  // (2026-10-03, the gauntlet's wave 27: the deck's kilometre-scale relief as fp14's dk3 shot it — cells 0.9 → 1, cellM
  // 1300 → 2400, undulatus 0.35 → 0.7)
  clouds: { regime: 'industrial-stratocumulus', coverage: 0.92, baseM: 800, thicknessM: 460, cells: 1, cellM: 2400, undulatus: 0.7, density: 0.16, sunGain: 0.7, tintHex: 0xbab5ac, nightGlow: 0.85, nightGlowHex: 0xffa050 },
  sky: {
    // FLAT OVERCAST (trips the sky.ts overcast deck auto-detect: opacity 1.0
    // + layer2 0.95 + turbidity 9): weak high sun, dirty stratus, lifted fill
    sunElevationDeg: 42, sunAzimuthDeg: 115,
    turbidity: 9, rayleigh: 2.4, mieCoefficient: 0.0025, mieDirectionalG: 0.72,
    // round 76 (2026-09-26, the deck pass): the flat overcast is the deck's now — the fog (the fleet's heaviest) a
    // quarter thinner and mixed less toward its grey, so the far yard keeps its contrast under the closed deck
    fogDensity: 0.00060, fogTintHex: 0x9aa0a6, fogMix: 0.72, envIntensity: 0.30,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xa39f98,
    cloudAltM: 300, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xd9dad6, hemiIntensity: 0.85,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x736f69 },
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
