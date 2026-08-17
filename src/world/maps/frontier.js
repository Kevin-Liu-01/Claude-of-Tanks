// frontier.js — temperate NATO training country turned into a fought-over
// combined-arms basin: long field lanes, a dense service village, checkpoints,
// farm compounds and modern roadside losses.

export default {
  id: 'frontier',
  name: 'Frontier Basin',
  sub: 'Fields · Checkpoints · Ridgelines',
  blurb: 'A broad farming basin cut by checkpoints, hedgerows and hull-down ridges',

  terrain: {
    hillScale: 1.08, microScale: 1.16, rimH: 31,
    marshes: [
      { x: -282, z: 118, r: 34, dip: 1.8 },
      { x: 244, z: -196, r: 42, dip: 2.2 },
    ],
    village: { x0: -112, x1: 122, z0: -76, z1: 150, cx: 6, cz: 38, feather: 44, flatten: 0.86, relief: 0.14 },
  },
  spawns: {
    player: { x: -42, z: -382 },
    enemies: [
      { x: -130, z: 360 }, { x: -67, z: 398 }, { x: 4, z: 370 },
      { x: 78, z: 402 }, { x: 144, z: 352 }, { x: 208, z: 382 }, { x: -205, z: 400 },
    ],
  },
  splat: {
    fieldPatch: 1, tintA: [1.10, 1.03, 0.78], tintB: [0.72, 0.78, 0.58],
    tintC: [1.04, 0.98, 0.73], roadTint: [0.82, 0.77, 0.66], midRelief: 0.82,
  },
  vegetation: {
    species: ['pine', 'oak'], clusterMix: [['oak', 0.66], ['pine', 0.34]],
    loneMix: [['oak', 0.72], ['pine', 0.28]], rimMix: [['pine', 0.56], ['oak', 0.44]],
    clusterCount: 78, loneCount: 188, rimCount: 116, grassDensity: 1.08,
    bushCount: 1.18, bushSpecies: 'oak',
  },
  props: {
    plan: ['farmhouse', 'barn', 'depot', 'cornershop', 'cottage', 'chapel',
      'granary', 'farmhouse', 'ruin', 'barn', 'woodshed', 'cottage', 'tower', 'depot',
      'farmhouse', 'granary', 'barn', 'cottage', 'depot', 'woodshed', 'farmhouse', 'ruin',
      'chapel', 'cornershop', 'barn', 'cottage'],
    wallStyle: 'fieldstone', wallStoneChance: 0.55,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 28, rocks: 205, outcrops: 28, craters: 68, rubblePiles: 12,
    cropFields: 9, hedgehogs: 14, sandbagLines: 18,
    tankWrecks: { era: 'modern', count: 6, debris: true },
    inhabit: {
      stalls: 2, benches: 3, coreClutter: 18, bales: 14, stooks: 12,
      troughs: 2, churns: 2, laundry: 2, handcarts: 3, carts: 4,
      trucks: 5, jeeps: 4, drumClusters: 5, camps: 4, modernClutter: 18,
      roadFence: 'fenceplank', yardFence: 'fencepicket',
    },
  },
  horizon: {
    baseHex: 0x526344, amp: 1.18, style: 'rolling', treeline: 0.91,
    forestHex: 0x2f472d, rockHex: 0x6c6b5c, haze: 0.94, grain: 0.66,
  },
  sky: {
    sunElevationDeg: 27, sunAzimuthDeg: 121, turbidity: 4.8, rayleigh: 1.25,
    mieCoefficient: 0.0065, mieDirectionalG: 0.82, fogDensity: 0.00078,
    fogTintHex: 0x8293a5, fogMix: 0.55, envIntensity: 0.22,
    cloudOpacity: 1.0, cloudOpacity2: 0.7, cloudTintHex: 0xf4f4ef,
    sunIntensity: 4.25, sunColorHex: 0xffebcf, hemiIntensity: 0.38,
  },
  minimap: {
    base: [82, 94, 55], hard: [112, 105, 86], soft: [48, 69, 55],
    forest: 'rgba(36,61,31,.84)', forestStroke: 'rgba(21,38,18,.92)',
    water: 'rgba(54,78,80,.72)', waterStroke: 'rgba(28,44,46,.9)',
    roadCasing: 'rgba(46,40,31,.92)', roadFill: 'rgba(188,171,137,.96)', buildingFill: '#cbd0d2',
  },
  shot: { pos: [-132, 39, -220], look: [36, 2, 116] },
};
