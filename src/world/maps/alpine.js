// alpine.js — high winter pass around a frozen lake and dense mountain
// village. Uses the shared winter-lake dressing without duplicating geometry.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  id: 'alpine',
  name: 'Glacier Pass',
  sub: 'Frozen Lake · Mountain Town · Passes',
  blurb: 'A frozen alpine lake divides a fortified mountain village and two high passes',
  terrain: {
    hillScale: 1.46, microScale: 0.72, rimH: 52, frozenMarshes: true,
    lakes: [
      { x: 58, z: -34, r: 116, depth: 1.6 },
      { x: -258, z: 224, r: 42, depth: 1.3 },
    ],
    marshes: [{ x: 280, z: -192, r: 44, dip: 1.4 }],
    village: { x0: -204, x1: 202, z0: -212, z1: 222, cx: -42, cz: 28, feather: 58, flatten: 0.69, relief: 0.3 },
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
    plan: ['alpine', 'logcabin', 'chapel', 'alpine', 'depot', 'onionchurch',
      'logcabin', 'woodshed', 'alpine', 'ruin', 'depot', 'granary', 'alpine', 'tower',
      'logcabin', 'alpine', 'woodshed', 'chapel', 'depot', 'logcabin', 'alpine', 'ruin',
      'granary', 'logcabin', 'alpine', 'woodshed'],
    extraKits: ['winterLake'], snowCap: true, wallStyle: 'fieldstone', wallStoneChance: 0.82,
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
    baseHex: 0x708397, amp: 1.78, style: 'alpine', treeline: 0.64,
    forestHex: 0x29434a, rockHex: 0x88929d, haze: 0.91, grain: 0.52,
  },
  sky: {
    sunElevationDeg: 14, sunAzimuthDeg: 132, turbidity: 3.8, rayleigh: 2.1,
    mieCoefficient: 0.006, mieDirectionalG: 0.78, fogDensity: 0.00118,
    fogTintHex: 0xa8bacb, fogMix: 0.72, envIntensity: 0.34,
    cloudOpacity: 1.12, cloudOpacity2: 0.82, cloudTintHex: 0xe8eef3,
    sunIntensity: 3.05, sunColorHex: 0xffddbe, hemiIntensity: 0.62,
  },
  minimap: {
    base: [154, 169, 183], hard: [132, 144, 154], soft: [105, 127, 143],
    forest: 'rgba(37,67,71,.86)', forestStroke: 'rgba(22,42,46,.94)',
    water: 'rgba(94,139,166,.84)', waterStroke: 'rgba(53,88,113,.95)',
    roadCasing: 'rgba(63,69,75,.94)', roadFill: 'rgba(187,194,199,.96)', buildingFill: '#d5d9dc',
  },
  shot: { pos: [-238, 54, -252], look: [62, -3, 54] },
};
