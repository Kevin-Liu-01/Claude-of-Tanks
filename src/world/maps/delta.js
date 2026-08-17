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
  sub: 'Fords · Rice Fields · River Town',
  blurb: 'Braided watercourses divide flooded fields, village compounds and palm thickets',
  terrain: {
    hillScale: 0.64, microScale: 0.82, rimH: 22, clearMarshVeg: true,
    marshes: river,
    village: { x0: -126, x1: 158, z0: -92, z1: 180, cx: 18, cz: 42, feather: 52, flatten: 0.88, relief: 0.08 },
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
    extraKits: ['river'], wallStyle: 'adobe', wallStoneChance: 0.18,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
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
    sunElevationDeg: 42, sunAzimuthDeg: 104, turbidity: 7.4, rayleigh: 1.9,
    mieCoefficient: 0.012, mieDirectionalG: 0.86, fogDensity: 0.00122,
    fogTintHex: 0x8ea7a0, fogMix: 0.68, envIntensity: 0.24,
    cloudOpacity: 1.16, cloudOpacity2: 0.96, cloudTintHex: 0xdce4df,
    sunIntensity: 3.75, sunColorHex: 0xffe7c5, hemiIntensity: 0.5,
  },
  minimap: {
    base: [63, 100, 55], hard: [105, 98, 74], soft: [48, 77, 62],
    forest: 'rgba(25,70,32,.87)', forestStroke: 'rgba(13,42,20,.95)',
    water: 'rgba(46,91,94,.82)', waterStroke: 'rgba(25,57,62,.94)',
    roadCasing: 'rgba(49,44,31,.92)', roadFill: 'rgba(174,157,116,.95)', buildingFill: '#d0c8b5',
  },
  shot: { pos: [248, 43, -274], look: [-34, -2, 72] },
};
