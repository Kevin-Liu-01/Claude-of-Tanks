// badlands.js — large red-rock tablelands surrounding a modern logistics
// town; long fire lanes are broken by dry washes, compounds and escarpments.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'badlands',
  name: 'Redrock Divide',
  blurb: 'Layered red escarpments frame a fortified desert logistics outpost',
  terrain: {
    // The skyline carries the massive mesa identity; playable shelves stay
    // traversable so bots and players do not spend whole matches partitioned
    // by random 40 m walls.
    hillScale: 0.68, microScale: 0.74, rimH: 38,
    dunes: { amp: 3.0 }, mesas: { amp: 24, thr0: 0.74, thr1: 0.80 }, marshes: [],
    roads: { paths: [
      [[-432, -452], [-360, -292], [-330, -92], [-356, 112], [-292, 306], [-210, 470]],
      [[-188, -466], [-104, -306], [-28, -150], [54, 8], [126, 174], [204, 344], [286, 466]],
      [[344, -452], [302, -272], [326, -82], [286, 112], [320, 298], [382, 456]],
      [[-362, 182], [-210, 128], [-52, 102], [108, 126], [272, 194]],
      [[-286, -214], [-132, -232], [18, -202], [166, -244], [304, -198]],
    ] },
    village: { x0: -176, x1: 190, z0: -166, z1: 196, cx: 8, cz: 22, feather: 48, flatten: 0.76, relief: 0.16 },
    landforms: [
      { kind: 'ridge', x: -272, z: 18, length: 330, width: 78, height: 8.4, yawDeg: 4 },
      { kind: 'ridge', x: 276, z: 26, length: 320, width: 80, height: 8.2, yawDeg: -7 },
      { kind: 'ridge', x: -42, z: 280, length: 250, width: 70, height: 6.8, yawDeg: 82 },
      { kind: 'knoll', x: 132, z: -244, rx: 88, rz: 58, height: 6.6, yawDeg: 20 },
      { kind: 'basin', x: -126, z: -218, rx: 104, rz: 66, height: -3.0, yawDeg: -21 },
    ],
  },
  spawns: {
    player: { x: -318, z: -380 },
    enemies: [
      { x: -214, z: 382 }, { x: -140, z: 420 }, { x: -62, z: 372 },
      { x: 18, z: 414 }, { x: 100, z: 370 }, { x: 182, z: 406 }, { x: 260, z: 360 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.075, 0.39, clamp01(0.19 + l * 0.78)],
    dirtTone: (h: number, s: number, l: number) => [0.055, 0.43, clamp01(0.24 + l * 0.48)],
    sandstone: true, rockTone: (h: number, s: number, l: number) => [0.045, clamp01(s * 0.62), clamp01(0.47 + (l - 0.5) * 0.72)],
    tintA: [1.10, 0.88, 0.69], tintB: [0.71, 0.54, 0.45], tintC: [1.06, 0.84, 0.67],
    roadTint: [0.78, 0.61, 0.51], strata: 0.14, sandMacro: 0.9,
    rippleAmp: 0.28, midRelief: 0.65, midReliefFar: 780,
  },
  vegetation: {
    species: ['acacia', 'cedar', 'oak', 'palm'], clusterMix: [['acacia', 0.48], ['oak', 0.30], ['cedar', 0.17], ['palm', 0.05]],
    loneMix: [['acacia', 0.54], ['oak', 0.28], ['cedar', 0.14], ['palm', 0.04]], rimMix: [['cedar', 0.45], ['acacia', 0.35], ['oak', 0.20]],
    clusterCount: 24, loneCount: 46, rimCount: 30, grassDensity: 0.38,
    clusterScrub: 1.5, bushCount: 0.74, bushSpecies: 'oak',
  },
  props: {
    plan: ['caravanserai', 'depot', 'warehouse', 'compoundSouk', 'factory', 'minaret',
      'adobe', 'ruin', 'containerRow', 'marketRow', 'watertower', 'depot', 'gantry', 'compound',
      'warehouse', 'adobe', 'compoundSouk', 'depot', 'containerRow', 'ruin', 'factory', 'marketRow',
      'compound', 'watertower', 'warehouse', 'gantry'],
    destructibleBuildings: ['deserttent', 'motorpool', 'quonsethut', 'checkpointhut'],
    tacticalBeats: [
      { id: 'northwest-mesa-notch', role: 'brawl', x: -282, z: 112, yawDeg: 4,
        structure: 'motorpool', redoubt: true, outcrop: { count: 8, radius: 12, scaleMax: 3.5 }, wreck: true, wreckOffsetX: -16 },
      { id: 'wash-recon-camp', role: 'scout', x: 42, z: -206, yawDeg: 24,
        structure: 'deserttent', outcrop: { count: 5, radius: 9, scaleMax: 2.8 } },
      { id: 'eastern-pipeline-stop', role: 'support', x: 292, z: 98, yawDeg: -8,
        structure: 'checkpointhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: 15 },
    ],
    blockFill: true,
    wallStyle: 'adobe', wallStoneChance: 0.12, buildingLat: [11, 6], sideSkip: 0.1,
    wallRuns: [
      [-302, -142, -212, -104, 2], [-294, 128, -204, 162, 3],
      [202, -144, 298, -106, 3], [198, 132, 294, 166, 2],
      [-142, 250, -44, 278, 3], [70, -270, 164, -238, 2],
    ],
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
    sunElevationDeg: 30, sunAzimuthDeg: 116, turbidity: 7.2, rayleigh: 1.05,
    mieCoefficient: 0.0095, mieDirectionalG: 0.86, fogDensity: 0.00058,
    fogTintHex: 0xb18b77, fogMix: 0.56, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25, postExposure: 0.92,
  },
  minimap: {
    base: [137, 81, 59], hard: [124, 91, 72], soft: [105, 69, 54],
    forest: 'rgba(83,64,39,.62)', forestStroke: 'rgba(58,40,28,.8)',
    water: 'rgba(70,74,72,.5)', waterStroke: 'rgba(45,48,47,.7)',
    roadCasing: 'rgba(67,42,32,.94)', roadFill: 'rgba(190,137,104,.96)', buildingFill: '#d6b294',
  },
  shot: { pos: [-236, 48, -226], look: [38, 5, 54] },
} satisfies import('./contracts.ts').MapCompositionConfig;
