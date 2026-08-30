// ruinspires.js — a destroyed vertical megacity. Monumental procedural
// towers are bucket-merged by props.ts, preserving the ordinary map draw-call
// shape while the six-lane street plan creates true urban canyons.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const PLAN = [
  'megatower', 'parkingdeck', 'ruin', 'needletower', 'factory', 'broadcasttower',
  'civichall', 'parkingdeck', 'ruin', 'foundryoffice', 'terracetower', 'warehouse',
  'arcology', 'ruin', 'parkingdeck', 'factory', 'civichall', 'megatower',
  'containerRow', 'ruin', 'parkingdeck', 'broadcasttower', 'foundryoffice', 'needletower',
  'factory', 'ruin', 'civichall', 'parkingdeck', 'terracetower', 'warehouse',
  'arcology', 'ruin', 'factory', 'parkingdeck', 'megatower', 'civichall',
  'foundryoffice', 'ruin', 'needletower', 'parkingdeck', 'factory', 'broadcasttower',
  'warehouse', 'ruin', 'civichall', 'parkingdeck', 'terracetower', 'arcology',
];

export default {
  id: 'ruinspires',
  name: 'Ruinspires',
  blurb: 'A shattered high-rise capital where armored columns fight through six-lane street canyons',
  terrain: {
    hillScale: 0.46, microScale: 0.58, rimH: 32, marshes: [],
    village: { x0: -316, x1: 316, z0: -310, z1: 316, cx: 0, cz: 8, feather: 52, flatten: 0.90, relief: 0.34 },
    roads: { grid: {
      xs: [-248, -152, -56, 56, 152, 248],
      zs: [-244, -148, -52, 52, 148, 244], jitter: 1.2,
    } },
    landforms: [
      { kind: 'ridge', x: -326, z: 0, length: 620, width: 92, height: 9.5, yawDeg: 0, settlementScale: 0.72 },
      { kind: 'ridge', x: 328, z: 10, length: 610, width: 94, height: 9.0, yawDeg: 0, settlementScale: 0.72 },
      { kind: 'ridge', x: 0, z: 330, length: 540, width: 88, height: 8.0, yawDeg: 90, settlementScale: 0.70 },
      { kind: 'knoll', x: -184, z: -214, rx: 104, rz: 74, height: 5.8, yawDeg: 18, settlementScale: 0.62 },
      { kind: 'basin', x: 142, z: 116, rx: 116, rz: 92, height: -4.2, yawDeg: -24, settlementScale: 0.72 },
    ],
  },
  spawns: {
    player: { x: -88, z: -420 },
    enemies: [
      { x: -228, z: 404 }, { x: -154, z: 430 }, { x: -78, z: 398 },
      { x: 0, z: 432 }, { x: 82, z: 398 }, { x: 160, z: 428 }, { x: 236, z: 402 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.32), clamp01(l * 0.62)],
    dirtTone: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.25), clamp01(l * 0.60 + 0.04)],
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.20), clamp01(l * 0.68)],
    tintA: [0.82, 0.82, 0.78], tintB: [0.48, 0.51, 0.53], tintC: [0.90, 0.84, 0.73],
    roadTint: [0.39, 0.40, 0.41], roadTexMix: 0.92, townWear: 2.2, midRelief: 0.72,
  },
  vegetation: {
    species: ['cypress', 'poplar', 'oak'], clusterMix: [['cypress', 0.46], ['poplar', 0.34], ['oak', 0.20]],
    loneMix: [['cypress', 0.42], ['poplar', 0.38], ['oak', 0.20]], rimMix: [['cypress', 0.50], ['poplar', 0.30], ['oak', 0.20]],
    clusterCount: 10, loneCount: 24, rimCount: 54, grassDensity: 0.25,
    bushCount: 0.30, bushSpecies: 'oak',
    parks: [{ x: -194, z: 188, r: 52 }, { x: 196, z: -178, r: 48 }],
  },
  props: {
    plan: PLAN,
    destructibleBuildings: [
      'guardpost', 'transformershed', 'fieldhospital', 'quonsethut',
      'securityoffice', 'relaystation', 'corneroffice',
    ],
    tacticalBeats: [
      { id: 'ministry-steps', role: 'brawl', x: -184, z: 82, yawDeg: 90,
        structure: 'fieldhospital', redoubt: true, wreck: true, wreckOffsetX: 18 },
      { id: 'cratered-ring-road', role: 'scout', x: 32, z: -246, yawDeg: 0,
        structure: 'guardpost', outcrop: { count: 6, radius: 10, scaleMax: 2.8 } },
      { id: 'elevated-terminal', role: 'support', x: 228, z: 126, yawDeg: -90,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: -16 },
    ],
    blockFill: true, streetRows: true, streetRowsAfterLandmarks: true,
    streetRowRoadStride: 2, ruinChance: 0.48, curbs: true, lampposts: true,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.34 + 0.06), clamp01(l * 0.64)],
      plaster2: (h: number, s: number, l: number) => [0.095, clamp01(s * 0.30 + 0.05), clamp01(l * 0.58)],
      plaster3: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.22), clamp01(l * 0.55)],
      stone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.20), clamp01(l * 0.67)],
      roof: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.28), clamp01(l * 0.52)],
      wood: null, straw: null,
    },
    wallStyle: 'brick', wallStoneChance: 0.74, buildingLat: [14, 5],
    sideSkip: 0.04, spacingPad: 4.5, maxSpread: 4.2,
    wallRuns: [
      [-310, -190, -212, -190, 2], [-306, 188, -206, 188, 3],
      [208, -188, 310, -188, 3], [210, 190, 310, 190, 2],
      [-138, -286, -38, -286, 1], [42, 286, 142, 286, 4],
      [-286, -48, -286, 54, 3], [286, -58, 286, 48, 2],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 96, outcrops: 10, craters: 128, rubblePiles: 188,
    hedgehogs: 38, sandbagLines: 26, townCraters: true,
    tankWrecks: { era: 'modern', count: 9, debris: true },
    inhabit: {
      stalls: 1, benches: 8, coreClutter: 34, drums: 20,
      trucks: 10, jeeps: 8, drumClusters: 10, camps: 3, modernClutter: 44,
      roadFence: 'fenceplank', yardFence: 'fencerail',
    },
  },
  horizon: {
    baseHex: 0x434a4d, amp: 0.92, style: 'escarpment', treeline: 0.18,
    forestHex: 0x2f3937, rockHex: 0x5c5e5c, haze: 0.95, grain: 0.42,
  },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 118, turbidity: 7.0, rayleigh: 1.15,
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00068,
    fogTintHex: 0x8e979c, fogMix: 0.60, envIntensity: 0.19,
    cloudOpacity: 1.08, cloudOpacity2: 0.82, cloudTintHex: 0xd0d1ce,
    sunIntensity: 3.8, sunColorHex: 0xffd0aa, hemiIntensity: 0.34, postExposure: 0.94,
  },
  minimap: {
    base: [76, 79, 78], hard: [88, 88, 87], soft: [59, 65, 64],
    forest: 'rgba(42,55,48,.62)', forestStroke: 'rgba(25,34,30,.82)',
    water: 'rgba(70,82,86,.52)', waterStroke: 'rgba(42,50,53,.74)',
    roadCasing: 'rgba(24,26,28,.96)', roadFill: 'rgba(105,107,108,.96)', buildingFill: '#c1bab0',
  },
  shot: { pos: [-244, 30, -274], look: [36, 12, 46] },
} satisfies import('../terrain.ts').TerrainMapConfig & Record<string, unknown>;
