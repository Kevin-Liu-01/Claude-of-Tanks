// delta.js — humid river delta with a fordable braided channel, dense palms,
// market compounds, fishing sheds and soft-ground flanking lanes.

const river = [
  [-332, -320, 31], [-274, -256, 30], [-224, -188, 33], [-168, -118, 34],
  [-106, -52, 35], [-36, 12, 38], [34, 76, 37], [102, 142, 35],
  [174, 214, 33], [250, 282, 32], [324, 348, 30],
].map(([x, z, r]) => ({ x, z, r, dip: 1.15 }));

export default {
  id: 'delta',
  name: 'Jade River Delta',
  blurb: 'Braided watercourses divide flooded fields, village compounds and palm thickets',
  terrain: {
    hillScale: 0.64, microScale: 0.82, rimH: 22, clearMarshVeg: true,
    roads: { paths: [
      [[-438, -404], [-360, -236], [-270, -72], [-184, 98], [-96, 274], [-20, 466]],
      [[-244, -466], [-164, -300], [-68, -128], [58, 42], [188, 212], [348, 406]],
      [[-456, -342], [-422, -142], [-396, 72], [-340, 278], [-270, 452]],
      [[338, -444], [306, -236], [330, -32], [382, 178], [432, 370]],
      [[-286, 52], [-144, 34], [8, 54], [162, 38], [302, 8]],
    ] },
    marshes: river,
    village: { x0: -126, x1: 158, z0: -92, z1: 180, cx: 18, cz: 42, feather: 52, flatten: 0.88, relief: 0.08 },
    landforms: [
      { kind: 'ridge', x: -214, z: -108, length: 310, width: 48, height: 3.8, yawDeg: -43, wetScale: 0.82 },
      { kind: 'ridge', x: 116, z: 158, length: 330, width: 50, height: 4.0, yawDeg: -44, wetScale: 0.82 },
      { kind: 'ridge', x: -246, z: 176, length: 190, width: 62, height: 4.6, yawDeg: 28 },
      { kind: 'ridge', x: -46, z: 42, length: 214, width: 42, height: 5.2, yawDeg: 37, wetScale: 0.88, settlementScale: 0.68 },
      { kind: 'ridge', x: 214, z: -26, length: 186, width: 46, height: 4.8, yawDeg: -24, wetScale: 0.86 },
      { kind: 'knoll', x: 250, z: -194, rx: 88, rz: 64, height: 4.8, yawDeg: -18 },
      { kind: 'basin', x: -12, z: -224, rx: 112, rz: 72, height: -2.1, yawDeg: 12, wetScale: 0.9 },
    ],
  },
  spawns: {
    player: { x: -332, z: -382 },
    enemies: [
      { x: -156, z: 392 }, { x: -82, z: 420 }, { x: -10, z: 374 },
      { x: 70, z: 414 }, { x: 148, z: 374 }, { x: 222, z: 405 }, { x: 294, z: 364 },
    ],
  },
  splat: {
    mudTone: (h, s, l) => [0.51, Math.min(1, s * 0.92), Math.min(1, l * 0.70)],
    seaLake: true, seaFoam: 0.08, seaRamp: [0.08, 0.42], iceDrift: 0.03,
    marshGloss: 0.86, iceSky: [0.38, 0.53, 0.52],
    fieldPatch: 1, tintA: [0.78, 1.02, 0.68], tintB: [0.52, 0.72, 0.48],
    tintC: [0.94, 1.08, 0.76], roadTint: [0.72, 0.67, 0.53], midRelief: 0.72,
  },
  vegetation: {
    species: ['palm', 'oak'], clusterMix: [['palm', 0.55], ['oak', 0.45]],
    loneMix: [['palm', 0.6], ['oak', 0.4]], rimMix: [['palm', 0.42], ['oak', 0.58]],
    clusterCount: 96, loneCount: 214, rimCount: 112, grassDensity: 1.22,
    clusterScrub: 2.2, bushCount: 1.45, bushSpecies: 'oak',
  },
  props: {
    plan: ['marketRow', 'farmhouse', 'fishery', 'market', 'chapel', 'granary',
      'compound', 'cornershop', 'ruin', 'boatshed', 'farmhouse', 'depot', 'marketRow', 'woodshed',
      'boatshed', 'market', 'compound', 'farmhouse', 'granary', 'marketRow', 'depot', 'ruin',
      'boatshed', 'cornershop', 'farmhouse', 'woodshed'],
    destructibleBuildings: ['stilthouse', 'longhouse', 'fishershack', 'fieldhospital'],
    tacticalBeats: [
      { id: 'western-levee-fort', role: 'brawl', x: -286, z: -72, yawDeg: -34,
        structure: 'longhouse', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -14 },
      { id: 'river-observation-island', role: 'scout', x: 46, z: 192, yawDeg: 34,
        structure: 'stilthouse', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
      { id: 'eastern-relief-station', role: 'support', x: 262, z: -164, yawDeg: -20,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 14 },
    ],
    extraKits: ['river'], wallStyle: 'adobe', wallStoneChance: 0.18,
    wallRuns: [
      [-286, 112, -202, 146, 2], [-248, -196, -166, -154, 3],
      [-82, -204, -6, -170, 2], [134, -164, 218, -126, 3],
      [178, 202, 270, 236, 2], [-168, 222, -78, 258, 3],
    ],
    // Remote levee tracks do not carry a full utility line: marching poles
    // through the palm canopy produced bright diagonal clutter from above.
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 18, rocks: 148, outcrops: 10, craters: 62, rubblePiles: 10,
    cropFields: 11, sandbagLines: 17, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 6, debris: true },
    inhabit: {
      stalls: 5, benches: 4, coreClutter: 24, bales: 8, stooks: 10,
      pots: 8, troughs: 2, laundry: 4, handcarts: 4, carts: 4,
      trucks: 5, jeeps: 5, drumClusters: 5, camps: 4, modernClutter: 18,
      roadFence: 'fencewattle', yardFence: 'fencewattle',
    },
  },
  horizon: {
    baseHex: 0x436645, amp: 0.9, style: 'rolling', treeline: 0.96,
    forestHex: 0x244b2b, rockHex: 0x69705d, haze: 0.96, grain: 0.72,
  },
  sky: {
    sunElevationDeg: 38, sunAzimuthDeg: 104, turbidity: 6.2, rayleigh: 1.75,
    mieCoefficient: 0.0085, mieDirectionalG: 0.84, fogDensity: 0.00076,
    fogTintHex: 0x849ea0, fogMix: 0.56, envIntensity: 0.22,
    cloudOpacity: 1.16, cloudOpacity2: 0.96, cloudTintHex: 0xdce4df,
    sunIntensity: 3.55, sunColorHex: 0xffe7c5, hemiIntensity: 0.42, postExposure: 0.95,
  },
  minimap: {
    base: [63, 100, 55], hard: [105, 98, 74], soft: [48, 77, 62],
    forest: 'rgba(25,70,32,.87)', forestStroke: 'rgba(13,42,20,.95)',
    water: 'rgba(46,91,94,.82)', waterStroke: 'rgba(25,57,62,.94)',
    roadCasing: 'rgba(49,44,31,.92)', roadFill: 'rgba(174,157,116,.95)', buildingFill: '#d0c8b5',
  },
  shot: { pos: [248, 43, -274], look: [-34, -2, 72] },
};
