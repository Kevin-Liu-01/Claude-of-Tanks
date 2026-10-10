// src/world/maps/delta.ts — Jade River Delta, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The river, the market village, the levees, the palms and paddies, the roads, palette, sky, vegetation, name and id
// are the map's identity and stay; the river's course through the middle and the ground round it are new. The old
// river was one straight channel, not a braided one. Alpha's pad stood in the south-west corner, 872 m from bravo's arc,
// the zone-control discs stood up to 1.4 times farther from one team, and two plan compounds stood in the road.
//
// Reference: the braided Jamuna (Brahmaputra) in Bangladesh: channels that split and rejoin round sand islands (chars),
// a market village on the char, homesteads on mounds above the flood line, paddies boxed by low bunds, and palm and
// bamboo thickets round the yards.
//
// The story on the ground: the river comes in at the south-west and leaves at the north-east, and in the middle it
// splits round the char where the market village stands. The cross road fords both branches and the valley road runs
// up the char. Alpha deploys on the south-east bank and bravo on the north-west bank, each behind a homestead mound. The
// river, the deployments and the objectives turn through 180 degrees about the char's centre (-4, 14): the market square
// on the char and a rice-drying yard on each bank carry the zone-control discs.

import { createMarshChannel } from './marshChannel.ts';

// The braided river: a stem from each map edge splits round the char the market village stands on, and the pattern
// turns through 180 degrees about the char's centre (-4, 14).
const station = ([x, z, r]: number[]) => ({ x, z, r, dip: 1.15 });
// Two trails: the main course (the south-west stem, the west branch and the north-east stem) and the east branch, which
// leaves it at the split (-137.4, -121.3) and rejoins it at (129.4, 149.3).
const river = [
  [[-332, -320, 31], [-258, -254, 32], [-182, -186, 33], [-137.4, -121.3, 30], [-117.4, -42.6, 27], [-93.1, 17.6, 27],
    [-57.4, 66.7, 27], [-8.8, 103, 27], [51, 128.2, 27], [129.4, 149.3, 30], [174, 214, 33], [250, 282, 32],
    [324, 348, 31]],
  [[-137.4, -121.3, 28], [-59, -100.2, 27], [0.8, -75, 27], [49.4, -38.6, 27], [85.1, 10.4, 27], [109.4, 70.6, 27],
    [129.4, 149.3, 28]],
].flatMap((reach) => createMarshChannel(reach.map(station)));

