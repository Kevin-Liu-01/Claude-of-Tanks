// monsoon.js — storm-dark tropical highlands with jungle belts, washed-out
// roads, a ruined hill town and saturated lowland marshes.

export default {
  id: 'monsoon',
  name: 'Monsoon Ridge',
  blurb: 'A storm rolls across jungle ridges and the shattered town in the valley',
  terrain: {
    hillScale: 1.32, microScale: 1.1, rimH: 44,
    roads: { paths: [
      [[-424, -442], [-342, -274], [-306, -82], [-322, 108], [-254, 286], [-174, 462]],
      [[-62, -468], [-42, -282], [-8, -112], [28, 48], [54, 224], [106, 466]],
      [[350, -450], [294, -286], [264, -104], [288, 72], [242, 250], [180, 450]],
      [[-356, -172], [-214, -132], [-76, -60], [62, -18], [208, -66], [322, -146]],
      [[-310, 204], [-164, 168], [-18, 210], [120, 274], [238, 328]],
    ] },
    marshes: [
      { x: -236, z: -124, r: 58, dip: 2.0 }, { x: 210, z: 184, r: 52, dip: 2.2 },
      { x: 294, z: -260, r: 38, dip: 1.8 },
    ],
    village: { x0: -132, x1: 156, z0: -112, z1: 174, cx: 12, cz: 26, feather: 50, flatten: 0.74, relief: 0.28 },
    landforms: [
      { kind: 'ridge', x: -252, z: 4, length: 360, width: 82, height: 9.2, yawDeg: 14 },
      { kind: 'ridge', x: 246, z: 42, length: 330, width: 78, height: 8.7, yawDeg: -18 },
      { kind: 'ridge', x: -28, z: 266, length: 230, width: 66, height: 6.4, yawDeg: 82 },
      { kind: 'knoll', x: 142, z: -226, rx: 82, rz: 64, height: 6.2, yawDeg: 18 },
      { kind: 'basin', x: -126, z: -202, rx: 104, rz: 76, height: -3.2, yawDeg: -16, wetScale: 0.75 },
    ],
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
    tacticalBeats: [
      { id: 'western-temple-ridge', role: 'brawl', x: -290, z: 78, yawDeg: 12,
        structure: 'longhouse', redoubt: true, outcrop: { count: 7, radius: 11 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'floodplain-listening-post', role: 'scout', x: 44, z: -184, yawDeg: 18,
        structure: 'commandtent', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-field-hospital', role: 'support', x: 264, z: 72, yawDeg: -16,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [
      [-292, -116, -204, -80, 2], [-282, 116, -190, 154, 3],
      [188, -136, 282, -102, 3], [194, 138, 286, 170, 2],
      [-134, 230, -34, 260, 3], [66, -252, 158, -218, 2],
    ],
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
    baseHex: 0x355344, amp: 1.08, style: 'alpine', treeline: 0.97, snowline: 2,
    forestHex: 0x193a28, rockHex: 0x59635a, haze: 0.97, grain: 0.64,
  },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 124, turbidity: 7.8, rayleigh: 2.05,
    mieCoefficient: 0.012, mieDirectionalG: 0.88, fogDensity: 0.00088,
    fogTintHex: 0x708c86, fogMix: 0.66, envIntensity: 0.27,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 2.9, sunColorHex: 0xffdfc0, hemiIntensity: 0.54, postExposure: 0.96,
  },
  minimap: {
    base: [51, 84, 59], hard: [82, 82, 70], soft: [37, 65, 55],
    forest: 'rgba(19,61,35,.9)', forestStroke: 'rgba(9,35,19,.97)',
    water: 'rgba(43,80,78,.8)', waterStroke: 'rgba(22,48,48,.94)',
    roadCasing: 'rgba(38,35,29,.94)', roadFill: 'rgba(133,124,100,.94)', buildingFill: '#bfc3b9',
  },
  shot: { pos: [-176, 44, -232], look: [44, 3, 92] },
};
