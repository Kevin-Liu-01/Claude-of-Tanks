// caldera.js — volcanic mining basin: black lava shelves, sulphur grass,
// extraction works, ash haze and a ruined settlement around the central road.

const clamp01 = (x) => Math.max(0, Math.min(1, x));

export default {
  id: 'caldera',
  name: 'Obsidian Caldera',
  sub: 'Lava Shelves · Mines · Ash Town',
  blurb: 'Black volcanic shelves and abandoned extraction works ring an ash-choked basin',
  terrain: {
    // Dark splat/ash dressing supplies the volcanic character while lower,
    // rarer shelves preserve cross-caldera contact and match pacing.
    hillScale: 0.88, microScale: 1.02, rimH: 56,
    mesas: { amp: 16, thr0: 0.75, thr1: 0.81 },
    marshes: [
      { x: -246, z: 242, r: 36, dip: 1.4 }, { x: 286, z: -220, r: 34, dip: 1.2 },
    ],
    roads: { grid: { xs: [-224, -64, 98, 250], zs: [-240, -70, 102, 252], jitter: 7.0 } },
    village: { x0: -178, x1: 188, z0: -174, z1: 190, cx: 4, cz: 14, feather: 44, flatten: 0.72, relief: 0.24 },
  },
  spawns: {
    player: { x: -302, z: -380 },
    enemies: [
      { x: -212, z: 382 }, { x: -138, z: 418 }, { x: -60, z: 370 },
      { x: 20, z: 414 }, { x: 102, z: 368 }, { x: 184, z: 405 }, { x: 260, z: 358 },
    ],
  },
  splat: {
    grassTone: (h, s, l) => [0.14, clamp01(s * 0.55), clamp01(l * 0.48 + 0.08)],
    dirtTone: (h, s, l) => [0.06, clamp01(s * 0.38), clamp01(l * 0.44 + 0.055)],
    rockTone: (h, s, l) => [0.02, clamp01(s * 0.25), clamp01(l * 0.36 + 0.045)],
    tintA: [0.72, 0.67, 0.55], tintB: [0.42, 0.39, 0.36], tintC: [0.83, 0.76, 0.56],
    roadTint: [0.49, 0.46, 0.43], strata: 0.05, midRelief: 1.15,
  },
  vegetation: {
    species: ['pine', 'oak'], clusterMix: [['pine', 0.72], ['oak', 0.28]],
    loneMix: [['pine', 0.65], ['oak', 0.35]], rimMix: [['pine', 0.82], ['oak', 0.18]],
    clusterCount: 42, loneCount: 72, rimCount: 64, grassDensity: 0.48,
    bushCount: 0.62, bushSpecies: 'pine',
  },
  props: {
    plan: ['factory', 'warehouse', 'stack', 'depot', 'gantry', 'ruin',
      'watertower', 'containerRow', 'factory', 'ruin', 'shed', 'warehouse', 'stack', 'depot',
      'containerRow', 'factory', 'warehouse', 'gantry', 'shed', 'stack', 'ruin', 'depot',
      'watertower', 'containerRow', 'factory', 'warehouse', 'shed', 'gantry', 'ruin', 'stack'],
    blockFill: true,
    extraKits: ['rail'], wallStyle: 'fieldstone', wallStoneChance: 0.72,
    buildingLat: [12, 7], sideSkip: 0.08, maxSpread: 3.4,
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: true,
    rocks: 310, outcrops: 76, craters: 92, rubblePiles: 36,
    sandbagLines: 22, hedgehogs: 26,
    tankWrecks: { era: 'modern', count: 7, debris: true },
    inhabit: {
      stalls: 0, benches: 1, coreClutter: 30, drums: 16,
      trucks: 8, jeeps: 5, drumClusters: 9, camps: 3, modernClutter: 34,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    baseHex: 0x393a37, amp: 1.52, style: 'mesa', treeline: 0.28,
    forestHex: 0x292d27, rockHex: 0x4a4743, haze: 0.94, grain: 0.48,
  },
  sky: {
    sunElevationDeg: 20, sunAzimuthDeg: 116, turbidity: 10.5, rayleigh: 1.15,
    mieCoefficient: 0.022, mieDirectionalG: 0.91, fogDensity: 0.00134,
    fogTintHex: 0x897b6e, fogMix: 0.77, envIntensity: 0.18,
    cloudOpacity: 1.28, cloudOpacity2: 1.04, cloudTintHex: 0xc4b7aa,
    sunIntensity: 3.15, sunColorHex: 0xffb985, hemiIntensity: 0.46,
  },
  minimap: {
    base: [60, 57, 50], hard: [77, 73, 67], soft: [57, 54, 49],
    forest: 'rgba(35,43,31,.75)', forestStroke: 'rgba(22,27,20,.9)',
    water: 'rgba(75,74,68,.55)', waterStroke: 'rgba(45,44,41,.78)',
    roadCasing: 'rgba(30,29,27,.96)', roadFill: 'rgba(112,104,94,.94)', buildingFill: '#aaa7a1',
  },
  shot: { pos: [-238, 50, -230], look: [42, 6, 66] },
};
