// fjord.js — cold-water harbor approaches with a clipped coastal road grid,
// fishing yards, stone settlement, steep conifer shoulders and a deep bay.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  id: 'fjord',
  name: 'Nordhavn Fjord',
  sub: 'Harbor · Cliffs · Fishing Town',
  blurb: 'A cold fjord harbor where cliff roads descend into a battered fishing town',
  terrain: {
    hillScale: 1.22, microScale: 0.92, rimH: 42, softLakes: true,
    lakes: [
      { x: 438, z: -142, r: 188, depth: 2.4, level: -8.2 },
      { x: 466, z: 70, r: 176, depth: 2.4, level: -8.2 },
      { x: 442, z: 262, r: 152, depth: 2.4, level: -8.2 },
    ],
    marshes: [{ x: 286, z: -218, r: 36, dip: 1.0 }],
    roads: { paths: [
      [[-398, -454], [-346, -278], [-318, -82], [-338, 116], [-286, 302], [-220, 474]],
      [[-126, -464], [-74, -286], [-32, -114], [18, 44], [62, 226], [96, 456]],
      [[214, -432], [228, -274], [202, -104], [222, 62], [190, 220], [132, 410]],
      [[-330, -204], [-192, -154], [-48, -96], [88, -52], [212, -94]],
      [[-312, 224], [-164, 198], [-28, 224], [102, 284], [180, 354]],
    ] },
    village: { x0: -210, x1: 254, z0: -286, z1: 278, cx: 18, cz: -8, feather: 48, flatten: 0.72, relief: 0.22 },
    landforms: [
      { kind: 'ridge', x: -272, z: 24, length: 420, width: 92, height: 11.5, yawDeg: 8, corridorScale: 0.78 },
      { kind: 'ridge', x: 118, z: 286, length: 230, width: 74, height: 7.4, yawDeg: 72 },
      { kind: 'ridge', x: 62, z: -292, length: 210, width: 68, height: 6.8, yawDeg: 76 },
      { kind: 'ridge', x: -42, z: 34, length: 250, width: 62, height: 7.6, yawDeg: 42, corridorScale: 0.76, settlementScale: 0.62 },
      { kind: 'ridge', x: 176, z: -108, length: 190, width: 54, height: 6.2, yawDeg: -38, corridorScale: 0.74, settlementScale: 0.64 },
      { kind: 'knoll', x: -112, z: 188, rx: 78, rz: 62, height: 6.4, yawDeg: -24 },
      { kind: 'basin', x: 252, z: 32, rx: 98, rz: 150, height: -3.2, yawDeg: 3, wetScale: 0.8 },
    ],
  },
  spawns: {
    player: { x: -310, z: -350 },
    enemies: [
      { x: -226, z: 376 }, { x: -158, z: 410 }, { x: -82, z: 370 },
      { x: -8, z: 412 }, { x: 72, z: 366 }, { x: 142, z: 400 }, { x: 210, z: 352 },
    ],
  },
  splat: {
    grassTone: (h, s, l) => [0.39, clamp01(s * 0.34), clamp01(l * 0.82 + 0.03)],
    dirtTone: (h, s, l) => [0.09, clamp01(s * 0.28), clamp01(l * 0.88)],
    rockTone: (h, s, l) => [0.58, clamp01(s * 0.18), clamp01(l * 0.92 + 0.04)],
    mudTone: (h, s, l) => [0.54, clamp01(s * 0.85), clamp01(l * 0.68)],
    seaLake: true, seaFoam: 0.54, seaRamp: [0.22, 0.58], iceDrift: 0.08,
    marshGloss: 0.94, iceSky: [0.40, 0.55, 0.66],
    tintA: [0.86, 0.94, 0.92], tintB: [0.63, 0.72, 0.70], tintC: [0.98, 1.04, 1.02],
    roadTint: [0.66, 0.68, 0.67], midRelief: 0.94,
  },
  vegetation: {
    species: ['pine', 'oak'], clusterMix: [['pine', 0.88], ['oak', 0.12]],
    loneMix: [['pine', 0.82], ['oak', 0.18]], rimMix: [['pine', 0.94], ['oak', 0.06]],
    clusterCount: 86, loneCount: 124, rimCount: 132, grassDensity: 0.78,
    bushCount: 0.8, bushSpecies: 'pine',
  },
  props: {
    plan: ['lighthouse', 'fishery', 'netyard', 'depot', 'logcabin', 'alpine',
      'warehouse', 'boatshed', 'chapel', 'cornershop', 'ruin', 'netyard', 'depot', 'logcabin',
      'warehouse', 'boatshed', 'netyard', 'logcabin', 'alpine', 'depot', 'woodshed', 'chapel',
      'boatshed', 'warehouse', 'logcabin', 'ruin', 'netyard', 'depot'],
    destructibleBuildings: ['fishershack', 'saunahut', 'alpinerefuge', 'quonsethut'],
    tacticalBeats: [
      { id: 'western-cliff-gate', role: 'brawl', x: -286, z: 62, yawDeg: 6,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 7, radius: 11 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'harbor-watch', role: 'scout', x: 206, z: -184, yawDeg: -12,
        structure: 'fishershack', outcrop: { count: 4, radius: 8, scaleMax: 2.7 } },
      { id: 'northern-service-yard', role: 'support', x: -252, z: 286, yawDeg: 28,
        structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
    ],
    blockFill: true,
    extraKits: ['coastal'], wallStyle: 'fieldstone', wallStoneChance: 0.72,
    wallRuns: [
      [-296, -156, -210, -120, 2], [-282, 142, -188, 170, 3],
      [-128, -218, -48, -194, 2], [-106, 204, -18, 232, 3],
      [82, -174, 166, -146, 2], [76, 168, 158, 202, 3],
    ],
    buildingLat: [11, 7], sideSkip: 0.12, maxSpread: 3.0, spacingPad: 8,
    well: false, hayCrates: false, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 245, outcrops: 42, craters: 54, rubblePiles: 18, hedgehogs: 14,
    sandbagLines: 16, tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: {
      stalls: 1, benches: 4, coreClutter: 22, trucks: 5, jeeps: 3,
      drumClusters: 6, camps: 2, modernClutter: 20,
      roadFence: 'fencerail', yardFence: 'fencepicket',
    },
  },
  horizon: {
    baseHex: 0x42535a, amp: 1.34, style: 'alpine', treeline: 0.74, snowline: 0.78,
    forestHex: 0x213b38, rockHex: 0x657077, haze: 0.9, grain: 0.58,
  },
  sky: {
    sunElevationDeg: 20, sunAzimuthDeg: 146, turbidity: 5.4, rayleigh: 1.55,
    mieCoefficient: 0.0072, mieDirectionalG: 0.84, fogDensity: 0.00072,
    fogTintHex: 0x8299a4, fogMix: 0.62, envIntensity: 0.26,
    cloudOpacity: 1.15, cloudOpacity2: 0.9, cloudTintHex: 0xd9e1e2,
    sunIntensity: 3.35, sunColorHex: 0xffdfbe, hemiIntensity: 0.52,
  },
  minimap: {
    base: [68, 82, 76], hard: [92, 96, 94], soft: [42, 66, 68],
    forest: 'rgba(25,53,47,.86)', forestStroke: 'rgba(14,34,31,.94)',
    water: 'rgba(43,81,99,.88)', waterStroke: 'rgba(21,46,61,.95)',
    roadCasing: 'rgba(37,41,43,.95)', roadFill: 'rgba(143,151,150,.96)', buildingFill: '#c2c8ca',
  },
  shot: { pos: [-226, 42, -238], look: [218, -4, 38] },
};
