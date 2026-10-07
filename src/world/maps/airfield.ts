// src/world/maps/airfield.ts — Kestrel Airfield, redesigned 2026-10-02 (maps-and-layouts lane B;
// docs/MAP-LAYOUT-BRIEF.md). The palette, sky, vegetation, building plan and name are the map's identity and stay; the
// airfield is new. The old runway ran north to south along the spawn axis, from one team's assembly ground to the
// other's: both pads saw each other down it, and only two lanes crossed a flat field (relief σ 2.9 m).
//
// Reference: Hostomel (Antonov) airport north-west of Kyiv, fought over in February 2022: one long runway on a level
// plateau in the pine forest, a parallel taxiway, the cargo apron and hangars on one side, the terminal apron on the
// other, dispersal stands in the trees, and the forest valleys of the Irpin's tributaries around the plateau.
//
// The story on the ground: the runway crosses the plateau from west to east. Its parallel taxiway runs on the south
// side of the western half (to the cargo apron and its hangars) and on the north side of the eastern half (to the
// terminal apron); each half meets the runway at its end and at the runway's centre. Dispersal stands with earth
// revetments stand in the trees on the other two quarters. South and north of the plateau the ground drops into wooded
// valleys, where the access roads come up from the outside world over causeways across the boggy valley floors and
// each team assembles, screened by the plateau's edge.
//
// The layout is rotationally symmetric about the runway's centre (0, 0) in its landforms, roads, aprons, buildings,
// pads and objectives. The three strongpoints break the symmetry by role (an environment receipt asks for exactly one of each):
// the cargo-apron motor pool (brawl) in bravo's half and the terminal-apron hut line (support) in alpha's stand where
// each other's rotations would, and the radar post (scout) watches the runway's east end. The zone-control discs stand
// on the cargo apron, the runway's centre (also the turbo-ball kickoff) and the terminal apron.
//
// 2026-10-05 (the map-revival lane; the owner: "make sure all maps look completely new and revitalized like verdant"):
// Kestrel was an airfield on an empty lawn. Verdant's three layers are added round it, the airport's own buildings,
// runway, aprons, roads, pads and objectives where they stood: the Polissia's pine and birch woods close round the
// plateau and down the valley sides; the land outside the perimeter is worked (landUse.ts `airfield`: hay meadows and
// pasture, small fields of rye and potatoes); and the garden cooperatives of Hostomel's dachas stand on the valley
// shoulders beside the access roads (maps/regional/hostomel.ts `cottage`, their sheds and picket-fenced plots from the
// yards), with a field cross at each cooperative's lane.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';

// The airfield's buildings: authored sites in rotation pairs about the runway's centre, so each half holds the same
// cover (the roadside builder handed its plan out in road order: ten buildings along the south taxiway, six along the
// north). The cargo side is authored; the terminal side is its rotation.
const CARGO_SIDE = [
  // the control tower and the two hangars behind the apron. 2026-10-03 (maps lane B, gauntlet wave 11): the cargo
  // terminal was the civic hall, a 31 m brick box under a broken dome, which the critics read as "a windowless box …
  // crowned by a dome with spidery legs, a placeholder". A second gabled hangar stands in its place, with roller
  // doors toward the apron and the sheet cladding below.
  { structure: 'tower', x: -282, z: -128, yawDeg: 0 },
  // (2026-10-07, Kestrel round 5) the cargo side's hangar plot is the An-225's (ANTONOV_PLOT below); the regional kit's
  // barrel-vault cargo hangar stands on the terminal side only (TERMINAL_HANGAR). The store beside the plot 5 m east,
  // 8 m off the burnt hangar's east wall.
  { structure: 'warehouse', x: -155, z: -208, yawDeg: 90 },
  // the hangar line, the fire station and the stores along the taxiway
  { structure: 'warehouse', x: -207, z: -82, yawDeg: 90 },
  { structure: 'depot', x: -160, z: -115, yawDeg: 90 },
  // (the terminal faces the taxiway, 10 m of open ground in front of its glazed hall and canopy: facing +x they stood
  // 4 m from the end wall of the hangar at (-137, -80) — the buildings lane's Hostomel kit, 2026-10-03)
  { structure: 'foundryoffice', x: -160, z: -81, yawDeg: 180 },
  { structure: 'watertower', x: -136, z: -113, yawDeg: 90 },
  { structure: 'warehouse', x: -137, z: -80, yawDeg: 90 },
  { structure: 'containerRow', x: -113, z: -113, yawDeg: 90 },
  { structure: 'firestation', x: -91, z: -80, yawDeg: 90 },
  { structure: 'depot', x: -63, z: -78, yawDeg: 66 },
  { structure: 'warehouse', x: -41, z: -62, yawDeg: 47 },
  { structure: 'ruin', x: -6, z: -70, yawDeg: 32 },
];
const rotateSite = (site: { structure: string; x: number; z: number; yawDeg: number; plot?: { w: number; d: number } }) =>
  ({ ...site, x: -site.x, z: -site.z, yawDeg: site.yawDeg + 180 });
