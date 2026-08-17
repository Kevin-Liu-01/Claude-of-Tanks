// monsoon.js — storm-dark tropical highlands with jungle belts, washed-out
// roads, a ruined hill town and saturated lowland marshes.

export default {
  id: 'monsoon',
  name: 'Monsoon Ridge',
  sub: 'Jungle · Ruins · Flooded Valleys',
  blurb: 'A storm rolls across jungle ridges and the shattered town in the valley',
  terrain: {
    hillScale: 1.32, microScale: 1.1, rimH: 44,
    marshes: [
      { x: -236, z: -124, r: 58, dip: 2.0 }, { x: 210, z: 184, r: 52, dip: 2.2 },
      { x: 294, z: -260, r: 38, dip: 1.8 },
    ],
    village: { x0: -132, x1: 156, z0: -112, z1: 174, cx: 12, cz: 26, feather: 50, flatten: 0.74, relief: 0.28 },
  },
  spawns: {
    player: { x: 10, z: -398 },
    enemies: [
      { x: -196, z: 372 }, { x: -126, z: 410 }, { x: -50, z: 366 },
      { x: 28, z: 414 }, { x: 108, z: 368 }, { x: 188, z: 404 }, { x: 258, z: 356 },
    ],
  },
  splat: {
    tintA: [0.67, 0.93, 0.65], tintB: [0.41, 0.61, 0.43], tintC: [0.85, 1.02, 0.72],
    roadTint: [0.55, 0.49, 0.40], midRelief: 1.0,
  },
  vegetation: {
    species: ['palm', 'oak'], clusterMix: [['oak', 0.68], ['palm', 0.32]],
    loneMix: [['oak', 0.76], ['palm', 0.24]], rimMix: [['oak', 0.8], ['palm', 0.2]],
    clusterCount: 118, loneCount: 238, rimCount: 148, grassDensity: 1.38,
    clusterScrub: 2.7, bushCount: 1.72, bushSpecies: 'oak',
  },
  props: {
    plan: ['ruin', 'chapel', 'bathhouse', 'marketRow', 'ruin', 'cornershop',
      'granary', 'ruin', 'depot', 'farmhouse', 'tower', 'market', 'ruin', 'woodshed',
      'marketRow', 'ruin', 'farmhouse', 'chapel', 'depot', 'ruin', 'granary', 'cornershop',
      'ruin', 'market', 'farmhouse', 'woodshed'],
    destructibleBuildings: ['stilthouse', 'longhouse', 'fieldhospital', 'commandtent'],
    wallStyle: 'fieldstone', wallStoneChance: 0.78,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 235, outcrops: 48, craters: 82, rubblePiles: 28,
    sandbagLines: 22, hedgehogs: 16,
    tankWrecks: { era: 'modern', count: 7, debris: true },
    inhabit: {
      stalls: 4, benches: 3, coreClutter: 26, pots: 5, laundry: 4,
      handcarts: 4, carts: 3, trucks: 6, jeeps: 5, drumClusters: 6,
      camps: 5, modernClutter: 22, roadFence: 'fencewattle', yardFence: 'fencewattle',
    },
  },
  horizon: {
    baseHex: 0x355344, amp: 1.28, style: 'alpine', treeline: 0.97,
    forestHex: 0x193a28, rockHex: 0x59635a, haze: 0.97, grain: 0.64,
  },
  sky: {
    sunElevationDeg: 22, sunAzimuthDeg: 124, turbidity: 9.2, rayleigh: 2.35,
    mieCoefficient: 0.018, mieDirectionalG: 0.9, fogDensity: 0.00146,
    fogTintHex: 0x708c86, fogMix: 0.76, envIntensity: 0.3,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 2.7, sunColorHex: 0xffdfc0, hemiIntensity: 0.66,
  },
  minimap: {
    base: [51, 84, 59], hard: [82, 82, 70], soft: [37, 65, 55],
    forest: 'rgba(19,61,35,.9)', forestStroke: 'rgba(9,35,19,.97)',
    water: 'rgba(43,80,78,.8)', waterStroke: 'rgba(22,48,48,.94)',
    roadCasing: 'rgba(38,35,29,.94)', roadFill: 'rgba(133,124,100,.94)', buildingFill: '#bfc3b9',
  },
  shot: { pos: [-176, 44, -232], look: [44, 3, 92] },
};
