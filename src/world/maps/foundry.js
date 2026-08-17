// foundry.js — dense heavy-industrial battlefield with a rail fan, factory
// blocks, container yards, workers' streets and layered hard cover.

export default {
  id: 'foundry',
  name: 'Ironworks',
  sub: 'Factories · Rail Fan · Workers’ Quarter',
  blurb: 'A sprawling foundry district of rail sidings, brick works and container yards',
  terrain: {
    hillScale: 0.62, microScale: 0.66, rimH: 26,
    roads: { grid: { xs: [-258, -128, 0, 130, 258], zs: [-260, -130, 0, 132, 262], jitter: 1.6 } },
    marshes: [],
    village: { x0: -286, x1: 286, z0: -288, z1: 288, cx: 0, cz: 0, feather: 38, flatten: 0.9, relief: 0.1 },
  },
  spawns: {
    player: { x: -356, z: -372 },
    enemies: [
      { x: -224, z: 384 }, { x: -150, z: 420 }, { x: -72, z: 374 },
      { x: 10, z: 416 }, { x: 94, z: 372 }, { x: 178, z: 408 }, { x: 258, z: 362 },
    ],
  },
  splat: {
    tintA: [0.72, 0.73, 0.70], tintB: [0.47, 0.49, 0.48], tintC: [0.84, 0.81, 0.74],
    roadTint: [0.51, 0.51, 0.49], midRelief: 0.72,
  },
  vegetation: {
    species: ['oak', 'pine'], clusterMix: [['oak', 0.66], ['pine', 0.34]],
    loneMix: [['oak', 0.72], ['pine', 0.28]], rimMix: [['pine', 0.6], ['oak', 0.4]],
    clusterCount: 28, loneCount: 72, rimCount: 74, grassDensity: 0.44,
    bushCount: 0.5, bushSpecies: 'oak',
  },
  props: {
    plan: ['firestation', 'foundryoffice', 'containerRow', 'gantry', 'stack', 'shed',
      'watertower', 'factory', 'depot', 'warehouse', 'containerRow', 'cornershop',
      'rowhouse', 'factory', 'ruin', 'stack', 'depot', 'gantry',
      'containerRow', 'warehouse', 'shed', 'factory', 'stack', 'containerRow',
      'depot', 'gantry', 'warehouse', 'ruin', 'containerRow', 'watertower',
      'factory', 'shed', 'containerRow', 'warehouse', 'stack', 'depot',
      'gantry', 'containerRow', 'ruin', 'warehouse', 'factory', 'shed'],
    destructibleBuildings: ['quonsethut', 'transformershed', 'motorpool', 'checkpointhut'],
    extraKits: ['rail'], wallStyle: 'fieldstone', wallStoneChance: 0.76,
    blockFill: true, curbs: true, lampposts: true, monument: true, townCraters: true,
    buildingLat: [10, 4], sideSkip: 0.06, maxSpread: 2.4, spacingPad: 6,
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 142, outcrops: 12, craters: 86, rubblePiles: 48,
    hedgehogs: 36, sandbagLines: 28,
    tankWrecks: { era: 'modern', count: 8, debris: true },
    inhabit: {
      stalls: 1, benches: 5, coreClutter: 42, drums: 24,
      trucks: 10, jeeps: 6, drumClusters: 11, camps: 2, modernClutter: 46,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    baseHex: 0x555553, amp: 0.72, style: 'rolling', treeline: 0.5,
    forestHex: 0x39413a, rockHex: 0x666360, haze: 0.97, grain: 0.48,
  },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 128, turbidity: 9.4, rayleigh: 1.35,
    mieCoefficient: 0.018, mieDirectionalG: 0.9, fogDensity: 0.00124,
    fogTintHex: 0x81888a, fogMix: 0.74, envIntensity: 0.23,
    cloudOpacity: 1.24, cloudOpacity2: 1.05, cloudTintHex: 0xc8ccca,
    sunIntensity: 3.25, sunColorHex: 0xffd6ad, hemiIntensity: 0.56,
  },
  minimap: {
    base: [73, 75, 73], hard: [91, 91, 88], soft: [64, 67, 65],
    forest: 'rgba(48,60,48,.7)', forestStroke: 'rgba(30,38,30,.88)',
    water: 'rgba(55,75,79,.55)', waterStroke: 'rgba(34,48,52,.78)',
    roadCasing: 'rgba(31,31,30,.97)', roadFill: 'rgba(129,129,124,.96)', buildingFill: '#bfc0bd',
  },
  shot: { pos: [-244, 48, -248], look: [54, 3, 72] },
};