// 2026-10-03 (maps lane B, gauntlet wave 28: "a cobbled plaza … a single barn-sized shed", where Hostomel has the
// Antonov hangars): the hangar plot at the back of the apron, 56 m across by 36 m deep, its doors toward the apron, which
// it meets 2 m past the apron's edge, its ground the plateau's graded level. The plot is authored at its size, so the
// regional kit raises its barrel-vault cargo hangar across it (a warehouse plot 21 m wide or more); without the kit the
// gabled hangar builds to it. (2026-10-07, Kestrel round 5) on the terminal side only: behind the cargo apron the An-225
// stands in the ruin of its own hangar.
const TERMINAL_HANGAR = { structure: 'warehouse', x: 225, z: 212, yawDeg: 180, plot: { w: 56, d: 36 } };
// 2026-10-07 (the map-revival lane, Kestrel round 5; the coordinator: the An-225 at true scale, 84 m long with its
// 88.4 m span, inside a hangar sized to it — the landmarks lane's aircraftWreck, seated as a landmark on this plot): the
// burnt hangar's slab behind the cargo apron, 105 m across (x -282..-177) by 97 m deep (z -278..-181), its doors on the
// north face over the apron's back strip, 1 m off the zone disc (-225, -150, r 30), at the apron's own level; its back
// third cut into the plateau's rise. Its rotation on the terminal side keeps the kit's hangar on its own plot and the
// ground round it, cleared of trees like the slab (the roads keep the rotation; the cover does not, so the fairness gate
// runs on it).
const ANTONOV_PLOT = { x: -229.5, z: -229.5, width: 105, length: 97 };
// the cargo apron's level, pinned (its own plane, 2026-10-07: 5.923 m) so the hangar slab meets it without a step
const CARGO_APRON_Y = 5.92;
// 2026-10-05 (the map-revival lane): the dacha cooperative on the south valley's shoulder, east of the access road's
// climb (its rotation on the north shoulder): two rows of four plots, 30 m apart, the houses' gables to the lane that runs
// between the rows, the yards' fenced gardens and sheds round them. The shoulder there is the plateau's smoothest edge
// (under 1.6 m of relief across a house), 25 m and more off the access road and 15 m clear of the marshes below it.
// Appended after the airport's sites, so those keep their order and every pose.
// 2026-10-05 (the map-revival lane; gauntlet wave 113: "sparse lollipop trees scattered over even green … like savanna"
// where the Polissia is massed, closed-canopy pine on sand with hard edges against the meadow): the Scots pine
// plantations past the runway's ends — rows 9 m apart, a tree every 9 m along them, few losses — as vegetation.ts
// belts, so each block stands as one dark wood with a ruled edge (and its rotation pair). (2026-10-06, the coordinator
// on hold x9: the woods cost the establishing view 3 ms of GPU at +40 % of its triangles; the plantations thinned from
// 7 x 6.5 m to 9 x 9 m, the woodlots 44 -> 34 and the rim 140 -> 108 (under the moderate maps' 108), each wood keeping
// its extent to the skyline)
function plantation(x0: number, x1: number, z0: number, z1: number, rowGap = 9, gap = 9) {
  const rows: Array<{ x0: number; z0: number; x1: number; z1: number; gap: number; jitter: number; skip: number; species: 'pine' }> = [];
  for (let x = x0; x <= x1 + 1e-6; x += rowGap) rows.push({ x0: x, z0, x1: x, z1, gap, jitter: 1.2, skip: 0.05, species: 'pine' });
  return rows;
}
const PLANTATIONS = [
  ...plantation(376, 440, -236, -96),  // east end, south of the perimeter road
  ...plantation(376, 440, 92, 236),    // east end, north of it
];
// the four blocks (the two above and their rotation pair), each 3 m past its outer rows
const PLANTATION_BLOCKS = [[376, 440, -236, -96], [376, 440, 92, 236]].flatMap(([x0, x1, z0, z1]) => [
  { x0: x0 - 3, x1: x1 + 3, z0: z0 - 3, z1: z1 + 3 }, { x0: -x1 - 3, x1: -x0 + 3, z0: -z1 - 3, z1: -z0 + 3 }]);
