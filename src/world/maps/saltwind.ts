// Limestone shore with a hooked bay on the west. The harbor road hugs the
// coast while inland hairpins climb behind the fishing village.
import coastal from './coastal.ts';
export default {
  id: 'saltwind', name: 'Saltwind Narrows',
  blurb: 'A limestone fishing coast bends around a sheltered bay below dry scrub terraces',
  terrain: {
    hillScale: 0.86, microScale: 0.70, rimH: 28, clearMarshVeg: true, softLakes: true,
    village: { x0: -252, x1: -18, z0: -116, z1: 138, cx: -136, cz: 10, feather: 44, flatten: 0.86, relief: 0.14 },
    roads: { paths: [
      // Quayside frontages bend with the bay; the inland market stair-road
      // meets them on the dry limestone shoulder, clear of the harbor mouth.
      [[-300, -460], [-252, -282], [-210, -100], [-190, -36], [-180, 44], [-190, 108], [-224, 206], [-294, 462]],
      [[-84, -464], [-20, -292], [44, -126], [-2, 32], [74, 200], [66, 332], [138, 464]],
      [[340, -460], [272, -304], [308, -144], [228, 14], [292, 180], [266, 330], [320, 462]],
      [[-210, -100], [-124, -100], [-108, -36], [-190, -36], [-108, 44], [-20, -92], [228, 14]],
      [[-224, 206], [-6, 242], [126, 218], [266, 330]],
    ] },
    // A connected bay shares one level; independent automatic lake levels
    // would create several-metre steps at the overlaps.
    lakes: [{ x: -434, z: -160, r: 126, depth: 1.1, level: -7.8 }, { x: -410, z: 12, r: 138, depth: 1.1, level: -7.8 }, { x: -424, z: 184, r: 122, depth: 1.1, level: -7.8 }],
    marshes: [{ x: -286, z: 4, r: 27, dip: 0.6 }],
    landforms: [
      { kind: 'ridge', x: -166, z: 22, length: 348, width: 60, height: 5.8, yawDeg: 2 },
      { kind: 'ridge', x: 182, z: 18, length: 440, width: 86, height: 9.0, yawDeg: -8 },
      { kind: 'knoll', x: 328, z: -248, rx: 74, rz: 94, height: 7.0 },
      { kind: 'ridge', x: 62, z: 272, length: 210, width: 66, height: 6.4, yawDeg: 82 },
      { kind: 'basin', x: -344, z: 12, rx: 114, rz: 280, height: -3.6, wetScale: 0.2 },
      { kind: 'knoll', x: -122, z: -264, rx: 78, rz: 64, height: 5.2 },
    ],
  },
  spawns: { player: { x: -94, z: -390 }, enemies: [
    { x: -244, z: 384 }, { x: -162, z: 424 }, { x: -78, z: 380 }, { x: 6, z: 424 },
    { x: 90, z: 382 }, { x: 174, z: 424 }, { x: 258, z: 388 },
  ] },
  splat: { sourcedPalette: 'coastal', ...coastal.splat, seaLake: true, seaFoam: 0.2, seaRamp: [0.16, 0.54], iceDrift: 0.02, marshGloss: 0.90, iceSky: [0.23, 0.44, 0.58], tintA: [1.08, 1.04, 0.82], tintB: [0.73, 0.78, 0.62], tintC: [1.14, 1.08, 0.88], roadTint: [0.82, 0.76, 0.63], midRelief: 0.68 },
  vegetation: {
    species: ['cedar', 'acacia', 'pine'], clusterMix: [['cedar', 0.46], ['acacia', 0.38], ['pine', 0.16]],
    loneMix: [['acacia', 0.50], ['cedar', 0.32], ['pine', 0.18]], rimMix: [['cedar', 0.5], ['pine', 0.3], ['acacia', 0.2]],
    clusterCount: 34, loneCount: 52, rimCount: 62, grassDensity: 0.68, bushCount: 0.86, bushSpecies: 'acacia', clusterScrub: 1.5,
  },
  props: {
    sourcedPalette: 'coastal',
    plan: ['fishery', 'boatshed', 'marketRow', 'farmhouse', 'bathhouse', 'cottage', 'depot', 'tavern', 'boatshed', 'ruin', 'cornershop', 'market', 'farmhouse', 'woodshed', 'fishery', 'cottage', 'granary', 'ruin'],
    destructibleBuildings: ['fishershack', 'fieldhut', 'guardpost', 'checkpointhut'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.16, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'harbor-cooperative', role: 'brawl', x: -220, z: 92, yawDeg: 90, structure: 'fishershack', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'inland-limestone-watch', role: 'scout', x: 280, z: 54, yawDeg: -90, structure: 'guardpost', outcrop: { count: 5, radius: 10 } },
      { id: 'northern-toll-farm', role: 'support', x: 32, z: 278, yawDeg: 180, structure: 'checkpointhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.82,
    wallRuns: [[-244, -80, -232, -16, 2], [-244, 56, -244, 120, 3], [-150, -72, -80, -72, 2], [-142, 78, -72, 78, 3], [2, 306, 78, 306, 2], [310, 14, 310, 86, 3]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 188, outcrops: 30, craters: 48, rubblePiles: 12, cropFields: 4, sandbagLines: 14, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, pots: 8, laundry: 4, handcarts: 4, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 2, modernClutter: 18, looseClutter: 18, roadFence: 'fencewattle', yardFence: 'fencepicket' },
  },
  horizon: { baseHex: 0x7f8977, amp: 0.90, style: 'rolling', treeline: 0.42, forestHex: 0x506044, rockHex: 0xa4a391, haze: 0.90, grain: 0.46 },
  sky: { ...coastal.sky, sunElevationDeg: 30, sunAzimuthDeg: 112, turbidity: 3.9, fogDensity: 0.00052, fogTintHex: 0x9cb8c5, fogMix: 0.48, cloudOpacity: 0.86, cloudOpacity2: 0.5, sunIntensity: 3.95, hemiIntensity: 0.42 },
  minimap: { ...coastal.minimap, base: [117, 123, 91], hard: [142, 137, 114], soft: [63, 88, 84] },
  shot: { pos: [-252, 58, -248], look: [-52, 0, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
