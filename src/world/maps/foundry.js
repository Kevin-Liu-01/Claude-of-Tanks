// foundry.js — dense heavy-industrial battlefield with a rail fan, factory
// blocks, container yards, workers' streets and layered hard cover.

export default {
  id: 'foundry',
  name: 'Ironworks',
  sub: 'Factories · Rail Fan · Workers’ Quarter',
  blurb: 'A sprawling foundry district of rail sidings, brick works and container yards',
  terrain: {
    hillScale: 0.62, microScale: 0.66, rimH: 26,
    roads: {
      grid: { xs: [-258, 0, 258], zs: [-260, 0, 262], jitter: 1.4 },
      paths: [
        [[-438, -330], [-284, -244], [-120, -126], [48, -12], [220, 112], [404, 226]],
        [[-398, 286], [-248, 206], [-94, 118], [72, 26], [232, -86], [398, -228]],
        [[-318, -170], [-190, -210], [-42, -196], [104, -158], [248, -194], [340, -278]],
      ],
    },
    marshes: [],
    village: { x0: -286, x1: 286, z0: -288, z1: 288, cx: 0, cz: 0, feather: 38, flatten: 0.9, relief: 0.1 },
    landforms: [
      { kind: 'ridge', x: -302, z: 8, length: 360, width: 78, height: 8.4, yawDeg: 3, settlementScale: 0.86 },
      { kind: 'ridge', x: 304, z: 22, length: 350, width: 78, height: 8.0, yawDeg: -3, settlementScale: 0.86 },
      { kind: 'ridge', x: -18, z: 304, length: 280, width: 70, height: 7.4, yawDeg: 86, settlementScale: 0.86 },
      { kind: 'ridge', x: -88, z: -54, length: 244, width: 58, height: 7.8, yawDeg: 38, corridorScale: 0.82, settlementScale: 0.88 },
      { kind: 'ridge', x: 142, z: 112, length: 216, width: 56, height: 7.2, yawDeg: -42, corridorScale: 0.82, settlementScale: 0.88 },
      { kind: 'knoll', x: 178, z: -268, rx: 84, rz: 64, height: 8.2, yawDeg: 22, settlementScale: 0.86 },
      { kind: 'basin', x: -168, z: -246, rx: 92, rz: 64, height: -2.4, yawDeg: -18, settlementScale: 0.8 },
    ],
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
    tacticalBeats: [
      { id: 'western-rail-fan', role: 'brawl', x: -274, z: 86, yawDeg: 4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'slag-heap-observer', role: 'scout', x: 52, z: -214, yawDeg: 34,
        structure: 'checkpointhut', outcrop: { count: 5, radius: 9, scaleMax: 3.0 } },
      { id: 'eastern-power-yard', role: 'support', x: 274, z: 118, yawDeg: -8,
        structure: 'transformershed', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 15 },
    ],
    extraKits: ['rail'], wallStyle: 'fieldstone', wallStoneChance: 0.76,
    wallRuns: [
      [-322, -156, -230, -124, 2], [-316, 146, -220, 176, 3],
      [218, -156, 318, -124, 3], [216, 146, 316, 178, 2],
      [-154, 278, -48, 306, 3], [74, -308, 176, -280, 2],
      [-286, 42, -222, 78, 2], [224, 52, 286, 86, 2],
    ],
    // The authored network mixes worker streets with unpaved freight/rail
    // approaches; a curb on every route outlined the map in orange ribbons.
    blockFill: true, curbs: false, lampposts: true, monument: true, townCraters: true,
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
    sunElevationDeg: 25, sunAzimuthDeg: 128, turbidity: 7.8, rayleigh: 1.35,
    mieCoefficient: 0.012, mieDirectionalG: 0.88, fogDensity: 0.00074,
    fogTintHex: 0x788286, fogMix: 0.64, envIntensity: 0.22,
    cloudOpacity: 1.24, cloudOpacity2: 1.05, cloudTintHex: 0xc8ccca,
    // shadow-audit r2: the 24° key was too weak after haze/ACES on the
    // mobile-low path (3.95 changed-pixel luma against the 4.0 contract), so
    // factory and trunk shadows read as flat discoloration. Keep the authored
    // warm overcast fill, but give the directional sun enough separation to
    // hold across every shadow-map tier.
    sunIntensity: 3.8, sunColorHex: 0xffd6ad, hemiIntensity: 0.48, postExposure: 0.96,
  },
  minimap: {
    base: [73, 75, 73], hard: [91, 91, 88], soft: [64, 67, 65],
    forest: 'rgba(48,60,48,.7)', forestStroke: 'rgba(30,38,30,.88)',
    water: 'rgba(55,75,79,.55)', waterStroke: 'rgba(34,48,52,.78)',
    roadCasing: 'rgba(31,31,30,.97)', roadFill: 'rgba(129,129,124,.96)', buildingFill: '#bfc0bd',
  },
  shot: { pos: [-244, 48, -248], look: [54, 3, 72] },
};