// The taxiway's western half (path 3 below), from the runway's west end along the cargo apron to the runway's centre; the
// eastern half (path 4) is its rotation.
const TAXIWAY: Array<[number, number]> = [[-310, 0], [-300, -48], [-276, -88], [-230, -98], [-160, -98], [-90, -96],
  [-56, -92], [-30, -74], [-12, -46], [-3, -20], [0, 0]];
const rotatePoint = ([x, z]: readonly [number, number]): [number, number] => [-x, -z];
// The access road (path 1; path 2 is its rotation): up from the south valley's edge to the plateau, behind the hangar
// line to the runway road's west end. (2026-10-07, round 5) it passes behind the An-225's hangar, 17 m off the back wall
// and 14 m and more off its corners, outside the slab's bank (it ran at z -242 across the plot).
const ACCESS_ROAD: Array<[number, number]> = [[100, -448], [92, -400], [56, -330], [0, -284], [-70, -252], [-125, -262],
  [-158, -282], [-172, -295], [-205, -295], [-262, -295], [-292, -288], [-316, -262], [-330, -215], [-336, -170], [-338, -150],
  [-338, -80], [-338, 0]];
// The concrete's slabs (the splat pavement) — the paint breaks at their joints.
const SLAB_M = 6;
// 2026-10-05 (the map-revival lane; the coordinator: the apron markings as receive-only decal strips, "faded paint with
// breaks at the joints. Taxi centrelines, stand numbers and lead-in lines are enough"): two stands on each apron, nose
// toward the hangars — a lead-in line curving off the taxiway's centreline (14 m radius) to a stop bar 8 m short of the
// cargo apron's back strip (the An-225 set piece's debris; its rotation on the terminal apron), the stand's number in
// yellow on a black box on the pilot's right, reading toward the stand.
function cargoStand(xs: number, label: string) {
  const R = 14, zTaxi = -98, zStop = -172;
  const arc: Array<[number, number]> = [];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI / 2 + (k / 8) * (Math.PI / 2);
    arc.push([xs + R + R * Math.cos(a), zTaxi - R + R * Math.sin(a)]);
  }
  return {
    lines: [
      { points: [...arc, [xs, zStop]] as Array<[number, number]>, width: 0.3, paint: 'yellow' as const },
      { points: [[xs - 2.6, zStop], [xs + 2.6, zStop]] as Array<[number, number]>, width: 0.5, paint: 'yellow' as const },
    ],
    number: { x: xs + 5.2, z: -124, headingDeg: 180, text: label, height: 2.2, paint: 'yellow' as const, box: 'black' as const },
  };
}
const CARGO_STANDS = [cargoStand(-236, '11'), cargoStand(-200, '12')];
const TERMINAL_STANDS = [['21', 0], ['22', 1]].map(([label, i]) => {
  const stand = CARGO_STANDS[i as number];
  return {
    lines: stand.lines.map((line) => ({ ...line, points: line.points.map(rotatePoint) })),
    number: { ...stand.number, x: -stand.number.x, z: -stand.number.z, headingDeg: 0, text: label as string },
  };
});
const APRON_MARKINGS = {
  lines: [
    // the taxiway's centreline, each half, stopping 3.5 m short of the runway's edge (the keep-out below)
    { points: TAXIWAY, width: 0.32, paint: 'yellow' as const },
    { points: TAXIWAY.map(rotatePoint), width: 0.32, paint: 'yellow' as const },
    ...[...CARGO_STANDS, ...TERMINAL_STANDS].flatMap((stand) => stand.lines),
  ],
  numbers: [...CARGO_STANDS, ...TERMINAL_STANDS].map((stand) => stand.number),
  keepOut: [
    // the runway
    { x0: -330, x1: 330, z0: -26, z1: 26 },
    // the An-225's hangar slab (round 5; it takes the apron's back strip), and its rotation
    { x0: -282, x1: -177, z0: -278, z1: -181 },
    { x0: 177, x1: 282, z0: 181, z1: 278 },
  ],
  slabM: SLAB_M,
};
const DACHAS = [40, 70, 100, 130].flatMap((x) => [
  { structure: 'cottage', x, z: -252, yawDeg: 180 },
  { structure: 'cottage', x, z: -278, yawDeg: 0 },
]);
export default {
  id: 'airfield', name: 'Kestrel Airfield',
  blurb: 'A windswept landing strip separates dispersed shelters, service aprons and perimeter berms',
  terrain: {
    hillScale: 0.6, microScale: 0.5, rimH: 20,
    // The runway, a paved strip graded under 1 % across the plateau, the level holding apron at its centre and the two
    // aprons (rotation pair).
    hardstands: [
      { x: 0, z: 0, width: 45, length: 620, yawDeg: 90 },
      // the holding apron where the taxiways meet the runway's centre
      { x: 0, z: 0, width: 90, length: 90, yawDeg: 0, grade: 0 },
      { x: -225, z: -150, width: 76, length: 84, yawDeg: 0, grade: 0, level: CARGO_APRON_Y },
      { x: 225, z: 150, width: 76, length: 84, yawDeg: 0, grade: 0 },
      // (2026-10-07, round 5) the An-225's hangar slab behind the cargo apron (the terminal side keeps its ground: a slab
      // there stood 3.5 m over the falling ground behind the kit's hangar and put a 25 % ramp in the access road)
      { ...ANTONOV_PLOT, yawDeg: 0, grade: 0, level: CARGO_APRON_Y },
    ],
    // The graded airfield: the whole runway, the aprons and the hangar lines behind them. The plateau is levelled out
    // past the runway's ends, so its paving meets the ground without a bank (maps lane A's apron-wall scan: 0 points).
    village: { x0: -340, x1: 340, z0: -230, z1: 230, cx: 0, cz: 0, feather: 40, flatten: 0.85, relief: 0.2 },
    roads: { paths: [
      // 0 — the runway road, edge to edge along the runway's centreline; past the runway's ends it leaves as the
      // perimeter road.
      [[-448, 34], [-420, 12], [-390, 0], [-360, 0], [-330, 0], [-300, 0], [-270, 0], [-240, 0], [-210, 0], [-180, 0],
        [-150, 0], [-120, 0], [-90, 0], [-60, 0], [-30, 0], [0, 0], [30, 0], [60, 0], [90, 0], [120, 0], [150, 0],
        [180, 0], [210, 0], [240, 0], [270, 0], [300, 0], [330, 0], [360, 0], [390, 0], [420, -12], [448, -34]],
      // 1 / 2 — the access roads, up from each valley's edge to the plateau, past the apron to the runway road.
      // (2026-10-07, round 5) behind the An-225's hangar (17 m off its back wall), and its rotation behind the kit's hangar
      ACCESS_ROAD,
      ACCESS_ROAD.map(rotatePoint),
      // 3 / 4 — the taxiway halves: from the runway's end along the south (west half) or the north (east half) side to
      // the runway's centre, past the cargo or the terminal apron.
      TAXIWAY,
      TAXIWAY.map(rotatePoint),
      // 5 / 6 — the dacha cooperatives' lane (2026-10-05, the map-revival lane; the layout brief's orphan rule): off the
      // access road where it tops the shoulder, between the cooperative's two rows of plots and round the back of the
      // south row to the access road again — laid in the concrete slabs of every Soviet garden cooperative's lane
      [[0, -284], [28, -265], [146, -265], [150, -292], [40, -296], [8, -290]],
      [[0, 284], [-28, 265], [-146, 265], [-150, 292], [-40, 296], [-8, 290]],
    ] },
    // The boggy floors of the two valleys (rotation pair), the Irpin's floodplain: every way between a team's assembly
    // ground and the plateau crosses soft ground, except the access roads' causeways.
    marshes: [[-372, 330, 40], [-296, 345, 46], [-214, 322, 36], [-138, 340, 44], [-52, 328, 38], [30, 344, 48],
      [108, 326, 36], [190, 338, 42], [268, 350, 46], [352, 324, 38]].flatMap(([x, z, r]) => [
      { x, z, r, dip: 0.7 },
      { x: -x, z: -z, r, dip: 0.7 },
    ]),
    landforms: [
      // The plateau the airfield was laid out on, standing above the valleys either side of it.
      { kind: 'ridge', x: 0, z: 0, length: 1100, width: 360, height: 5, yawDeg: 0, settlementScale: 1, corridorScale: 1 },
      // The wooded valleys south and north of the plateau (rotation pair), where the teams assemble.
      { kind: 'ridge', x: 30, z: -395, length: 900, width: 130, height: -7, yawDeg: 3 },
      { kind: 'ridge', x: -30, z: 395, length: 900, width: 130, height: -7, yawDeg: 3 },
      // Earth revetments of the dispersal stands (rotation pairs): a row of pens off each taxiway's far side, the pens
      // in the trees beyond the aprons, and the blast berms at the runway's ends. 3.2 m high: at 4.5 m they split the
      // lanes as well but launched the hulls the bots drove over them (two to six damaging falls a match, up to 387 HP).
      ...[[100, -140, 0], [170, -140, 0], [240, -140, 0], [310, -140, 0], [140, -205, 90], [270, -205, 90],
        [-385, -200, 90], [-110, -292, 0], [-71, -130, 90], [395, -70, 0], [-395, -70, 0],
        [140, -60, 0], [280, -60, 0], [226, -95, 90], [62, -80, 0], [-36, -112, 0],
        // the blast berms on the runway's shoulders either side of its centre
        [-100, -50, 0], [100, -50, 0]].flatMap(([x, z, yaw]) => [
        { kind: 'ridge', x, z, length: 46, width: 12, height: 3.2, yawDeg: yaw, settlementScale: 1 },
        { kind: 'ridge', x: -x, z: -z, length: 46, width: 12, height: 3.2, yawDeg: yaw, settlementScale: 1 },
      ]),
      // Low forest knolls beyond the plateau's edge (rotation pair).
      { kind: 'knoll', x: 360, z: -280, rx: 70, rz: 54, height: 5, yawDeg: 25 },
      { kind: 'knoll', x: -360, z: 280, rx: 70, rz: 54, height: 5, yawDeg: 25 },
    ],
  },
  spawns: {
    // Alpha assembles in the north valley west of the access road; bravo's seven pads spread round its rotation in
    // the south valley. The plateau's edge screens each from the other; 841 m between the anchors. Alpha takes the
    // north: with alpha in the south (and no marshes or shoulder berms yet), bravo won 13 of 16 all-bot matches; with
    // alpha in the north, 8 of 16.
    player: { x: -60, z: 416 },
    enemies: [
      { x: 240, z: -403 }, { x: 180, z: -434 }, { x: 120, z: -403 }, { x: 60, z: -434 },
      { x: 0, z: -403 }, { x: -60, z: -434 }, { x: -120, z: -401 },
    ],
  },
  splat: { sourcedPalette: 'railyard', pavedRoads: true,
    // (2026-10-05, the map-revival lane; gauntlet wave 113: "bare-soil patches tinted pink-mauve instead of sandy tan")
    // the valleys' bog floors in a peaty tan over the Polissia's sand
    mudTone: (_h: number, s: number, l: number) => [0.11, Math.min(1, s * 0.6), Math.min(1, l * 1.3)], roadTexMix: 0.12, townWear: 0.8, fieldPatch: 1, midRelief: 0.55, tintA: [0.94, 1.00, 0.76], tintB: [0.67, 0.76, 0.60], tintC: [1.06, 1.08, 0.86], roadTint: [0.55, 0.56, 0.54],
    // 2026-10-03 (maps lane B, gauntlet wave 28: the cargo apron "reads as a cobbled plaza"): the runway, taxiways,
    // aprons and the access roads are airfield concrete — 6 m slabs with sealed expansion joints, a tone per pour, oil
    // and fuel stains and tyre rubber along the runway's axis (terrain.ts uPaveSlab) — in place of the sett print
    pavement: { slabM: SLAB_M, jointM: 0.04, stains: 1, tyres: 1 } },
  vegetation: {
    // 2026-10-05 (the map-revival lane): the Polissia's woods round the plateau — Scots pine stands with birch at their
    // edges, down the valley sides and past the runway's ends (no tree stands inside the graded airfield: vegetation.ts
    // keeps every tree 24 m off the settlement rect, here the whole plateau); toward Verdant's 72 / 185 / 102
    // (gauntlet wave 113: fewer, larger, denser stands — the loose trees thin to the woods' edges, the woodlots fewer,
    // the plantations below and a closed rim; the field shrubs young pines, not the birch sprays read as cactus)
    species: ['pine', 'birch', 'poplar'], clusterMix: [['pine', 0.74], ['birch', 0.22], ['poplar', 0.04]],
    loneMix: [['birch', 0.45], ['pine', 0.45], ['poplar', 0.10]], rimMix: [['pine', 0.78], ['birch', 0.19], ['poplar', 0.03]],
    clusterCount: 34, loneCount: 30, rimCount: 108, grassDensity: 0.72, bushCount: 0.7, bushSpecies: 'pine',
    belts: [...PLANTATIONS, ...PLANTATIONS.map((b) => ({ ...b, x0: -b.x0, z0: -b.z0, x1: -b.x1, z1: -b.z1 }))],
    // (2026-10-06) each plantation block holds its rows alone — no woodlot, lone tree or sapling stands inside it, so its
    // edge reads ruled and the woods round it stay woods (the coordinator: the trim plus the keep-out, about +15 %)
    // (2026-10-07, round 5) and no stand on the An-225's hangar slab past the plateau's tree line (z -254..-278), nor on
    // its rotation behind the kit's hangar
    standKeepOut: [...PLANTATION_BLOCKS, { x0: -282, x1: -177, z0: -278, z1: -254 }, { x0: 177, x1: 282, z0: 254, z1: 278 }],
    // the runway's cleared strip, west to east
    avoid: [{ x: -300, z: 0, r: 80 }, { x: -150, z: 0, r: 80 }, { x: 0, z: 0, r: 80 }, { x: 150, z: 0, r: 80 }, { x: 300, z: 0, r: 80 }],
  },
  props: {
    sourcedPalette: 'railyard',
    // every building is an authored site (rotation pairs), so the roadside builder places none
    plan: [],
    destructibleBuildings: ['quonsethut', 'motorpool', 'relaystation', 'guardpost'],
    buildingLat: [15, 3], destructibleBuildingLat: [19, 3], sideSkip: 0.18, spacingPad: 8, maxSpread: 2.8,
    tacticalBeats: [
      { id: 'cargo-motor-pool', role: 'brawl', x: -122, z: -150, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'terminal-hut-line', role: 'support', x: 122, z: 150, yawDeg: -90, structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'eastern-radar-berm', role: 'scout', x: 340, z: -44, yawDeg: -90, structure: 'relaystation', outcrop: { count: 4, radius: 8 } },
    ],
    plannedSites: [...CARGO_SIDE, TERMINAL_HANGAR, ...CARGO_SIDE.map(rotateSite), ...DACHAS, ...DACHAS.map(rotateSite)],
    // the taxiway centrelines and the apron stands' paint (world/groundMarkings.ts; above)
    groundMarkings: APRON_MARKINGS,
    // The landmarks lane (round 3, 2026-10-07; src/world/landmarks/wrecks.ts aircraftWreck; the seat agreed with the
    // map-revival lane, whose round 5 lays this plot): the Antonov An-225 Mriya as Hostomel's hangar left it in
    // February 2022, at true scale — one airframe 84 m long with its 88.4 m span, the fuselage burnt through amidships
    // between its glazed nose and its twin-fin H-tail, the wing roots collapsed and the six engines fallen — inside the
    // ruin of a hangar built to it: the soot-black slab on the plot's 5.92 m level, the arch ribs torn and buckled over
    // the fire, the cladding down in heaps and sheets, the doors' gap on the north face over the cargo apron. Set into
    // the finished map (ground 'veto').
    landmarks: [
      { kind: 'aircraftWreck', x: ANTONOV_PLOT.x, z: ANTONOV_PLOT.z, yawDeg: 0, ground: 'veto', name: 'the An-225 Mriya in its hangar',
        params: { width: 105, depth: 95, strip: 0 } },
    ],
    // 2026-10-03 (regional-buildings lane): the Antonov airport's own buildings (maps/regional/hostomel.ts): the cargo
    // hangar under its barrel vault, sheet-steel maintenance hangars, the control tower's glazed cab, the terminal and
    // office blocks, the fire station, the water tower, the war's damage
    architecture: 'hostomel',
    // 2026-10-03 (maps lane B, gauntlet wave 11): an airfield's hangars and stores are corrugated sheet, not brick
    // (round 75's industrial cladding, as on Whiteout Station)
    industrialCladding: 'steel',
    tones: makeRealisticCityBuildingTones({ value: 1, saturation: 0.92, soot: 0.01, roofValue: 0.94 }),
    wallStyle: 'fieldstone', wallStoneChance: 0.6,
    // Blast walls along the hangar line and the terminal forecourt (rotation pairs).
    // (the hangar line's wall ends west of the hangar plot)
    // (round 5: the hangar line's wall ends 4 m short of the An-225's hangar slab, x -282)
    wallRuns: [[-300, -205, -286, -205, 2], [300, 205, 286, 205, 2], [-160, -118, -100, -118, 3], [160, 118, 100, 118, 3],
      [-60, -150, -60, -110, 1], [60, 150, 60, 110, 1]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 98, outcrops: 12, craters: 58, rubblePiles: 14, sandbagLines: 18, hedgehogs: 18,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['pl01', 'm551_sheridan', 'marder1a3', 'm2a2_bradley', 'm1a2'] },
    inhabit: { stalls: 0, benches: 2, coreClutter: 20, drums: 10, trucks: 7, jeeps: 5, drumClusters: 5, camps: 3, modernClutter: 22, looseClutter: 18, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  // the map-revival lane (2026-10-05; the scenery lane's generators, world/scenery.ts): a field cross at the lane of each
  // dacha cooperative. (No 110 kV line: every route to the plateau crosses the new woods, and a line's towers rise to keep
  // the crowns clear under its spans — 55 m on the east-end route, a transmission giant beside a dacha.)
  scenery: {
    landmarks: [
      { kind: 'orthodoxcross', x: 6, z: -262, yawDeg: 90, name: 'the cross at the south cooperative' },
      { kind: 'orthodoxcross', x: -6, z: 262, yawDeg: 270, name: 'the cross at the north cooperative' },
    ],
  },

  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): an airfield plain: low swells,
  // tree lines
  // 2026-10-05 (the map-revival lane; gauntlet wave 113: "a wave-textured band reading as open sea with surf" past the
  // ring in every elevated view, where Hostomel lies 100 km inland): the Polissia's woods close the ring in two rows and
  // the far country is low forested swells under the haze, not the plain's flat field band
  horizon: { baseHex: 0x6f795e, amp: 0.3, style: 'rolling', treeline: 0.94, treelineLayers: 2, panorama: { regional: 'upland', ampM: 150 }, forestHex: 0x2f4630, rockHex: 0x7a7c70, haze: 0.90, grain: 0.42 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.38, streets: 0.35, contrails: 1, contrailAge: 0.45, nightGlow: 0.45, nightGlowHex: 0xffc27a },
  sky: { sunElevationDeg: 30, sunAzimuthDeg: 142, turbidity: 3.8, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.81, fogDensity: 0.00048, fogTintHex: 0x92a9b7, fogMix: 0.46, envIntensity: 0.24, cloudOpacity: 0.85, cloudOpacity2: 0.45, cloudTintHex: 0xf1f2ed, sunIntensity: 4.0, sunColorHex: 0xffedda, hemiIntensity: 0.40 },
  minimap: { base: [99, 111, 77], hard: [114, 118, 111], soft: [62, 80, 64], forest: 'rgba(46,71,41,.84)', forestStroke: 'rgba(27,44,25,.94)', water: 'rgba(61,91,99,.8)', waterStroke: 'rgba(33,60,69,.94)', roadCasing: 'rgba(37,39,37,.94)', roadFill: 'rgba(149,151,144,.96)', buildingFill: '#d0d0c4' },
  shot: { pos: [-294, 52, -310], look: [80, 1, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
