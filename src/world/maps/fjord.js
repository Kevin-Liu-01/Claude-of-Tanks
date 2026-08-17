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
    roads: { grid: {
      xs: [-182, -42, { at: 102, hi: 330 }, { at: 214, hi: 300 }],
      zs: [-256, -92, 74, 226], jitter: 3.8,
    } },
    village: { x0: -210, x1: 254, z0: -286, z1: 278, cx: 18, cz: -8, feather: 48, flatten: 0.72, relief: 0.22 },
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
    plan: ['lighthouse', 'boatshed', 'netyard', 'depot', 'logcabin', 'alpine',
      'warehouse', 'boatshed', 'chapel', 'cornershop', 'ruin', 'netyard', 'depot', 'logcabin',
      'warehouse', 'boatshed', 'netyard', 'logcabin', 'alpine', 'depot', 'woodshed', 'chapel',
      'boatshed', 'warehouse', 'logcabin', 'ruin', 'netyard', 'depot'],
    blockFill: true,
    extraKits: ['coastal'], wallStyle: 'fieldstone', wallStoneChance: 0.72,
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
    baseHex: 0x42535a, amp: 1.5, style: 'alpine', treeline: 0.74,
    forestHex: 0x213b38, rockHex: 0x657077, haze: 0.9, grain: 0.58,
  },
  sky: {
    sunElevationDeg: 18, sunAzimuthDeg: 146, turbidity: 6.2, rayleigh: 1.55,
    mieCoefficient: 0.009, mieDirectionalG: 0.84, fogDensity: 0.00105,
    fogTintHex: 0x8299a4, fogMix: 0.72, envIntensity: 0.28,
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
