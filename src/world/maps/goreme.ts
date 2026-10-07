// src/world/maps/goreme.ts — Chimney Valley, a new battlefield (the map-revival lane, 2026-10-05; docs/MAP-LAYOUT-BRIEF.md).
//
// Reference: Göreme in Cappadocia (Nevşehir province). The Erciyes, Hasan and Göllüdağ eruptions laid a plateau of soft
// ignimbrite tuff under harder welded and basalt beds; streams cut it into steep valleys, and on the valley sides the
// rain eroded the tuff into fairy chimneys, cones of soft rock that keep a cap of the harder bed on a neck. The town
// stands in the bowl where Pigeon Valley and the Göreme stream meet, its houses cut into the chimneys' bases and built
// of the same tuff in squared blocks; Uçhisar's and Ortahisar's castle rocks, tuff pinnacles riddled with rooms, stand
// over the valleys; the rock-cut churches of the Open-Air Museum lie up the Ürgüp road; dovecotes cut high in the
// valley walls carry white-painted rims round their holes.
//
// The story on the ground: two stream valleys come down off the plateau from the south and the north and meet in the
// bowl at the centre, where the town stands round its junction square. Between the valley floor and the plateau's two
// benches on the west and east the valley sides are the chimney fields. The benches are flat-capped tuff tables with
// steep bedded walls, each running out on a ramp at both ends. Two castle rocks stand over the valley
// sides beside the middle, the landmarks, and a smaller rock stands on the axis at each valley head in front of a
// deployment, screening it down the valleys. The layout turns about the centre: each deployment, its valley, its bench's ramp, its
// castle rock and its gate rock are the other's rotation.
//
// Three lanes cross the middle: the valley floor through the town and its orchards, and on each side the chimney field
// and, beyond it, the bench top (long lanes, hull-down at its rim). The zone-control discs stand on the town square and
// on the two chimney fields' aprons in front of the benches, on the line of equal driven distance.
//
// Landmarks: the two castle rocks, the gate rocks, the chimney fields, the town's mosque and its minaret, the benches.

