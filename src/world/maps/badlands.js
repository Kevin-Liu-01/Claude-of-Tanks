// badlands.js — large red-rock tablelands surrounding a modern logistics
// town; long fire lanes are broken by dry washes, compounds and escarpments.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  id: 'badlands',
  name: 'Redrock Divide',
  sub: 'Mesas · Dry Washes · Outpost',
  blurb: 'Layered red escarpments frame a fortified desert logistics outpost',
  terrain: {
    // The skyline carries the massive mesa identity; playable shelves stay
    // traversable so bots and players do not spend whole matches partitioned
    // by random 40 m walls.
    hillScale: 0.68, microScale: 0.74, rimH: 38,
    dunes: { amp: 3.0 }, mesas: { amp: 24, thr0: 0.74, thr1: 0.80 }, marshes: [],
    roads: { grid: { xs: [-220, -70, 82, 232], zs: [-246, -78, 94, 248], jitter: 5.2 } },
    village: { x0: -176, x1: 190, z0: -166, z1: 196, cx: 8, cz: 22, feather: 48, flatten: 0.76, relief: 0.16 },
  },
  spawns: {
    player: { x: -318, z: -380 },
    enemies: [
      { x: -214, z: 382 }, { x: -140, z: 420 }, { x: -62, z: 372 },
      { x: 18, z: 414 }, { x: 100, z: 370 }, { x: 182, z: 406 }, { x: 260, z: 360 },
    ],
  },
  splat: {
    grassTone: (h, s, l) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h, s, l) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    sandstone: true, rockTone: (h, s, l) => [0.045, clamp01(s * 0.62), clamp01(0.47 + (l - 0.5) * 0.72)],
    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],
    roadTint: [0.78, 0.61, 0.51], strata: 0.14, sandMacro: 0.9,
    rippleAmp: 0.28, midRelief: 0.65, midReliefFar: 780,
  },
  vegetation: {
    species: ['palm', 'oak'], clusterMix: [['palm', 0.2], ['oak', 0.8]],
    loneMix: [['oak', 0.92], ['palm', 0.08]], rimMix: [['oak', 1]],
    clusterCount: 24, loneCount: 46, rimCount: 30, grassDensity: 0.38,
    clusterScrub: 1.5, bushCount: 0.74, bushSpecies: 'oak',
  },
  props: {
    plan: ['compound', 'depot', 'warehouse', 'compoundSouk', 'factory', 'minaret',
      'adobe', 'ruin', 'containerRow', 'marketRow', 'watertower', 'depot', 'gantry', 'compound',
      'warehouse', 'adobe', 'compoundSouk', 'depot', 'containerRow', 'ruin', 'factory', 'marketRow',
      'compound', 'watertower', 'warehouse', 'gantry'],
    blockFill: true,
    wallStyle: 'adobe', wallStoneChance: 0.12, buildingLat: [11, 6], sideSkip: 0.1,
    well: true, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 264, outcrops: 58, craters: 74, rubblePiles: 22,
    hedgehogs: 22, sandbagLines: 24,
    tankWrecks: { era: 'modern', count: 7, debris: true },
    inhabit: {
      stalls: 4, benches: 2, coreClutter: 26, drums: 12, pots: 7,
      trucks: 7, jeeps: 5, drumClusters: 8, camps: 5, modernClutter: 28,
      roadFence: 'fencerail', yardFence: 'fencewattle',
    },
  },
  horizon: {
    baseHex: 0x7a4936, amp: 1.36, style: 'mesa', treeline: 0.06,
    forestHex: 0x58402f, rockHex: 0x96533b, haze: 0.92, grain: 0.58,
  },
  sky: {
    sunElevationDeg: 30, sunAzimuthDeg: 116, turbidity: 8.6, rayleigh: 1.05,
    mieCoefficient: 0.013, mieDirectionalG: 0.88, fogDensity: 0.00086,
    fogTintHex: 0xb88d73, fogMix: 0.68, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.65, sunColorHex: 0xffd4ad, hemiIntensity: 0.28,
  },
  minimap: {
    base: [137, 81, 59], hard: [124, 91, 72], soft: [105, 69, 54],
    forest: 'rgba(83,64,39,.62)', forestStroke: 'rgba(58,40,28,.8)',
    water: 'rgba(70,74,72,.5)', waterStroke: 'rgba(45,48,47,.7)',
    roadCasing: 'rgba(67,42,32,.94)', roadFill: 'rgba(190,137,104,.96)', buildingFill: '#d6b294',
  },
  shot: { pos: [-236, 48, -226], look: [38, 5, 54] },
};
