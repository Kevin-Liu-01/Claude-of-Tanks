// src/world/maps/cliffbridge.ts — Aegis Crossing, redesigned 2026-10-02 (maps-and-layouts lane B;
// docs/MAP-LAYOUT-BRIEF.md). The palette, sky, vegetation, the stone viaduct and the name are the map's identity and
// stay; the battlefield around them is new. The old layout ran the gorge off the west edge, so the viaduct and one
// flank road were the only ways across: two lanes. The kickoff sat on alpha's bridgehead, and the zone placement left
// bravo 2.2 times alpha's drive.
//
// Reference: Ronda and the Tajo of the Guadalevín (Málaga). A river cut a narrow gorge through a limestone tableland;
// the old town grew on the gorge's two lips, and the Puente Nuevo, an eighteenth-century stone viaduct, joins them high
// above the river bed. Below the bridge the gorge floor is a dry gravel bed in summer, and the old mill paths come down
// to it where the walls open out.
//
// The story on the ground: the gorge runs east to west across the middle of the tableland. It is deepest (38 m) and
// narrowest under the viaduct and opens out toward both ends, where its floor climbs in river terraces to the tableland
// and the fords cross it. A dry gravel bed runs down its floor between low levees; the ruins of the old mills stand on
// it beside the viaduct's piers. Each lip carries a bridgehead town round a market square on the main road, and the
// viaduct's deck runs onto solid rock past both lips. Olive terraces step down the tableland on the west side, and the
// river's wooded bottomlands fill the east. Swells south and north of the towns screen each team's assembly ground.
//
// The layout is mirror-symmetric across the gorge's axis (z = 0): alpha deploys on the south tableland, bravo on the
// north. Three lanes cross the middle: the west ford past the olive terraces, the viaduct between the two towns, and
// the east ford through the bottomland woods. The gorge walls cannot be driven. The routes between the deck and the
// gorge floor run from each abutment along the rim to the river terraces at the gorge's ends and down them: about
// 610 m from the deck's end to the floor beside the viaduct, against 200 m over the deck. The zone-control discs stand
// on the two market squares and on the gorge floor west of the viaduct, where the mills stood; the turbo-ball kickoff
// on the gorge floor east of it.
import verdant from './verdant.ts';
import type { MapCompositionConfig } from './contracts.ts';

/** A point's mirror across the gorge's axis (z = 0), with the yaw that faces the same way across it. */
const mirrorSite = <T extends { z: number; yawDeg: number }>(site: T): T => ({ ...site, z: -site.z, yawDeg: 180 - site.yawDeg });

// The bridgehead towns: market squares on the main road, the parador and the church facing each other across it,
// rows of houses down the road to the swell. South town authored; the north town is its mirror.
const SOUTH_TOWN = [
  { structure: 'civichall', x: -62, z: -158, yawDeg: 90 },
  { structure: 'church', x: 60, z: -170, yawDeg: -90 },
  { structure: 'tower', x: 52, z: -122, yawDeg: 0 },
  { structure: 'rowhouse', x: -48, z: -198, yawDeg: 90 },
  { structure: 'rowhouse', x: -46, z: -220, yawDeg: 90 },
  { structure: 'rowhouse', x: 46, z: -208, yawDeg: -90 },
  { structure: 'tavern', x: 26, z: -232, yawDeg: -90 },
  { structure: 'cottage', x: -30, z: -284, yawDeg: 90 },
  { structure: 'schoolhouse', x: -84, z: -236, yawDeg: 5 },
  { structure: 'chapel', x: -160, z: -246, yawDeg: 5 },
  { structure: 'cottage', x: 84, z: -262, yawDeg: -20 },
];
// The ruined mills on the gorge floor beside the viaduct's piers (their mirrors stand on the north half of the floor).
const MILLS = [
  { structure: 'ruin', x: -46, z: -32, yawDeg: 0 },
  { structure: 'ruin', x: 46, z: -30, yawDeg: 180 },
];
// Farmsteads on the tableland: an olive farm on the west terraces and a mill farm by the east ford, each with its
// mirror.
const SOUTH_FARMS = [
  { structure: 'farmhouse', x: -262, z: -228, yawDeg: 15 },
  { structure: 'barn', x: -300, z: -205, yawDeg: 15 },
  { structure: 'granary', x: -240, z: -300, yawDeg: 15 },
  { structure: 'farmhouse', x: 365, z: -165, yawDeg: -60 },
  { structure: 'barn', x: 392, z: -205, yawDeg: -60 },
];

