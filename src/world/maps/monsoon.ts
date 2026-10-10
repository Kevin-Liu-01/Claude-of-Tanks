// src/world/maps/monsoon.ts — Monsoon Ridge, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The flood channel, the ruined hill town, the five roads, the jungle, palette, sky, name and id are the map's identity
// and stay; the hills are new. The old ones were Verdant's five landforms in a monsoon palette, and their ground closed
// the median sightline to 78 m.
//
// Reference: Kohima in the Naga Hills, April to June 1944: a hill town on a saddle between jungle spurs, Garrison Hill
// and Jail Hill above its streets, the road winding through, and the monsoon flooding the valley bottoms.
//
// The story on the ground: the flood channel runs through the valley from the south-west to the north-east, under the
// town. A spur ridge stands west of the town north of the channel and another east of it; Garrison Hill rises in the
// north-west and Jail Hill in the south-west, and two terrace knolls hold the east side. Alpha deploys in the south
// valley beside the road on its assembly apron, bravo on the northern slope. The zone-control discs stand on the line
// of equal driven distance: the temple forecourt by the west road, the town's square and the tea estate's drying yard
// on the east.

import { createMarshChannel } from './marshChannel.ts';

// Rainwater follows the lower saddle into the eastern floodplain; the
// original western/eastern bowls remain anchors along one continuous run.
const floodChannel = createMarshChannel([
  { x: -354, z: -250, r: 30, dip: 0.70 },
  { x: -236, z: -124, r: 58, dip: 2.0 },
  { x: -118, z: -144, r: 29, dip: 0.70 },
  { x: -18, z: -88, r: 30, dip: 0.70 },
  { x: 94, z: 10, r: 30, dip: 0.70 },
  { x: 152, z: 124, r: 32, dip: 0.75 },
  { x: 210, z: 184, r: 52, dip: 2.2 },
  { x: 318, z: 278, r: 30, dip: 0.70 },
]);