import { roundRoadBends } from './roadBends.ts';
import type { RoadPoint } from './roadEndpoints.ts';
import type { RockRoomsSite } from './rockRooms.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A site's rotation about the centre (the layout's symmetry). */
const turned = <T extends { x: number; z: number }>(site: T): T => ({ ...site, x: -site.x, z: -site.z });

/** The tuff tables: bedded walls over a talus apron, a broad cap, rills down the walls; each end a ramp. */
// (round 2, gauntlet wave 136: "no fluted tuff walls or bench rims": the walls sheerer and their rills cut deeper)
const benchGeology = () => ({
  profile: 'butte' as const, wall: [0.42, 0.55] as const, apron: 0.26,
  strata: { stepM: 4.0, riser: 0.42 }, outline: 0.24, rough: 0.7, gullies: { count: 4, depthM: 3, width: 0.42 },
});

/** The castle rocks: tuff pinnacles, a near-level crown over sheer fluted walls and a talus skirt. */
// (round 2, gauntlet wave 136: "a straight-sided grey drum ... ringed by white egg-shaped boulders": the plan lobed like
// Uçhisar's, its alcoves deeper, half the boulders)
const castleGeology = (flutes: number, bosses: number) => ({
  profile: 'inselberg' as const, outline: 0.32, foot: 0.62, footVary: 0.14, apron: 0.24, rim: 0.82,
  flutes: { count: flutes, depth: 0.4 }, bosses: { count: bosses, heightM: 3.5 }, rough: 0.9, boulders: 6, strata: { stepM: 3 },
  gullies: { count: 5, depthM: 1.4, width: 0.4 },
});

/** The castle rocks over the valley sides beside the middle, each the other's rotation. */
const CASTLE_ROCKS = [{ x: -150, z: 80, rx: 26, rz: 23, height: 30 }, { x: 150, z: -80, rx: 26, rz: 23, height: 30 }] as const;
/** The gate rocks at the valley heads, screening each deployment down the axis. */
const GATE_ROCKS = [{ x: 6, z: -300, rx: 24, rz: 20, height: 18 }, { x: -6, z: 300, rx: 24, rz: 20, height: 18 }] as const;

/**
 * The rooms cut into the castle and gate rocks (rockRooms.ts, laid by the 'rockRooms' dressing kit): their doorways,
 * windows, dovecotes and built fronts, and the passage cut through each gate rock along the valley's axis, its mouth on
 * both faces (round 2, gauntlet wave 136: "a straight-sided grey drum", "no gate, passage or doorway cut through it").
 */
export const GOREME_ROCK_ROOMS: readonly RockRoomsSite[] = [
  ...CASTLE_ROCKS.map((rock) => ({ ...rock, apron: 0.24 })),
  ...GATE_ROCKS.map((rock) => ({ ...rock, apron: 0.24, gateBearings: [Math.atan2(-rock.z, -rock.x), Math.atan2(rock.z, rock.x)] })),
];

const westRoad: readonly RoadPoint[] = [[-470, -262], [-396, -258], [-318, -244], [-246, -206], [-176, -150], [-112, -92], [-58, -40], [0, 0]];
const southRoad: readonly RoadPoint[] = [[-88, -470], [-74, -390], [-60, -300], [-44, -200], [-24, -100], [0, 0]];

/** A road's rotation about the centre, run from the junction outward. */
const rotatedRoad = (route: readonly RoadPoint[]): RoadPoint[] => route.map(([x, z]): RoadPoint => [-x, -z]).reverse();

export default {
  id: 'goreme',
  name: 'Chimney Valley',
  blurb: 'Two tuff valleys meet below fairy-chimney fields, a cave town and its castle rocks',
  terrain: {
    hillScale: 0.62, microScale: 0.7, rimH: 46, marshes: [],
    // the authored benches, rocks and the bowl replace the noise mesas; the rock gate reads the rock landforms
    mesas: null, landformRock: true,
    hardstands: [
      // the zone aprons: the town square at the junction and the chimney fields' aprons in front of the benches
      { x: 0, z: 0, width: 58, length: 58, yawDeg: 0, level: 0, grade: 0, bankM: 14 },
      { x: -214, z: 12, width: 54, length: 54, yawDeg: 0, level: 0, grade: 0.05, bankM: 16 },
      { x: 214, z: -12, width: 54, length: 54, yawDeg: 180, level: 0, grade: 0.05, bankM: 16 },
    ],
    village: { x0: -128, x1: 128, z0: -120, z1: 120, cx: 0, cz: 0, feather: 50, flatten: 0.74, relief: 0.26 },
    // two roads cross in the junction square: Nevşehir's from the west past the west castle rock running on as Ürgüp's
    // to the east past the east one, and the Pigeon Valley track from the south running on as Avanos's road to the north
    // (each half the other's rotation about the centre; the telegraph line follows the first)
    roads: { paths: roundRoadBends([
      [...westRoad, ...rotatedRoad(westRoad).slice(1)],
      [...southRoad, ...rotatedRoad(southRoad).slice(1)],
    ]) },
    landforms: [
      // the plateau's two benches along the valley sides, each running out on a ramp at both ends, so its top is a
      // lane from one valley head to the other (a ridge at yaw 90 runs along z)
      // (round 2: 17 -> 20 m, the valley's rims standing over it)
      { kind: 'ridge', x: -350, z: -14, length: 470, width: 70, height: 20, yawDeg: 90, corridorScale: 1, settlementScale: 1,
        geology: benchGeology() },
      { kind: 'ridge', x: 350, z: 14, length: 470, width: 70, height: 20, yawDeg: 90, corridorScale: 1, settlementScale: 1,
        geology: benchGeology() },
      // the valley sides between the floor and the benches, rising toward the tables (the chimney fields stand on them)
      // (round 2, gauntlet wave 136: "a broad flat basin ... smooth sand dunes": the valley sides rise further and the rain
      // has cut them into ravines between spurs, the ground the chimney fields stand on)
      { kind: 'ridge', x: -212, z: -6, length: 430, width: 64, height: 8, yawDeg: 90, corridorScale: 0.8,
        geology: { outline: 0.28, rough: 0.8, gullies: { count: 6, depthM: 2.6, width: 0.42 } } },
      { kind: 'ridge', x: 212, z: 6, length: 430, width: 64, height: 8, yawDeg: 90, corridorScale: 0.8,
        geology: { outline: 0.28, rough: 0.8, gullies: { count: 6.4, depthM: 2.5, width: 0.42 } } },
      // the castle rocks over the valley sides beside the middle (each the other's rotation)
      ...CASTLE_ROCKS.map((rock, i) => ({ kind: 'knoll' as const, ...rock, corridorScale: 1, settlementScale: 1, geology: castleGeology(12 + i, 2) })),
      // the gate rocks at the valley heads, screening each deployment down the axis
      ...GATE_ROCKS.map((rock, i) => ({ kind: 'knoll' as const, ...rock, corridorScale: 1, settlementScale: 1, geology: castleGeology(9 + i, 1) })),
      // the bowl where the two valleys meet (round 2 kept it at 6 m: 8.5 m hid the valleys past its rim from inside it,
      // and the layout brief's long sight lines fell under their band)
      { kind: 'basin', x: 0, z: 0, rx: 180, rz: 168, height: -6.0, corridorScale: 0.7, geology: { outline: 0.2, rough: 0.4 } },
    ],
  },
  spawns: {
    // the teams come down the two valleys: alpha's pad at the south valley head, bravo's seven pads as its rotation
    player: { x: 0, z: -398 },
    enemies: [{ x: 12, z: 396 }, { x: 4, z: 396 }, { x: -4, z: 396 }, { x: -12, z: 396 }, { x: 12, z: 406 }, { x: 4, z: 406 }, { x: -4, z: 406 }],
  },
  splat: {
    // the tuff's cream and rose: the procedural fallback's tones (the rendered albedo is the sourced 'goreme' row)
    grassTone: (_h: number, s: number, l: number) => [0.12, clamp01(s * 0.42), clamp01(0.22 + l * 0.66)],
    dirtTone: (_h: number, s: number, l: number) => [0.07, clamp01(s * 0.36), clamp01(0.26 + l * 0.52)],
    rockTone: (_h: number, s: number, l: number) => [0.07, clamp01(s * 0.32), clamp01(0.52 + (l - 0.5) * 0.6)],
    sourcedPalette: 'goreme',
    tintA: [1.02, 0.96, 0.9], tintB: [0.9, 0.84, 0.8], tintC: [1.04, 0.92, 0.84],
    roadTint: [0.8, 0.74, 0.66], strata: 0.16, sandMacro: 0.2, midRelief: 0.9,
  },
  vegetation: {
    // Cappadocia's few trees: Lombardy poplars along the stream beds (the poplar slot), apricot and walnut in the
    // orchards (the oak and acacia slots, treeBiomes.ts), the bushes the steppe's low scrub
    species: ['poplar', 'oak', 'acacia'], clusterMix: [['poplar', 0.4], ['oak', 0.35], ['acacia', 0.25]],
    loneMix: [['acacia', 0.45], ['oak', 0.35], ['poplar', 0.2]], rimMix: [['oak', 0.5], ['acacia', 0.35], ['poplar', 0.15]],
    clusterCount: 10, loneCount: 22, rimCount: 16, grassDensity: 0.28, bushCount: 0.4, bushSpecies: 'acacia',
    grassTexTone: (_h: number, s: number, l: number) => [0.12, clamp01(s * 0.45), clamp01(l * 0.92 + 0.08)],
    tuftTone: (_h: number, _s: number, l: number) => [0.12, 0.26, clamp01(l * 0.7 + 0.12)],
  },
  props: {
    // the Cappadocian kit (regional/cappadocia.ts): squared-tuff houses, the courtyard gates, the caravanserai, the
    // minaret, rooms cut into fairy chimneys and outcrops
    architecture: 'cappadocia',
    // (round 2, gauntlet wave 136: "the cave town is about fifteen tiny white boxes round an empty dirt plaza", "a dozen
    // small buildings ... tens of metres apart": the street rows run on with more houses and courts, as many as their
    // frontage seats, and most houses are the honey-cream squared tuff rather than white render. The blocks behind the
    // rows stay open: filled, they closed the valley's long sight lines under the layout brief's band, 0.036 -> 0.027 of
    // rays at 300 m)
    plan: ['adobe', 'compound', 'minaret', 'market', 'marketRow', 'adobe', 'compound', 'tower', 'adobe', 'ruin',
      'caravanserai', 'adobe', 'compoundSouk', 'bathhouse', 'adobe', 'ruin', 'compound', 'adobe',
      'adobe', 'compound', 'adobe', 'adobe', 'ruin', 'adobe', 'compound', 'adobe', 'adobe', 'compound', 'adobe', 'adobe'],
    destructibleBuildings: ['guardpost', 'deserttent', 'commandtent'],
    buildingLat: [16.5, 2], destructibleBuildingLat: [16, 3],
    // the strongpoints in rotated pairs (each the other's turn about the centre), at least 180 m apart and within 60 m of
    // a road: a lookout on each bench's end over the Nevşehir–Ürgüp road, a sandbagged brawl post at each valley head
    // beside the valley road, a support camp where each valley floor opens below the town
    tacticalBeats: [
      { id: 'west-bench-lookout', role: 'scout', x: -350, z: -225, yawDeg: 30, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      turned({ id: 'east-bench-lookout', role: 'scout', x: -350, z: -225, yawDeg: 210, structure: 'guardpost', outcrop: { count: 5, radius: 9 } }),
      { id: 'south-valley-redoubt', role: 'brawl', x: -95, z: -310, yawDeg: 10, structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true },
      turned({ id: 'north-valley-redoubt', role: 'brawl', x: -95, z: -310, yawDeg: 190, structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true }),
      { id: 'south-road-camp', role: 'support', x: -10, z: -150, yawDeg: 0, structure: 'commandtent', redoubt: true, outcrop: { count: 4, radius: 8 } },
      turned({ id: 'north-road-camp', role: 'support', x: -10, z: -150, yawDeg: 180, structure: 'commandtent', redoubt: true, outcrop: { count: 4, radius: 8 } }),
    ],
    // (the cappadocia kit's buildings fill their whole plots: at the base plan's 7 m pad the squared-tuff blocks closed
    // the lanes between the minaret, the arasta and the courts, and the pacing seeds' bots circled them for ten minutes;
    // the town's lanes are a tank wide again at 10 m)
    wallStyle: 'adobe', wallStoneChance: 0.7, sideSkip: 0.14, spacingPad: 10,
    // (round 2: the rooms cut into the castle and gate rocks, mapKits.ts dressMapExtras -> rockRooms.ts)
    extraKits: ['rockRooms'],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: false,
    rocks: 120, outcrops: 20, craters: 30, rubblePiles: 10, sandbagLines: 10, hedgehogs: 6,
    tankWrecks: { era: 'modern', count: 4, debris: true, ids: ['m60a3', 't72b3m', 'm1a1', 'leo2a7v'] },
  },
  // the fairy chimneys (sceneryRocks.ts 'chimney' on the 'tuff' geology): the chimney fields on the valley sides, two
  // discs a side (each the other's rotation), clear of the zone aprons and the castle rocks, and a cluster beside each
  // gate rock; every chimney its own height, girth, profile, flutes and cap
  // (round 2, gauntlet wave 136: "identical smooth pink pins with puck caps, each alone on flat ground": half again as
  // many, on the ravined slopes rather than anywhere in the disc, more of them twins and triplets on a shared mound)
  scenery: {
    rockFields: [
      { geology: 'tuff' as const, x: -206, z: -118, radius: 86, count: 22, size: [2.0, 6.8] as const, slopeBias: 0.45, talusDeg: 32,
        avoid: [[-214, 12, 40], [-150, 80, 34]] as const, name: 'the west chimney field (south)' },
      { geology: 'tuff' as const, x: -206, z: 122, radius: 86, count: 22, size: [2.0, 6.8] as const, slopeBias: 0.45, talusDeg: 32,
        avoid: [[-214, 12, 40], [-150, 80, 34]] as const, name: 'the west chimney field (north)' },
      { geology: 'tuff' as const, x: 206, z: 118, radius: 86, count: 22, size: [2.0, 6.8] as const, slopeBias: 0.45, talusDeg: 32,
        avoid: [[214, -12, 40], [150, -80, 34]] as const, name: 'the east chimney field (north)' },
      { geology: 'tuff' as const, x: 206, z: -122, radius: 86, count: 22, size: [2.0, 6.8] as const, slopeBias: 0.45, talusDeg: 32,
        avoid: [[214, -12, 40], [150, -80, 34]] as const, name: 'the east chimney field (south)' },
      { geology: 'tuff' as const, x: 74, z: -268, radius: 40, count: 8, size: [2.0, 5.4] as const, slopeBias: 0.35, talusDeg: 32, name: 'the south gate chimneys' },
      { geology: 'tuff' as const, x: -74, z: 268, radius: 40, count: 8, size: [2.0, 5.4] as const, slopeBias: 0.35, talusDeg: 32, name: 'the north gate chimneys' },
    ],
  },
  horizon: {
    // the tuff plateau's tables round the valleys, layered and pale, the far country the Anatolian uplands
    baseHex: 0xbca88e, amp: 1.15, style: 'mesa', treeline: 0.08, banding: 0.22,
    // the far country a volcanic field: the plateau's low tables under the cones of Erciyes and Hasan
    panorama: { regional: 'volcanicField', peakShare: 0.18, peakM: 620, peakRadiusM: 1500, treeline: 0.1 }, forestHex: 0x6c6e48, rockHex: 0xd2c2aa, haze: 0.9, grain: 0.6,
  },
  // a dry upland summer: scattered cumulus on a high base over the plateau, a little cirrus, the Kayseri airway's contrails
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.3, baseM: 1800, streets: 0.25, cirrus: 0.3, contrails: 0.4, virga: 0.3 },
  sky: {
    sunElevationDeg: 36, sunAzimuthDeg: 138, turbidity: 4.6, rayleigh: 1.0, mieCoefficient: 0.006, mieDirectionalG: 0.82,
    // dry continental air, a little dust: clear like the arid maps
    fogDensity: 0.0003, fogTintHex: 0xbab4a8, fogMix: 0.46, envIntensity: 0.2,
    cloudOpacity: 0.8, cloudOpacity2: 0.5, cloudTintHex: 0xf4eee4, cloudAltM: 1100, cloudHazeK: 0.00012, cloudUvM: 2800, cloudShadowAmp: 0.26,
    sunIntensity: 3.9, sunColorHex: 0xfff1dc, hemiIntensity: 0.42, lighting: { groundAlbedoHex: 0xbfae96 },
  },
  minimap: {
    base: [176, 156, 128], hard: [190, 172, 146], soft: [150, 132, 106],
    forest: 'rgba(96,110,62,0.85)', forestStroke: 'rgba(58,68,36,0.9)',
    water: 'rgba(90,120,124,0.7)', waterStroke: 'rgba(54,76,80,0.8)',
    roadCasing: 'rgba(96,82,62,0.9)', roadFill: 'rgba(222,206,178,0.95)',
    buildingFill: '#e6d6bc',
  },
  // south-west over the west chimney field toward the town and the east castle rock
  shot: { pos: [-260, 58, -250], look: [40, 2, 40] },
} satisfies import('./contracts.ts').MapCompositionConfig;
