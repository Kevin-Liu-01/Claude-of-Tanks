// titanGorge.js — a Grand Canyon-scale red-rock battlefield. Playable shelves
// and authored road cuts carry navigation; the horizon ring supplies the
// truly gigantic stacked escarpments without adding collision or draw calls.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'titan_gorge',
  name: 'Titan Gorge',
  blurb: 'Armored columns descend through immense red-rock shelves into a winding canyon crossroads',
  terrain: {
    hillScale: 0.72, microScale: 0.78, rimH: 54, marshes: [],
    dunes: { amp: 1.8 },
    mesas: { amp: 22, thr0: 0.755, thr1: 0.815, wallWidth: 0.62, corridorFloor: 0.30 },
    village: { x0: -138, x1: 148, z0: -132, z1: 152, cx: 8, cz: 12, feather: 58, flatten: 0.66, relief: 0.30 },
    roads: { paths: [
      [[-420, -458], [-338, -338], [-286, -206], [-220, -86], [-142, 28], [-82, 168], [-18, 306], [62, 466]],
      [[-128, -466], [-88, -324], [-28, -184], [44, -42], [126, 92], [212, 226], [306, 356], [390, 458]],
      [[366, -454], [304, -304], [246, -168], [172, -28], [92, 108], [8, 242], [-84, 370], [-176, 466]],
      [[-382, -72], [-260, -92], [-142, -60], [-12, -82], [116, -48], [244, -76], [372, -54]],
      [[-334, 228], [-214, 192], [-96, 220], [30, 188], [154, 224], [284, 196]],
    ] },
    landforms: [
      { kind: 'ridge', x: -268, z: 18, length: 760, width: 118, height: 17.5, yawDeg: -4, corridorScale: 0.38 },
      { kind: 'ridge', x: 278, z: 12, length: 760, width: 122, height: 18.0, yawDeg: 5, corridorScale: 0.38 },
      { kind: 'ridge', x: -52, z: 312, length: 330, width: 98, height: 12.0, yawDeg: 82, corridorScale: 0.42 },
      { kind: 'knoll', x: -116, z: -248, rx: 124, rz: 78, height: 9.0, yawDeg: 22, corridorScale: 0.44 },
      { kind: 'basin', x: 22, z: 18, rx: 188, rz: 124, height: -7.0, yawDeg: -12, corridorScale: 0.68 },
      { kind: 'knoll', x: 162, z: 274, rx: 112, rz: 72, height: 8.0, yawDeg: -24, corridorScale: 0.46 },
    ],
  },
  spawns: {
    player: { x: -352, z: -392 },
    enemies: [
      { x: -250, z: 390 }, { x: -172, z: 426 }, { x: -92, z: 382 },
      { x: -10, z: 422 }, { x: 74, z: 380 }, { x: 158, z: 416 }, { x: 244, z: 374 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h: number, s: number, l: number) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    sandstone: true,
    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.68), clamp01(0.45 + (l - 0.5) * 0.76)],
    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],
    roadTint: [0.78, 0.61, 0.51], strata: 0.22, sandMacro: 0.82,
    rippleAmp: 0.20, midRelief: 0.92, midReliefFar: 840,
  },
  vegetation: {
    species: ['oak', 'palm'], clusterMix: [['oak', 0.92], ['palm', 0.08]],
    loneMix: [['oak', 0.96], ['palm', 0.04]], rimMix: [['oak', 1]],
    clusterCount: 16, loneCount: 34, rimCount: 18, grassDensity: 0.22,
    clusterScrub: 1.7, bushCount: 0.46, bushSpecies: 'oak',
  },
  props: {
    plan: [
      'caravanserai', 'compound', 'depot', 'ruin', 'marketRow', 'watertower',
      'adobe', 'compoundSouk', 'factory', 'ruin', 'containerRow', 'minaret',
      'depot', 'warehouse', 'compound', 'ruin', 'gantry', 'marketRow',
      'caravanserai', 'adobe', 'watertower', 'ruin', 'factory', 'depot',
      'containerRow', 'compoundSouk', 'warehouse', 'ruin',
    ],
    destructibleBuildings: ['deserttent', 'motorpool', 'commandtent', 'checkpointhut'],
    tacticalBeats: [
      { id: 'western-switchback', role: 'brawl', x: -264, z: 104, yawDeg: -6,
        structure: 'motorpool', redoubt: true, outcrop: { count: 9, radius: 13, scaleMax: 4.2 }, wreck: true, wreckOffsetZ: -18 },
      { id: 'dry-river-camp', role: 'scout', x: 18, z: -210, yawDeg: 18,
        structure: 'deserttent', outcrop: { count: 6, radius: 10, scaleMax: 3.1 } },
      { id: 'eastern-shelf-battery', role: 'support', x: 274, z: 122, yawDeg: 7,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.8 }, wreck: true, wreckOffsetX: 18 },
    ],
    blockFill: true, wallStyle: 'adobe', wallStoneChance: 0.18,
    buildingLat: [12, 7], sideSkip: 0.08, spacingPad: 3.0, maxSpread: 4.0,
    wallRuns: [
      [-310, -146, -214, -112, 2], [-304, 138, -206, 172, 3],
      [206, -146, 306, -112, 3], [204, 138, 302, 174, 2],
      [-148, 260, -44, 290, 3], [64, -284, 168, -250, 2],
      [-338, 42, -292, 96, 1], [298, -84, 342, -28, 4],
    ],
    well: true, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 342, outcrops: 92, craters: 82, rubblePiles: 34,
    hedgehogs: 24, sandbagLines: 26,
    tankWrecks: { era: 'modern', count: 8, debris: true },
    inhabit: {
      stalls: 3, benches: 1, coreClutter: 24, drums: 14, pots: 7,
      trucks: 8, jeeps: 6, drumClusters: 8, camps: 6, modernClutter: 30,
      roadFence: 'fencerail', yardFence: 'fencewattle',
    },
  },
  horizon: {
    baseHex: 0x7d3f2c, amp: 2.15, style: 'mesa', treeline: 0.03,
    forestHex: 0x4d3829, rockHex: 0xa74f32, haze: 0.82, grain: 0.68,
  },
  sky: {
    sunElevationDeg: 34, sunAzimuthDeg: 126, turbidity: 6.2, rayleigh: 1.15,
    mieCoefficient: 0.008, mieDirectionalG: 0.84, fogDensity: 0.00046,
    fogTintHex: 0xb88970, fogMix: 0.49, envIntensity: 0.18,
    cloudOpacity: 0.68, cloudOpacity2: 0.30, cloudTintHex: 0xffe0c7,
    sunIntensity: 4.15, sunColorHex: 0xffc89b, hemiIntensity: 0.28, postExposure: 0.93,
  },
  minimap: {
    base: [132, 70, 47], hard: [137, 91, 65], soft: [102, 57, 43],
    forest: 'rgba(74,61,35,.58)', forestStroke: 'rgba(50,38,24,.78)',
    water: 'rgba(58,73,75,.48)', waterStroke: 'rgba(38,47,49,.68)',
    roadCasing: 'rgba(64,35,26,.96)', roadFill: 'rgba(187,119,83,.96)', buildingFill: '#d1aa82',
  },
  shot: { pos: [-286, 58, -246], look: [38, 6, 68] },
};
