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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** A site's rotation about the centre (the layout's symmetry). */
const turned = <T extends { x: number; z: number }>(site: T): T => ({ ...site, x: -site.x, z: -site.z });

/** The tuff tables: bedded walls over a talus apron, a broad cap, rills down the walls; each end a ramp. */
const benchGeology = () => ({
  profile: 'butte' as const, wall: [0.4, 0.58] as const, apron: 0.26,
  strata: { stepM: 3.4, riser: 0.42 }, outline: 0.22, rough: 0.7, gullies: { count: 2.6, depthM: 2.4, width: 0.42 },
});

/** The castle rocks: tuff pinnacles, a near-level crown over sheer fluted walls and a talus skirt. */
const castleGeology = (flutes: number, bosses: number) => ({
  profile: 'inselberg' as const, outline: 0.2, foot: 0.62, footVary: 0.12, apron: 0.24, rim: 0.82,
  flutes: { count: flutes, depth: 0.32 }, bosses: { count: bosses, heightM: 3.5 }, rough: 0.9, boulders: 12, strata: { stepM: 3 },
  gullies: { count: 5, depthM: 1.4, width: 0.4 },
});

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
    // the four roads meet in the junction square: Nevşehir's from the west past the west castle rock, Ürgüp's to the
    // east past the east one, the Pigeon Valley track from the south and Avanos's road to the north (each the other's
    // rotation about the centre)
    roads: { paths: roundRoadBends([
      westRoad,
      rotatedRoad(westRoad),
      southRoad,
      rotatedRoad(southRoad),
    ]) },
    landforms: [
      // the plateau's two benches along the valley sides, each running out on a ramp at both ends, so its top is a
      // lane from one valley head to the other (a ridge at yaw 90 runs along z)
      { kind: 'ridge', x: -350, z: -14, length: 470, width: 70, height: 17, yawDeg: 90, corridorScale: 1, settlementScale: 1,
        geology: benchGeology() },
      { kind: 'ridge', x: 350, z: 14, length: 470, width: 70, height: 17, yawDeg: 90, corridorScale: 1, settlementScale: 1,
        geology: benchGeology() },
      // the valley sides between the floor and the benches, rising toward the tables (the chimney fields stand on them)
      { kind: 'ridge', x: -212, z: -6, length: 430, width: 64, height: 5.5, yawDeg: 90, corridorScale: 0.8,
        geology: { outline: 0.25, rough: 0.6, gullies: { count: 3.2, depthM: 1.6, width: 0.5 } } },
      { kind: 'ridge', x: 212, z: 6, length: 430, width: 64, height: 5.5, yawDeg: 90, corridorScale: 0.8,
        geology: { outline: 0.25, rough: 0.6, gullies: { count: 3.4, depthM: 1.5, width: 0.48 } } },
      // the castle rocks over the valley sides beside the middle (each the other's rotation)
      { kind: 'knoll', x: -150, z: 80, rx: 26, rz: 23, height: 30, corridorScale: 1, settlementScale: 1, geology: castleGeology(12, 2) },
      { kind: 'knoll', x: 150, z: -80, rx: 26, rz: 23, height: 30, corridorScale: 1, settlementScale: 1, geology: castleGeology(13, 2) },
      // the gate rocks at the valley heads, screening each deployment down the axis
      { kind: 'knoll', x: 6, z: -300, rx: 24, rz: 20, height: 18, corridorScale: 1, settlementScale: 1, geology: castleGeology(9, 1) },
      { kind: 'knoll', x: -6, z: 300, rx: 24, rz: 20, height: 18, corridorScale: 1, settlementScale: 1, geology: castleGeology(10, 1) },
      // the bowl where the two valleys meet
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
    grassTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.42), clamp01(0.22 + l * 0.66)],
    dirtTone: (h: number, s: number, l: number) => [0.07, clamp01(s * 0.36), clamp01(0.26 + l * 0.52)],
    rockTone: (h: number, s: number, l: number) => [0.07, clamp01(s * 0.32), clamp01(0.52 + (l - 0.5) * 0.6)],
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
    grassTexTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.45), clamp01(l * 0.92 + 0.08)],
    tuftTone: (h: number, s: number, l: number) => [0.12, 0.26, clamp01(l * 0.7 + 0.12)],
  },
  props: {
    // the Cappadocian kit (regional/cappadocia.ts): squared-tuff houses, the courtyard gates, the caravanserai, the
    // minaret, rooms cut into fairy chimneys and outcrops
    architecture: 'cappadocia',
    plan: ['adobe', 'compound', 'minaret', 'market', 'marketRow', 'adobe', 'compound', 'tower', 'adobe', 'ruin',
      'caravanserai', 'adobe', 'compoundSouk', 'bathhouse', 'adobe', 'ruin', 'compound', 'adobe'],
    destructibleBuildings: ['guardpost', 'deserttent', 'commandtent'],
    buildingLat: [16.5, 2], destructibleBuildingLat: [16, 3],
    tacticalBeats: [
      { id: 'pigeon-valley-post', role: 'scout', x: -120, z: -260, yawDeg: 20, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      turned({ id: 'avanos-road-post', role: 'scout', x: -120, z: -260, yawDeg: 200, structure: 'guardpost', outcrop: { count: 5, radius: 9 } }),
    ],
    // (the cappadocia kit's buildings fill their whole plots: at the base plan's 7 m pad the squared-tuff blocks closed
    // the lanes between the minaret, the arasta and the courts, and the pacing seeds' bots circled them for ten minutes;
    // the town's lanes are a tank wide again at 10 m)
    wallStyle: 'adobe', wallStoneChance: 0.5, sideSkip: 0.14, spacingPad: 10,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: false,
    rocks: 120, outcrops: 20, craters: 30, rubblePiles: 10, sandbagLines: 10, hedgehogs: 6,
    tankWrecks: { era: 'modern', count: 4, debris: true, ids: ['m60a3', 't72b3m', 'm1a1', 'leo2a7v'] },
  },
  // the fairy chimneys (sceneryRocks.ts 'chimney' on the 'tuff' geology): the chimney fields on the valley sides, two
  // discs a side (each the other's rotation), clear of the zone aprons and the castle rocks, and a cluster beside each
  // gate rock; every chimney its own height, girth, profile, flutes and cap
  scenery: {
    rockFields: [
      { geology: 'tuff' as const, x: -206, z: -118, radius: 92, count: 15, size: [2.4, 6.0] as const, slopeBias: 0.15, talusDeg: 32,
        avoid: [[-214, 12, 40], [-150, 80, 34]] as const, name: 'the west chimney field (south)' },
      { geology: 'tuff' as const, x: -206, z: 122, radius: 92, count: 15, size: [2.4, 6.0] as const, slopeBias: 0.15, talusDeg: 32,
        avoid: [[-214, 12, 40], [-150, 80, 34]] as const, name: 'the west chimney field (north)' },
      { geology: 'tuff' as const, x: 206, z: 118, radius: 92, count: 15, size: [2.4, 6.0] as const, slopeBias: 0.15, talusDeg: 32,
        avoid: [[214, -12, 40], [150, -80, 34]] as const, name: 'the east chimney field (north)' },
      { geology: 'tuff' as const, x: 206, z: -122, radius: 92, count: 15, size: [2.4, 6.0] as const, slopeBias: 0.15, talusDeg: 32,
        avoid: [[214, -12, 40], [150, -80, 34]] as const, name: 'the east chimney field (south)' },
      { geology: 'tuff' as const, x: 74, z: -268, radius: 40, count: 5, size: [2.2, 4.8] as const, slopeBias: 0.1, talusDeg: 32, name: 'the south gate chimneys' },
      { geology: 'tuff' as const, x: -74, z: 268, radius: 40, count: 5, size: [2.2, 4.8] as const, slopeBias: 0.1, talusDeg: 32, name: 'the north gate chimneys' },
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