export default {
  id: 'cliffbridge', name: 'Aegis Crossing',
  blurb: 'A monumental stone viaduct spans a deep gorge between two bridgehead towns, with fords at both ends',
  terrain: {
    hillScale: .32, microScale: .42, rimH: 32, marshes: [], lakes: [], fieldTrenches: false,
    // The two bridgehead towns and the gorge between them (the gorge keeps its full depth: settlementScale 1). The
    // centre is the viaduct, so the spawn corridors converge on the crossing.
    village: { x0: -130, x1: 130, z0: -270, z1: 270, cx: 0, cz: 0, feather: 40, flatten: .9 },
    // The viaduct's abutments stand on solid rock 4 m back from each lip, so a hull leaving the road at an abutment
    // stands on the rim, not on the wall.
    bridges: [{ x: 0, z: 0, yawDeg: 90, spanM: 200, widthM: 18, approachM: 45, route: 0 }],
    // The two market squares: level paved aprons on the main road from each abutment into its town, where the
    // zone-control discs seat.
    hardstands: [
      { x: 0, z: -172, width: 64, length: 80, yawDeg: 0, grade: 0 },
      { x: 0, z: 172, width: 64, length: 80, yawDeg: 0, grade: 0 },
    ],
    // Authored paths stop inside the square; the endpoint completion adds each exit and grades it through the rim.
    roads: { paths: [
      // 0 — the main road: up from the south edge, through the south town's square, over the viaduct, through the north
      // square and out to the north edge. Straight along the bridge and its approaches.
      [[-34, -448], [-22, -400], [-8, -340], [0, -290], [0, -250], [0, -210], [0, -172], [0, -110], [0, 0], [0, 110],
        [0, 172], [0, 210], [0, 250], [0, 290], [-8, 340], [-22, 400], [-34, 448]],
      // 1 / 2 — the east ford road, south and north halves: from each town's crossroads round the bottomland to the
      // east ford.
      [[0, -250], [110, -290], [240, -290], [360, -230], [420, -120], [432, 0]],
      [[432, 0], [420, 120], [360, 230], [240, 290], [110, 290], [0, 250]],
      // 3 / 4 — the west ford road, south and north halves: from the same crossroads down the olive terraces to the
      // west ford.
      [[0, -250], [-100, -262], [-220, -276], [-340, -230], [-412, -120], [-428, 0]],
      [[-428, 0], [-412, 120], [-340, 230], [-220, 276], [-100, 262], [0, 250]],
    ] },
    landforms: [
      // The gorge: three troughs between the same sheer walls (38 m at the bridge, a cliff the bot planner's 25 m grid
      // reads as one), each a little longer than the last, so the floor climbs in river terraces to the tableland at
      // both ends (x = ±390).
      { kind: 'gorge', x: 0, z: 0, length: 540, width: 96, height: -16, corridorScale: 1, settlementScale: 1 },
      { kind: 'gorge', x: 0, z: 0, length: 660, width: 96, height: -12, corridorScale: 1, settlementScale: 1 },
      { kind: 'gorge', x: 0, z: 0, length: 780, width: 96, height: -10, corridorScale: 1, settlementScale: 1 },
      // The limestone rib the viaduct's piers stand on: it crosses the gorge floor under the deck, too steep to drive,
      // so the floor's west and east reaches meet only over the bridge (no hull parks on the bed under the deck).
      { kind: 'ridge', x: 0, z: 0, length: 140, width: 14, height: 6.5, yawDeg: 90, corridorScale: 1, settlementScale: 1 },
      // The dry river bed's gravel levees, one each side of the stream channel, the length of the gorge and out through
      // both fords: the hull-down lines of the gorge floor. They are cut where the mill race left the stream (the
      // zone-control disc west of the viaduct) and at the mill pool east of it (the turbo-ball kickoff).
      ...[[-335, 210], [0, 160], [335, 210]].flatMap(([x, length]) => [
        { kind: 'ridge', x, z: -25, length, width: 22, height: 2.6, yawDeg: 0, corridorScale: 1, settlementScale: 1 },
        { kind: 'ridge', x, z: 25, length, width: 22, height: 2.6, yawDeg: 0, corridorScale: 1, settlementScale: 1 },
      ]),
      // The raised lips along both rims where the gorge is deep, open where the main road reaches the abutments
      // (mirror pairs). They stand 20 m back from the edge: when their flat tops ran to it, a bot heading for the
      // gorge-floor zone along one drove off (a 1068 HP fall in botModes' zone-control match).
      ...[-152, 152].flatMap((x) => [
        { kind: 'ridge', x, z: -114, length: 264, width: 18, height: 2.6, yawDeg: 0, settlementScale: 1 },
        { kind: 'ridge', x, z: 114, length: 264, width: 18, height: 2.6, yawDeg: 0, settlementScale: 1 },
      ]),
      // Terrace banks across the gorge's end ramps, where the floor climbs to the fords (mirror pairs, both ends).
      ...[-330, 330].flatMap((x) => [64, 96].flatMap((z) => [
        { kind: 'ridge', x, z: -z, length: 150, width: 20, height: 2.4, yawDeg: 0, settlementScale: 1 },
        { kind: 'ridge', x, z, length: 150, width: 20, height: 2.4, yawDeg: 0, settlementScale: 1 },
      ])),
      // Hedge banks round the bottomland meadows in the two fords, each side of the stream (mirror pairs).
      ...[-405, 405].flatMap((x) => [62, 106].flatMap((z) => [
        { kind: 'ridge', x, z: -z, length: 130, width: 22, height: 2.4, yawDeg: 0 },
        { kind: 'ridge', x, z, length: 130, width: 22, height: 2.4, yawDeg: 0 },
      ])),
      // The swells behind the towns, screening each assembly ground (mirror pair).
      { kind: 'ridge', x: -40, z: -322, length: 380, width: 74, height: 7, yawDeg: 4 },
      { kind: 'ridge', x: -40, z: 322, length: 380, width: 74, height: 7, yawDeg: -4 },
      // Olive terraces on the west tableland: low banks, hull-down lines (mirror pairs).
      { kind: 'ridge', x: -230, z: -170, length: 150, width: 24, height: 2.4, yawDeg: 12 },
      { kind: 'ridge', x: -230, z: 170, length: 150, width: 24, height: 2.4, yawDeg: -12 },
      { kind: 'ridge', x: -320, z: -300, length: 130, width: 24, height: 2.4, yawDeg: 24 },
      { kind: 'ridge', x: -320, z: 300, length: 130, width: 24, height: 2.4, yawDeg: -24 },
      // Knolls in the east bottomland (mirror pair).
      { kind: 'knoll', x: 262, z: -188, rx: 64, rz: 46, height: 6, yawDeg: 20 },
      { kind: 'knoll', x: 262, z: 188, rx: 64, rz: 46, height: 6, yawDeg: -20 },
    ],
  },
  spawns: {
    // Alpha assembles behind the south swell, west of the main road; bravo's seven pads are its mirror behind the north
    // swell. 800 m between the anchors; the swells and the towns screen each from the other.
    player: { x: -70, z: -400 },
    enemies: [
      { x: -160, z: 380 }, { x: -115, z: 405 }, { x: -70, z: 380 }, { x: -25, z: 405 },
      { x: 20, z: 380 }, { x: -115, z: 425 }, { x: -25, z: 425 },
    ],
  },
  splat: {...verdant.splat, sourcedPalette:'verdant', fieldPatch:.35,
    tintA:[.94,1.04,.87],tintB:[.82,.91,.74],tintC:[1,1.05,.88],roadTint:[.83,.80,.70]},
  vegetation: {...verdant.vegetation,clusterCount:60,loneCount:130,rimCount:95,grassDensity:1,bushCount:.8},
  props: {
    // Every building is an authored site (the towns are mirror images), so the roadside builder places none.
    plan: [],
    plannedSites: [...SOUTH_TOWN, ...SOUTH_TOWN.map(mirrorSite), ...MILLS, ...SOUTH_FARMS,
      ...[...MILLS, ...SOUTH_FARMS].map(mirrorSite)],
    destructibleBuildings: ['guardpost', 'fieldhut', 'leanto', 'huntingblind', 'commandtent'],
    blockFill: false, extraKits: [], buildingLat: [20, 5], spacingPad: 12, sideSkip: .12, maxSpread: 3.2,
    // Three strongpoint pairs, each the other's mirror across the gorge: the tollhouses at the bridgeheads, the rim
    // observation posts above the west ford, the command folds in the east bottomland.
    tacticalBeats: [
      { id: 'south-tollhouse', role: 'brawl', x: -36, z: -120, yawDeg: 90, structure: 'guardpost', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'north-tollhouse', role: 'brawl', x: -36, z: 120, yawDeg: 90, structure: 'guardpost', redoubt: true,
        outcrop: { count: 4, radius: 8 } },
      { id: 'south-ford-post', role: 'scout', x: -350, z: -150, yawDeg: 0, structure: 'huntingblind',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-ford-post', role: 'scout', x: -350, z: 150, yawDeg: 180, structure: 'huntingblind',
        outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'south-command-fold', role: 'support', x: 286, z: -246, yawDeg: 0, structure: 'commandtent',
        redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'north-command-fold', role: 'support', x: 286, z: 246, yawDeg: 180, structure: 'commandtent',
        redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
    ],
    // Dry-stone field walls on the olive terraces and round the bottomland meadows, each with its mirror.
    wallRuns: [
      [-280, -150, -190, -170, 2], [-280, 150, -190, 170, 2], [-360, -280, -290, -310, 1], [-360, 280, -290, 310, 1],
      [180, -150, 250, -140, 3], [180, 150, 250, 140, 3], [330, -320, 400, -300, 2], [330, 320, 400, 300, 2],
    ],
    // no overhead line along the main road: it runs over the viaduct and through the two old squares
    well: false, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 14, rocks: 180, outcrops: 38, craters: 8, rubblePiles: 0, hedgehogs: 4, sandbagLines: 6, cropFields: 3,
    tankWrecks: verdant.props.tankWrecks,
    wallStyle: 'fieldstone',
    inhabit: { ...verdant.props.inhabit, stalls: 2, benches: 2, coreClutter: 6 },
  },
  horizon:{...verdant.horizon,amp:1.55,baseHex:0x456a38,rockHex:0x777c70,treeline:.95,haze:.7},
  sky:{...verdant.sky,sunElevationDeg:34,sunAzimuthDeg:235,cloudOpacity:.56,cloudOpacity2:.2,cloudAltM:1250,
    fogDensity:.00028,fogTintHex:0xb3c4b6,sunColorHex:0xfff0d9,sunIntensity:3.5,postExposure:.98},
  clouds:{regime:'fair-weather-cumulus',baseM:1200,coverage:.28,contrails: 0.3, cirrus: 0.25},
  minimap:{...verdant.minimap},
  shot:{pos:[-170,45,-170],look:[20,-4,30]},
} satisfies MapCompositionConfig;
