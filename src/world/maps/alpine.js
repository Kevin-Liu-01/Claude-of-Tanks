// alpine.js — high winter pass around a frozen lake and dense mountain
// village. Uses the shared winter-lake dressing without duplicating geometry.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  id: 'alpine',
  name: 'Glacier Pass',
  blurb: 'A frozen alpine lake divides a fortified mountain village and two high passes',
  terrain: {
    hillScale: 1.46, microScale: 0.72, rimH: 52, frozenMarshes: true,
    roads: { paths: [
      [[-420, -450], [-346, -278], [-316, -90], [-330, 108], [-276, 290], [-202, 468]],
      [[-112, -466], [-146, -304], [-154, -168], [-172, -28], [-138, 142], [-86, 316], [-18, 466]],
      [[330, -452], [286, -282], [246, -122], [226, 42], [258, 218], [212, 410]],
      [[-316, 204], [-190, 166], [-86, 128], [24, 136], [146, 188], [252, 274]],
      [[-280, -230], [-166, -208], [-68, -158], [18, -176], [138, -220], [248, -194]],
    ] },
    lakes: [
      { x: 58, z: -34, r: 116, depth: 1.6 },
      { x: -258, z: 224, r: 42, depth: 1.3 },
    ],
    marshes: [{ x: 280, z: -192, r: 44, dip: 1.4 }],
    village: { x0: -204, x1: 202, z0: -212, z1: 222, cx: -42, cz: 28, feather: 58, flatten: 0.69, relief: 0.3 },
    landforms: [
      { kind: 'ridge', x: -286, z: 22, length: 390, width: 86, height: 10.8, yawDeg: 7, corridorScale: 0.78 },
      { kind: 'ridge', x: 282, z: 28, length: 370, width: 84, height: 10.2, yawDeg: -8, corridorScale: 0.78 },
      { kind: 'ridge', x: -64, z: 292, length: 230, width: 70, height: 7.0, yawDeg: 80 },
      { kind: 'knoll', x: 154, z: -254, rx: 86, rz: 64, height: 6.4, yawDeg: 22 },
      { kind: 'basin', x: -166, z: -218, rx: 96, rz: 70, height: -3.0, yawDeg: -16 },
    ],
  },
  spawns: {
    player: { x: -222, z: -386 },
    enemies: [
      { x: -220, z: 384 }, { x: -146, z: 418 }, { x: -70, z: 374 },
      { x: 12, z: 414 }, { x: 94, z: 370 }, { x: 176, z: 405 }, { x: 248, z: 354 },
    ],
  },
  splat: {
    grassTone: (h, s, l) => [0.575, 0.025, clamp01(0.64 + l * 0.36)],
    dirtTone: (h, s, l) => [0.075, 0.09, clamp01(l * 0.78 + 0.12)],
    rockTone: (h, s, l) => [0.59, 0.045, clamp01(l * 0.95 + 0.24)],
    mudTone: (h, s, l) => [0.55, 0.17, clamp01(0.54 + l * 0.32)],
    iceLake: true, iceDrift: 0.16, marshGloss: 1.0, mudRough: 0.18,
    iceSky: [0.72, 0.82, 0.94],
    tintA: [1.02, 1.08, 1.16], tintB: [0.74, 0.84, 0.96], tintC: [1.12, 1.14, 1.18],
    roadTint: [0.65, 0.69, 0.72], midRelief: 0.58,
  },
  vegetation: {
    species: ['pine', 'oak'], clusterMix: [['pine', 0.95], ['oak', 0.05]],
    loneMix: [['pine', 0.92], ['oak', 0.08]], rimMix: [['pine', 1]],
    clusterCount: 92, loneCount: 146, rimCount: 152, grassDensity: 0.36,
    bushCount: 0.48, bushSpecies: 'pine',
  },
  props: {
    plan: ['rangerlodge', 'logcabin', 'chapel', 'alpine', 'depot', 'onionchurch',
      'logcabin', 'woodshed', 'alpine', 'ruin', 'depot', 'granary', 'alpine', 'tower',
      'logcabin', 'alpine', 'woodshed', 'chapel', 'depot', 'logcabin', 'alpine', 'ruin',
      'granary', 'logcabin', 'alpine', 'woodshed'],
    destructibleBuildings: ['alpinerefuge', 'saunahut', 'huntingblind', 'fieldhospital'],
    tacticalBeats: [
      { id: 'western-pass-redoubt', role: 'brawl', x: -290, z: 84, yawDeg: 8,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 8, radius: 12 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'lake-overlook', role: 'scout', x: -162, z: -192, yawDeg: -16,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-rescue-station', role: 'support', x: 266, z: 118, yawDeg: -10,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 15 },
    ],
    extraKits: ['winterLake'], snowCap: true, wallStyle: 'fieldstone', wallStoneChance: 0.82,
    wallRuns: [
      [-310, -132, -220, -96, 2], [-298, 132, -210, 168, 3],
      [210, -140, 304, -104, 3], [204, 132, 300, 168, 2],
      [-156, 244, -56, 274, 3], [72, -278, 166, -244, 2],
    ],
    buildingLat: [11, 6], sideSkip: 0.12, maxSpread: 3.2,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 275, outcrops: 54, craters: 66, rubblePiles: 20,
    sandbagLines: 20, hedgehogs: 18,
    tankWrecks: { era: 'modern', count: 6, debris: true },
    inhabit: {
      stalls: 2, benches: 3, coreClutter: 20, sleds: 14, firewood: 10,
      trucks: 5, jeeps: 4, drumClusters: 4, camps: 3, modernClutter: 18,
      roadFence: 'fencerail', yardFence: 'fencepicket',
    },
  },
  horizon: {
    baseHex: 0x708397, amp: 1.42, style: 'alpine', treeline: 0.64, snowline: 0.42,
    forestHex: 0x29434a, rockHex: 0x88929d, haze: 0.91, grain: 0.52,
  },
  sky: {
    sunElevationDeg: 16, sunAzimuthDeg: 132, turbidity: 4.2, rayleigh: 2.0,
    mieCoefficient: 0.0052, mieDirectionalG: 0.78, fogDensity: 0.00076,
    fogTintHex: 0x9eb1c3, fogMix: 0.64, envIntensity: 0.31,
    cloudOpacity: 1.12, cloudOpacity2: 0.82, cloudTintHex: 0xe8eef3,
    sunIntensity: 2.85, sunColorHex: 0xffddbe, hemiIntensity: 0.54, postExposure: 0.95,
  },
  minimap: {
    base: [154, 169, 183], hard: [132, 144, 154], soft: [105, 127, 143],
    forest: 'rgba(37,67,71,.86)', forestStroke: 'rgba(22,42,46,.94)',
    water: 'rgba(94,139,166,.84)', waterStroke: 'rgba(53,88,113,.95)',
    roadCasing: 'rgba(63,69,75,.94)', roadFill: 'rgba(187,194,199,.96)', buildingFill: '#d5d9dc',
  },
  shot: { pos: [-238, 54, -252], look: [62, -3, 54] },
};