export default {
  id: 'delta',
  name: 'Jade River Delta',
  blurb: 'Braided watercourses divide flooded fields, village compounds and palm thickets',
  terrain: {
    // A floodplain: low hills; the relief is the terraces at the edges, the levees, the mounds and the bunds.
    hillScale: 0.4, microScale: 0.82, rimH: 22, clearMarshVeg: true,
    roads: { paths: [
      [[-438, -404], [-360, -236], [-270, -72], [-184, 98], [-96, 274], [-20, 466]],
      [[-244, -466], [-164, -300], [-68, -128], [58, 42], [188, 212], [348, 406]],
      [[-456, -342], [-422, -142], [-396, 72], [-340, 278], [-270, 452]],
      [[338, -444], [306, -236], [330, -32], [382, 178], [432, 370]],
      [[-396, 72], [-286, 52], [-144, 34], [8, 54], [162, 38], [302, 8]],
    ] },
    marshes: river,
    // The market square on the char and a rice-drying yard on each bank: level aprons the zone-control discs seat on.
    hardstands: [
      { x: -4, z: 14, width: 50, length: 50, yawDeg: 45, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): on the cross road's own grade, a 16 m bank
      { x: -151, z: 43, width: 56, length: 56, yawDeg: 90, grade: 'road', bankM: 16 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): at its ground's median height
      { x: 143, z: -15, width: 56, length: 56, yawDeg: 0, level: 3.0, grade: 0 },
    ],
    village: { x0: -126, x1: 40, z0: -92, z1: 180, cx: -4, cz: 14, feather: 52, flatten: 0.88, relief: 0.08 },
    landforms: [
      { kind: 'ridge', x: -214, z: -108, length: 310, width: 48, height: 3.8, yawDeg: -43, wetScale: 0.82 },
      { kind: 'ridge', x: 116, z: 158, length: 330, width: 50, height: 4.0, yawDeg: -44, wetScale: 0.82 },
      { kind: 'ridge', x: -246, z: 176, length: 190, width: 62, height: 4.6, yawDeg: 28 },
      { kind: 'ridge', x: 214, z: -26, length: 186, width: 46, height: 4.8, yawDeg: -24, wetScale: 0.86 },
      { kind: 'knoll', x: 250, z: -194, rx: 88, rz: 64, height: 4.8, yawDeg: -18 },
      { kind: 'basin', x: -12, z: -224, rx: 112, rz: 72, height: -2.1, yawDeg: 12, wetScale: 0.9 },
      // flood embankments along the outer banks of the braided reach and the stems, each the other's rotation about
      // the char; the roads cut through them
      ...[[-96.6, 105.3, 220], [88.6, -77.3, 220], [-164.8, -248.7, 160], [156.8, 276.7, 160], [-264.4, -150.5, 160],
        [256.4, 178.5, 160]].map(([x, z, length]) => ({ kind: 'ridge', x, z, length, width: 26, height: 3.4, yawDeg: 45,
        wetScale: 0.4 })),
      // the paddy grid's cross bunds in the middle of the field, each pair turned about the char: hull-down cover
      // facing both banks
      ...[[-240, -110], [-250, 100], [-170, 140], [-60, -150], [-20, 50], [-330, -60]].flatMap(([x, z]) => [[x, z],
        [-8 - x, 28 - z]]).map(([x, z]) => ({ kind: 'ridge', x, z, length: 70, width: 12, height: 2.0, yawDeg: -11,
        wetScale: 0.2 })),
      // the old terraces that flank the floodplain, a few metres above it (the Barind and Madhupur tracts on the Jamuna)
      { kind: 'knoll', x: -420, z: 300, rx: 260, rz: 320, height: 8, wetScale: 0.2 },
      { kind: 'knoll', x: 412, z: -272, rx: 260, rz: 320, height: 8, wetScale: 0.2 },
      // paddy bunds on the flats on both sides of the river, and homestead mounds above the flood line
      ...[[-300, -250, 140, 0], [-330, -150, 120, 90], [-345, 30, 80, 0], [-250, 260, 160, 30], [-90, 330, 150, 0],
        [80, -300, 160, 0], [250, -260, 140, 90], [300, -60, 160, 0], [380, 120, 140, 90], [-180, 360, 120, 0],
      ].map(([x, z, length, yawDeg]) => ({ kind: 'ridge', x, z, length, width: 12, height: 1.6, yawDeg,
        wetScale: 0.9 })),
      ...[[-250, 60], [-150, 230], [-20, 240], [120, -300], [280, 120], [40, -230]]
        .map(([x, z]) => ({ kind: 'knoll', x, z, rx: 26, rz: 22, height: 3.2 })),
      // the homestead mound in front of each deployment, which screens it from the other bank
      { kind: 'knoll', x: -62, z: -272, rx: 32, rz: 28, height: 6, corridorScale: 1 },
      { kind: 'knoll', x: 54, z: 300, rx: 32, rz: 28, height: 6, corridorScale: 1 },
      // bunds by the crossings, on both banks
      ...[[-190, -80, 90, 45], [182, 108, 90, 45], [-120, 150, 110, -45], [112, -122, 110, -45], [60, -90, 90, -11],
        [-68, 118, 90, -11], [110, -40, 90, -11], [-118, 68, 90, -11]]
        .map(([x, z, length, yawDeg]) => ({ kind: 'ridge', x, z, length, width: 12, height: 1.8, yawDeg,
          wetScale: 0.9 })),
    ],
  },
  spawns: {
    // Alpha deploys on the south-east bank, bravo's seven pads on the north-west bank; their centroid is near the
    // rotation of alpha's pad about the char. 836 m between the anchors.
    player: { x: -86, z: -400 },
    enemies: [
      { x: -156, z: 422 }, { x: -82, z: 450 }, { x: -10, z: 404 },
      { x: 70, z: 444 }, { x: 148, z: 404 }, { x: 222, z: 435 }, { x: 294, z: 394 },
    ],
  },
  splat: {
    mudTone: (h: number, s: number, l: number) => [0.51, Math.min(1, s * 0.92), Math.min(1, l * 0.70)],
    seaLake: true, seaFoam: 0.08, seaRamp: [0.08, 0.42], iceDrift: 0.03,
    marshGloss: 0.86, iceSky: [0.22, 0.38, 0.36],
    fieldPatch: 1, tintA: [0.78, 1.02, 0.68], tintB: [0.52, 0.72, 0.48],
    tintC: [0.94, 1.08, 0.76], roadTint: [0.72, 0.67, 0.53], midRelief: 0.72,
  },
  vegetation: {
    species: ['palm', 'willow', 'eucalyptus', 'oak'], clusterMix: [['willow', 0.35], ['palm', 0.28], ['eucalyptus', 0.22], ['oak', 0.15]],
    loneMix: [['palm', 0.30], ['willow', 0.30], ['eucalyptus', 0.25], ['oak', 0.15]], rimMix: [['willow', 0.38], ['eucalyptus', 0.28], ['palm', 0.20], ['oak', 0.14]],
    clusterCount: 96, loneCount: 214, rimCount: 112, grassDensity: 1.22,
    clusterScrub: 2.2, bushCount: 1.45, bushSpecies: 'oak',
  },
  props: {
    // regional-buildings lane: the Jamuna char tin-homestead kit (maps/regional/bengal.ts)
    architecture: 'bengal',
    // The landmarks lane (2026-10-05; src/world/landmarks/temples.ts): the market village's terracotta aat-chala temple
    // in the yard west of the square, north of the village's yard wall: the square brick cella on its plinth under
    // the curved four-sided roof, the smaller cella and its roof above (eight slopes), the kalasa finial, the triple
    // arched front faced with terracotta plaques turned toward the square.
    landmarks: [
      // round 2 (2026-10-06; gauntlet wave 158: the temple "sits on bare lawn with no courtyard, path or village"): its
      // brick court, the temple standing on it (the court authored first: a dressing piece, it refuses nothing)
      { kind: 'path', x: -44, z: -6, yawDeg: 45, name: "the temple's brick court", params: { length: 18, width: 18, surface: 'stone' } },
      { kind: 'bengalTemple', x: -44, z: -6, yawDeg: 45, name: 'the aat-chala temple by the market', params: { side: 9 } },
    ],
    plan: ['marketRow', 'farmhouse', 'fishery', 'market', 'chapel', 'granary',
      'farmhouse', 'cornershop', 'ruin', 'boatshed', 'farmhouse', 'depot', 'marketRow', 'woodshed',
      'boatshed', 'market', 'cottage', 'farmhouse', 'granary', 'marketRow', 'depot', 'ruin',
      'boatshed', 'cornershop', 'farmhouse', 'woodshed'],
    destructibleBuildings: ['stilthouse', 'longhouse', 'fishershack', 'fieldhospital'],
    tacticalBeats: [
      { id: 'western-levee-fort', role: 'brawl', x: -286, z: -72, yawDeg: -34,
        structure: 'longhouse', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -14 },
      { id: 'homestead-mound-watch', role: 'scout', x: -150, z: 230, yawDeg: 160,
        structure: 'stilthouse', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
      { id: 'eastern-relief-station', role: 'support', x: 262, z: -164, yawDeg: -20,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 14 },
    ],
    extraKits: ['river'], wallStyle: 'adobe', wallStoneChance: 0.18,
    wallRuns: [
      [-286, 112, -202, 146, 2], [-248, -196, -166, -154, 3],
      [-82, -204, -6, -170, 2], [134, -164, 218, -126, 3],
      [178, 202, 270, 236, 2], [-168, 222, -78, 258, 3],
      // homestead compound walls in the middle of the field, each pair turned about the char
      ...[[-200, -60, -150, -70, 2], [-260, 80, -210, 70, 3], [-190, 160, -140, 150, 2], [-40, -140, 10, -150, 3],
        [-320, -40, -270, -50, 2], [-120, 200, -70, 190, 3], [-380, 60, -330, 50, 2], [-400, -60, -350, -70, 3],
        [-340, 140, -290, 130, 2],
        // the market village's yard walls on the char and its landings on both banks
        [18.5, 60.5, 57.7, 52.9, 2], [90, -60, 140, -70, 3], [60, -130, 110, -140, 2], [-70, -40, -40, -70, 3],
      ].flatMap(([x0, z0, x1, z1, v]): [number, number, number, number, number][] => [[x0, z0, x1, z1, v],
        [-8 - x0, 28 - z0, -8 - x1, 28 - z1, v]]),
    ],
    // Remote levee tracks do not carry a full utility line: marching poles
    // through the palm canopy produced bright diagonal clutter from above.
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 18, rocks: 148, outcrops: 10, craters: 62, rubblePiles: 10,
    cropFields: 11, sandbagLines: 17, hedgehogs: 8,
    cropForm: 'wet-upright', // existing dry wetland-edge plots, not flooded paddies
    // the map-vehicles lane (2026-10-06, the period ruling): the Jamuna: the Bangladesh Army's Type 59s
    tankWrecks: { era: 'cold-war', count: 6, debris: true, ids: ['type59'] },
    inhabit: {
      stalls: 5, benches: 4, coreClutter: 24, bales: 8, stooks: 10,
      pots: 8, troughs: 2, laundry: 4, handcarts: 4, carts: 4,
      trucks: 5, jeeps: 5, drumClusters: 5, camps: 4, modernClutter: 18,
      roadFence: 'fencewattle', yardFence: 'fencewattle',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Jamuna homesteads' rice
  // straw, packed round a bamboo pole into tall stacks at the foot of each homestead mound.
  scenery: {
    landmarks: [
      { kind: 'strawstack', x: -232, z: 74, name: 'the straw stacks at the west homestead' },
      { kind: 'strawstack', x: -226, z: 66 },
      { kind: 'strawstack', x: -134, z: 214, name: 'the straw stacks below the homestead mound' },
      { kind: 'strawstack', x: -142, z: 206 },
      { kind: 'strawstack', x: -4, z: 224, name: 'the straw stacks at the north homestead' },
      { kind: 'strawstack', x: 104, z: -284, name: 'the straw stacks at the south homestead' },
      { kind: 'strawstack', x: 112, z: -292 },
      { kind: 'strawstack', x: 264, z: 104, name: 'the straw stacks at the east homestead' },
      { kind: 'strawstack', x: 24, z: -214, name: 'the straw stacks at the levee homestead' },
    ],
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the Jamuna chars are a dead-flat
    // floodplain: the ring's swells low, the far country plain (homestead tree lines over the water-braided flats)
    baseHex: 0x436645, amp: 0.3, style: 'rolling', treeline: 0.96, treelineLayers: 3, panorama: { regional: 'plain' },
    forestHex: 0x244b2b, rockHex: 0x69705d, haze: 0.96, grain: 0.72,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'towering-cumulus', windDirDeg: 110 },
  sky: {
    sunElevationDeg: 38, sunAzimuthDeg: 104, turbidity: 6.2, rayleigh: 1.75,
    mieCoefficient: 0.0085, mieDirectionalG: 0.84, fogDensity: 0.00076,
    fogTintHex: 0x849ea0, fogMix: 0.56, envIntensity: 0.22,
    cloudOpacity: 1.16, cloudOpacity2: 0.96, cloudTintHex: 0xdce4df,
    sunIntensity: 4.1, sunColorHex: 0xfbeed6, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.55 / 0xffe7c5 / 0.42); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x61694b },
  },
  minimap: {
    base: [63, 100, 55], hard: [105, 98, 74], soft: [48, 77, 62],
    forest: 'rgba(25,70,32,.87)', forestStroke: 'rgba(13,42,20,.95)',
    water: 'rgba(46,91,94,.82)', waterStroke: 'rgba(25,57,62,.94)',
    roadCasing: 'rgba(49,44,31,.92)', roadFill: 'rgba(174,157,116,.95)', buildingFill: '#d0c8b5',
  },
  shot: { pos: [248, 43, -274], look: [-34, -2, 72] },
  // round 66 (2026-09-24, the FFT ocean): the river carries only the faintest ripple under a 2.4 m/s air; the
  // owner's approved look is kept (amplitude 0.55)
  ocean: { windSpeed: 2.4, windDirDeg: 110, fetchKm: 2, amplitude: 0.55, foam: 0, breakers: 0.05, caustics: 0.3 },
} satisfies import('./contracts.ts').MapCompositionConfig;