export default {
  id: 'monsoon',
  name: 'Monsoon Ridge',
  blurb: 'A storm rolls across jungle ridges and the shattered town in the valley',
  terrain: {
    hillScale: 1.0, microScale: 1.1, rimH: 44, clearMarshVeg: true,
    roads: { paths: [
      [[-424, -442], [-342, -274], [-306, -82], [-322, 108], [-254, 286], [-174, 462]],
      [[-62, -468], [-42, -282], [-8, -112], [28, 48], [54, 224], [106, 466]],
      [[350, -450], [294, -286], [264, -104], [288, 72], [242, 250], [180, 450]],
      [[-356, -172], [-214, -132], [-76, -60], [62, -18], [208, -66], [264, -104], [322, -146]],
      [[-310, 204], [-164, 168], [-18, 210], [120, 274], [238, 328]],
    ] },
    marshes: [
      ...floodChannel,
      { x: 294, z: -260, r: 38, dip: 1.8 },
    ],
    // The aprons keep the apron bank law (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"): none makes its bank steeper than
    // the hills round it. The zone-control seats stand on the line of equal driven distance. The temple forecourt by
    // the west road and the tea estate's drying yard east of the east spur are aprons; the town's own square needs
    // none.
    hardstands: [
      // Alpha's assembly apron round its pad in the south valley, where road 2 crosses it. It takes the road's own
      // height and grade (6 % down the valley on this seed), so the road keeps its grade at every terrain seed. Its
      // turbo goal and its flag seat on it.
      { x: -40, z: -340, width: 32, length: 32, yawDeg: 6, grade: 'road', bankM: 16 },
      // the temple forecourt astride the west road, on the road's own grade, with a 24 m bank down to the channel
      { x: -306, z: 16, width: 44, length: 44, yawDeg: -5, grade: 'road', bankM: 24 },
      // the drying yard at its ground's median height
      { x: 400, z: 8, width: 56, length: 56, yawDeg: 0, level: 4.5, grade: 0 },
    ],
    village: { x0: -132, x1: 156, z0: -112, z1: 174, cx: 12, cz: 26, feather: 50, flatten: 0.74, relief: 0.28 },
    landforms: [
      // the spur ridges west and east of the town, Garrison Hill, Jail Hill, the flood basin and the terrace knolls
      { kind: 'ridge', x: -200, z: 120, length: 240, width: 70, height: 9, yawDeg: 80 },
      { kind: 'ridge', x: 215, z: -40, length: 280, width: 60, height: 9, yawDeg: 100 },
      { kind: 'knoll', x: -100, z: 280, rx: 70, rz: 55, height: 12 },
      { kind: 'knoll', x: -110, z: -260, rx: 60, rz: 50, height: 10 },
      { kind: 'basin', x: -300, z: -320, rx: 80, rz: 60, height: -3, wetScale: 0.75 },
      { kind: 'knoll', x: 330, z: 160, rx: 60, rz: 50, height: 8 },
      { kind: 'knoll', x: 230, z: -300, rx: 60, rz: 45, height: 8 },
    ],
  },
  spawns: {
    // Alpha forms up on its apron in the south valley beside the road. The old pad (10, -398) stood on a 30 % hillside:
    // every level apron there inside the turbo arena (|z| <= 402 for the goal) cut a wall into the hill, and its goal
    // seated 300 m forward. Bravo's pads stand 16 m farther north than before, so the deployments stay 744 m apart.
    player: { x: -40, z: -340 },
    enemies: [
      { x: -196, z: 388 }, { x: -126, z: 426 }, { x: -50, z: 382 },
      { x: 28, z: 430 }, { x: 108, z: 384 }, { x: 188, z: 420 }, { x: 258, z: 372 },
    ],
  },
  splat: {
    seaLake: true, seaFoam: 0.06, seaRamp: [0.10, 0.44], iceDrift: 0.02,
    marshGloss: 0.84, iceSky: [0.20, 0.34, 0.32],
    tintA: [0.67, 0.93, 0.65], tintB: [0.41, 0.61, 0.43], tintC: [0.85, 1.02, 0.72],
    roadTint: [0.55, 0.49, 0.40], midRelief: 1.0,
    // round 45 (2026-09-23, AAA checks 3/15): the SW corner mound rendered as bare mud from ~30°; a monsoon hill holds
    // its turf to ~38° — the slope→rock thresholds shift by 0.10 (rock from ~38°, full at ~50°).
    slopeGrassHold: 0.10,
  },
  vegetation: {
    species: ['eucalyptus', 'palm', 'willow', 'oak'], clusterMix: [['eucalyptus', 0.36], ['willow', 0.28], ['palm', 0.22], ['oak', 0.14]],
    loneMix: [['eucalyptus', 0.34], ['palm', 0.28], ['willow', 0.24], ['oak', 0.14]], rimMix: [['eucalyptus', 0.38], ['willow', 0.28], ['palm', 0.22], ['oak', 0.12]],
    clusterCount: 118, loneCount: 238, rimCount: 148, grassDensity: 1.38,
    clusterScrub: 2.7, bushCount: 1.72, bushSpecies: 'oak',
  },
  props: {
    // regional-buildings lane: the Kohima 1944 kit (maps/regional/kohima.ts)
    architecture: 'kohima',
    plan: ['ruin', 'chapel', 'bathhouse', 'marketRow', 'ruin', 'cornershop',
      'granary', 'ruin', 'depot', 'farmhouse', 'tower', 'market', 'ruin', 'woodshed',
      'marketRow', 'ruin', 'farmhouse', 'chapel', 'depot', 'ruin', 'granary', 'cornershop',
      'ruin', 'market', 'farmhouse', 'woodshed'],
    destructibleBuildings: ['stilthouse', 'longhouse', 'fieldhospital', 'commandtent'],
    tacticalBeats: [
      { id: 'western-temple-ridge', role: 'brawl', x: -250, z: 140, yawDeg: 12,
        structure: 'longhouse', redoubt: true, outcrop: { count: 7, radius: 11 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'floodplain-listening-post', role: 'scout', x: 44, z: -184, yawDeg: 18,
        structure: 'commandtent', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-field-hospital', role: 'support', x: 310, z: -80, yawDeg: -16,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [
      [-292, -116, -204, -80, 2], [-282, 116, -190, 154, 3],
      [188, -136, 282, -102, 3], [194, 138, 286, 170, 2],
      [-134, 230, -34, 260, 3], [66, -252, 158, -218, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 235, outcrops: 48, craters: 82, rubblePiles: 28,
    sandbagLines: 22, hedgehogs: 16,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      stalls: 4, benches: 3, coreClutter: 26, pots: 5, laundry: 4,
      handcarts: 4, carts: 3, trucks: 6, jeeps: 5, drumClusters: 6,
      camps: 5, modernClutter: 22, roadFence: 'fencewattle', yardFence: 'fencewattle',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Naga Hills' stones. A
  // memorial monolith stands on Garrison Hill's crown, as the Kohima memorial does; a row of Naga memorial stones,
  // raised for a village's feasts of merit, stands by the temple forecourt.
  scenery: {
    landmarks: [
      { kind: 'menhir', x: -100, z: 276, scale: 1.4, height: 5.2, name: 'the memorial stone on Garrison Hill' },
      { kind: 'menhir', x: -286, z: -26, scale: 1.0, height: 3.4, name: 'the Naga stones by the temple' },
      { kind: 'menhir', x: -280, z: -31, scale: 0.8, height: 2.6 },
      { kind: 'menhir', x: -292, z: -21, scale: 0.7, height: 2.1 },
    ],
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet waves 15 and 24): Kohima stands on the Naga Hills' ridges — long, steep,
    // forested to their crests (the regional 'ridges', rebuilt after wave 24 read bare pale rock and a needle spike); the
    // ring keeps the PR head's height
    baseHex: 0x355344, amp: 1.08, style: 'alpine', treeline: 0.97, treelineLayers: 3, snowline: 2, panorama: { regional: 'ridges' },
    forestHex: 0x193a28, rockHex: 0x59635a, haze: 0.97, grain: 0.64,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulonimbus-front', windDirDeg: 200 },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 124, turbidity: 7.8, rayleigh: 2.05,
    mieCoefficient: 0.012, mieDirectionalG: 0.88, fogDensity: 0.00088,
    fogTintHex: 0x708c86, fogMix: 0.66, envIntensity: 0.27,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.9 / 0xffdfc0 / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x61694b },
  },
  minimap: {
    base: [51, 84, 59], hard: [82, 82, 70], soft: [37, 65, 55],
    forest: 'rgba(19,61,35,.9)', forestStroke: 'rgba(9,35,19,.97)',
    water: 'rgba(43,80,78,.8)', waterStroke: 'rgba(22,48,48,.94)',
    roadCasing: 'rgba(38,35,29,.94)', roadFill: 'rgba(133,124,100,.94)', buildingFill: '#bfc3b9',
  },
  shot: { pos: [-176, 44, -232], look: [44, 3, 92] },
  // round 66 (2026-09-24, the FFT ocean): the flooded river under the monsoon air — a low ripple, silt hides the bed
  // so the caustics stay faint; the owner's approved look is kept (amplitude 0.6)
  ocean: { windSpeed: 2.8, windDirDeg: 200, fetchKm: 2.5, amplitude: 0.6, foam: 0, breakers: 0.05, caustics: 0.2 },
} satisfies import('./contracts.ts').MapCompositionConfig;
