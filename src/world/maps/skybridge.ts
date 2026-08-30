// skybridge.js — a fortified canyon crossing above a drowned gorge. Giant
// rock shoulders define three vertical lanes while a ruined arcology bridge
// and industrial control district anchor the center.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'skybridge',
  name: 'Skybridge Chasm',
  blurb: 'A broken high crossing and fortress-scale control works span a deep flooded canyon',
  terrain: {
    hillScale: 0.80, microScale: 0.82, rimH: 58, softLakes: true,
    mesas: { amp: 18, thr0: 0.76, thr1: 0.82, wallWidth: 0.64, corridorFloor: 0.34 },
    marshes: [],
    lakes: [
      { x: -34, z: 62, r: 92, depth: 2.2 },
      { x: 36, z: 146, r: 88, depth: 2.2 },
    ],
    village: { x0: -176, x1: 186, z0: -170, z1: 196, cx: 8, cz: 16, feather: 54, flatten: 0.72, relief: 0.28 },
    roads: { paths: [
      [[-430, -450], [-350, -314], [-278, -172], [-208, -30], [-132, 118], [-58, 268], [24, 454]],
      [[-116, -458], [-72, -318], [-18, -178], [42, -42], [116, 92], [198, 230], [292, 354], [380, 456]],
      [[356, -454], [294, -310], [236, -166], [170, -22], [92, 116], [16, 252], [-78, 376], [-164, 466]],
      [[-382, -126], [-246, -92], [-116, -118], [18, -80], [148, -112], [282, -82], [394, -104]],
      [[-326, 252], [-204, 210], [-82, 238], [42, 204], [168, 238], [292, 208]],
    ] },
    landforms: [
      { kind: 'ridge', x: -286, z: 24, length: 770, width: 126, height: 18.8, yawDeg: -3, corridorScale: 0.40 },
      { kind: 'ridge', x: 294, z: 18, length: 770, width: 128, height: 19.2, yawDeg: 4, corridorScale: 0.40 },
      { kind: 'ridge', x: -10, z: 318, length: 360, width: 100, height: 12.5, yawDeg: 86, corridorScale: 0.44 },
      { kind: 'knoll', x: -132, z: -246, rx: 118, rz: 76, height: 8.8, yawDeg: 20, corridorScale: 0.46 },
      { kind: 'basin', x: 10, z: 84, rx: 170, rz: 144, height: -7.8, yawDeg: -8, corridorScale: 0.72 },
      { kind: 'knoll', x: 174, z: -230, rx: 104, rz: 68, height: 8.0, yawDeg: -20, corridorScale: 0.46 },
    ],
  },
  spawns: {
    player: { x: -332, z: -396 },
    enemies: [
      { x: -242, z: 392 }, { x: -164, z: 428 }, { x: -84, z: 384 },
      { x: -2, z: 424 }, { x: 82, z: 382 }, { x: 166, z: 418 }, { x: 252, z: 376 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.40), clamp01(l * 0.52)],
    dirtTone: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.42), clamp01(l * 0.48 + 0.04)],
    sandstone: true,
    rockTone: (h: number, s: number, l: number) => [0.045, clamp01(s * 0.56), clamp01(0.40 + (l - 0.5) * 0.72)],
    mudTone: (h: number, s: number, l: number) => [0.54, clamp01(s * 0.72), clamp01(l * 0.58)],
    // The drowned gorge is navigable liquid, not a blue-grey terrain stain.
    // It shares the terrain material and interaction mask, so this adds no
    // water mesh or draw pass while tracks receive the common wake/spray path.
    seaLake: true, seaFoam: 0.10, seaRamp: [0.18, 0.54], iceDrift: 0.02,
    marshGloss: 0.90, iceSky: [0.18, 0.30, 0.38],
    tintA: [1.02, 0.67, 0.49], tintB: [0.61, 0.40, 0.34], tintC: [1.00, 0.69, 0.49],
    roadTint: [0.61, 0.53, 0.47], strata: 0.18, sandMacro: 0.62,
    rippleAmp: 0.14, midRelief: 1.0, midReliefFar: 840,
  },
  vegetation: {
    species: ['pine', 'poplar', 'cedar'], clusterMix: [['poplar', 0.40], ['pine', 0.35], ['cedar', 0.25]],
    loneMix: [['poplar', 0.44], ['pine', 0.31], ['cedar', 0.25]], rimMix: [['pine', 0.40], ['cedar', 0.34], ['poplar', 0.26]],
    clusterCount: 24, loneCount: 42, rimCount: 34, grassDensity: 0.30,
    clusterScrub: 1.4, bushCount: 0.52, bushSpecies: 'poplar',
  },
  props: {
    plan: [
      'arcology', 'factory', 'gantry', 'parkingdeck', 'ruin', 'foundryoffice',
      'warehouse', 'needletower', 'containerRow', 'depot', 'ruin', 'civichall',
      'broadcasttower', 'watertower', 'factory', 'parkingdeck', 'gantry', 'ruin',
      'foundryoffice', 'warehouse', 'terracetower', 'depot', 'containerRow', 'ruin',
      'civichall', 'factory', 'parkingdeck', 'megatower', 'gantry', 'ruin',
    ],
    destructibleBuildings: [
      'motorpool', 'quonsethut', 'transformershed', 'guardpost',
      'securityoffice', 'servicegarage', 'relaystation',
    ],
    tacticalBeats: [
      { id: 'western-abutment', role: 'brawl', x: -266, z: 94, yawDeg: -4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 13, scaleMax: 4.0 }, wreck: true, wreckOffsetZ: -18 },
      { id: 'spillway-scout-post', role: 'scout', x: 24, z: -226, yawDeg: 18,
        structure: 'guardpost', outcrop: { count: 5, radius: 9, scaleMax: 2.9 } },
      { id: 'eastern-control-yard', role: 'support', x: 276, z: 116, yawDeg: 5,
        structure: 'transformershed', redoubt: true, outcrop: { count: 7, radius: 11, scaleMax: 3.5 }, wreck: true, wreckOffsetX: 18 },
    ],
    blockFill: true, extraKits: ['rail'], wallStyle: 'fieldstone', wallStoneChance: 0.82,
    buildingLat: [13, 7], sideSkip: 0.07, spacingPad: 3.5, maxSpread: 4.2,
    wallRuns: [
      [-312, -148, -214, -112, 2], [-306, 138, -208, 174, 3],
      [208, -146, 308, -110, 3], [206, 140, 306, 176, 2],
      [-150, 258, -46, 290, 3], [64, -286, 168, -252, 2],
      [-338, 44, -294, 98, 1], [300, -82, 344, -26, 4],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: true,
    rocks: 286, outcrops: 78, craters: 88, rubblePiles: 58,
    hedgehogs: 30, sandbagLines: 28,
    tankWrecks: { era: 'modern', count: 8, debris: true },
    inhabit: {
      stalls: 0, benches: 2, coreClutter: 32, drums: 18,
      trucks: 10, jeeps: 7, drumClusters: 10, camps: 4, modernClutter: 36,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    baseHex: 0x59433a, amp: 2.0, style: 'mesa', treeline: 0.10,
    forestHex: 0x3c4237, rockHex: 0x80604d, haze: 0.88, grain: 0.62,
  },
  sky: {
    sunElevationDeg: 25, sunAzimuthDeg: 120, turbidity: 7.4, rayleigh: 1.22,
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00056,
    fogTintHex: 0xa08475, fogMix: 0.55, envIntensity: 0.18,
    cloudOpacity: 1.04, cloudOpacity2: 0.78, cloudTintHex: 0xdac8bb,
    sunIntensity: 3.85, sunColorHex: 0xffc19a, hemiIntensity: 0.31, postExposure: 0.93,
  },
  minimap: {
    base: [102, 77, 63], hard: [113, 91, 76], soft: [80, 65, 56],
    forest: 'rgba(55,66,48,.66)', forestStroke: 'rgba(35,43,31,.82)',
    water: 'rgba(47,76,91,.84)', waterStroke: 'rgba(28,49,61,.92)',
    roadCasing: 'rgba(47,37,33,.96)', roadFill: 'rgba(153,127,108,.95)', buildingFill: '#beb2a4',
  },
  shot: { pos: [-280, 60, -236], look: [22, 4, 92] },
} satisfies import('./contracts.ts').MapCompositionConfig;
