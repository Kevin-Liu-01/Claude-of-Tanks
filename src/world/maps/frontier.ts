// frontier.js — temperate NATO training country turned into a fought-over
// combined-arms basin: long field lanes, a dense service village, checkpoints,
// farm compounds and modern roadside losses.

export default {
  id: 'frontier',
  name: 'Frontier Basin',
  blurb: 'A broad farming basin cut by checkpoints, hedgerows and hull-down ridges',

  terrain: {
    hillScale: 1.08, microScale: 1.16, rimH: 31,
    roads: { paths: [
      [[-426, -456], [-344, -286], [-286, -96], [-302, 108], [-236, 292], [-172, 472]],
      [[-58, -470], [-34, -278], [-10, -104], [18, 44], [54, 228], [98, 476]],
      [[354, -458], [286, -292], [250, -112], [274, 74], [232, 262], [176, 470]],
      [[-388, 26], [-214, 2], [-42, 28], [138, 18], [326, 64]],
    ] },
    marshes: [
      { x: -282, z: 118, r: 34, dip: 1.8 },
      { x: 244, z: -196, r: 42, dip: 2.2 },
    ],
    village: { x0: -112, x1: 122, z0: -76, z1: 150, cx: 6, cz: 38, feather: 44, flatten: 0.86, relief: 0.14 },
    landforms: [
      { kind: 'ridge', x: -244, z: -18, length: 330, width: 72, height: 7.8, yawDeg: 12 },
      { kind: 'ridge', x: 252, z: 36, length: 300, width: 76, height: 7.2, yawDeg: -16 },
      { kind: 'ridge', x: -116, z: 244, length: 190, width: 62, height: 5.2, yawDeg: 78 },
      { kind: 'knoll', x: 174, z: -224, rx: 84, rz: 66, height: 5.6, yawDeg: 24 },
      { kind: 'basin', x: -154, z: -176, rx: 92, rz: 72, height: -2.8, yawDeg: -18 },
    ],
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
    species: ['pine', 'spruce', 'oak', 'aspen'], clusterMix: [['pine', 0.36], ['spruce', 0.28], ['oak', 0.24], ['aspen', 0.12]],
    loneMix: [['oak', 0.34], ['aspen', 0.26], ['pine', 0.22], ['spruce', 0.18]], rimMix: [['pine', 0.38], ['spruce', 0.34], ['oak', 0.18], ['aspen', 0.10]],
    clusterCount: 78, loneCount: 188, rimCount: 116, grassDensity: 1.08,
    bushCount: 1.18, bushSpecies: 'oak',
  },
  props: {
    plan: ['rangerlodge', 'barn', 'depot', 'tavern', 'schoolhouse', 'chapel',
      'granary', 'farmhouse', 'ruin', 'barn', 'woodshed', 'cottage', 'tower', 'depot',
      'farmhouse', 'granary', 'barn', 'cottage', 'depot', 'woodshed', 'farmhouse', 'ruin',
      'chapel', 'cornershop', 'barn', 'cottage'],
    destructibleBuildings: ['fieldhut', 'huntingblind', 'commandtent', 'checkpointhut'],
    tacticalBeats: [
      { id: 'western-checkpoint', role: 'brawl', x: -252, z: 54, yawDeg: 8,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -14 },
      { id: 'basin-observation-post', role: 'scout', x: 44, z: -168, yawDeg: 18,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-field-hq', role: 'support', x: 254, z: 164, yawDeg: -18,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.55,
    wallRuns: [
      [-294, -126, -198, -98, 3], [-286, 82, -186, 104, 2],
      [172, -122, 282, -150, 4], [182, 126, 286, 102, 3],
      [-138, 224, -36, 250, 2], [72, -240, 160, -214, 3],
      [-160, -220, -92, -160, 2], [116, 196, 196, 244, 3],
    ],
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
    baseHex: 0x526344, amp: 1.18, style: 'rolling', treeline: 0.91, treelineLayers: 3,
    forestHex: 0x2f472d, rockHex: 0x6c6b5c, haze: 0.94, grain: 0.66,
  },
  sky: {
    sunElevationDeg: 27, sunAzimuthDeg: 121, turbidity: 4.4, rayleigh: 1.25,
    mieCoefficient: 0.0058, mieDirectionalG: 0.82, fogDensity: 0.00066,
    fogTintHex: 0x8293a5, fogMix: 0.50, envIntensity: 0.22,
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
