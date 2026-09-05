// A horseshoe quarry with a low ore-cut, two unequal rim routes and a
// transverse service shelf. No new geometry family or runtime update loop.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
import desert from './desert.ts';
export default {
  id: 'copper_mesa', name: 'Copper Mesa Mine',
  blurb: 'Ore terraces and haul-road switchbacks encircle an abandoned open-pit mine',
  terrain: {
    hillScale: 0.9, microScale: 0.8, rimH: 38,
    village: { x0: 64, x1: 256, z0: -190, z1: 128, cx: 160, cz: -24, feather: 40, flatten: 0.78, relief: 0.18 },
    roads: { paths: [
      // A stepped loading apron on the eastern shelf puts the gantries and
      // stores beside the haul road; the pit floor remains a separate lane.
      [[84, -464], [236, -298], [148, -146], [148, -68], [218, -68], [218, 90], [206, 272], [106, 462]],
      [[-326, -462], [-354, -288], [-338, -86], [-258, 90], [-170, 284], [-72, 462]],
      [[-88, -454], [-206, -286], [-192, -136], [-78, -86], [-112, 48], [-44, 190], [4, 458]],
      [[354, -444], [376, -230], [364, -26], [338, 170], [328, 354], [290, 470]],
      [[-258, 90], [-104, 168], [28, 90], [136, 90], [218, 90], [338, 170]],
    ] },
    marshes: [{ x: -66, z: 32, r: 38, dip: 0.8 }],
    landforms: [
      { kind: 'basin', x: -78, z: 20, rx: 178, rz: 214, height: -11.0, corridorScale: 0.7 },
      { kind: 'ridge', x: -298, z: 40, length: 430, width: 78, height: 11.2, yawDeg: 18 },
      { kind: 'ridge', x: 130, z: 56, length: 400, width: 74, height: 8.4, yawDeg: -8 },
      { kind: 'ridge', x: -58, z: 260, length: 280, width: 64, height: 8.6, yawDeg: 88 },
      { kind: 'knoll', x: -186, z: -250, rx: 104, rz: 58, height: 5.8 },
      { kind: 'knoll', x: 310, z: -250, rx: 72, rz: 78, height: 6.8 },
    ],
  },
  spawns: { player: { x: -104, z: -394 }, enemies: [
    { x: -236, z: 386 }, { x: -154, z: 422 }, { x: -74, z: 380 }, { x: 8, z: 424 },
    { x: 90, z: 380 }, { x: 170, z: 418 }, { x: 250, z: 384 },
  ] },
  splat: { sourcedPalette: 'badlands',
    grassTone: (h: number, s: number, l: number) => [0.075, s * 0.55, 0.20 + l * 0.64],
    dirtTone: (h: number, s: number, l: number) => [0.064, s * 0.58, 0.16 + l * 0.60],
    sandstone: true, strata: 0.12, sandMacro: 0.7, midRelief: 0.8,
    tintA: [1.03, 0.85, 0.63], tintB: [0.70, 0.55, 0.44], tintC: [1.06, 0.89, 0.7], roadTint: [0.68, 0.59, 0.48],
  },
  vegetation: {
    grassTexTone: desert.vegetation.grassTexTone, tuftTone: desert.vegetation.tuftTone,
    species: ['acacia', 'cedar', 'pine'], clusterMix: [['acacia', 0.58], ['cedar', 0.32], ['pine', 0.1]],
    loneMix: [['acacia', 0.65], ['cedar', 0.25], ['pine', 0.1]], rimMix: [['cedar', 0.5], ['acacia', 0.4], ['pine', 0.1]],
    clusterCount: 22, loneCount: 32, rimCount: 40, grassDensity: 0.36, bushCount: 0.6, bushSpecies: 'acacia', clusterScrub: 1.6,
  },
  props: {
    sourcedPalette: 'foundry',
    plan: ['gantry', 'warehouse', 'foundryoffice', 'depot', 'watertower', 'containerRow', 'factory', 'ruin', 'warehouse', 'depot', 'gantry', 'containerRow', 'foundryoffice', 'ruin', 'depot', 'warehouse'],
    destructibleBuildings: ['quonsethut', 'motorpool', 'guardpost', 'servicegarage'],
    buildingLat: [14, 3], destructibleBuildingLat: [18, 4], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'ore-loading-shelf', role: 'brawl', x: 188, z: 34, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 6, radius: 11 }, wreck: true },
      { id: 'western-rim-survey', role: 'scout', x: -300, z: 120, yawDeg: 70, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      { id: 'southern-haul-workshop', role: 'support', x: -76, z: -228, yawDeg: -90, structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    tones: makeRealisticCityBuildingTones({ value: 0.95, saturation: 0.92, soot: 0.03, roofValue: 0.88 }),
    wallStyle: 'fieldstone', wallStoneChance: 0.8,
    wallRuns: [[110, -162, 110, -106, 2], [172, -116, 232, -116, 2], [246, -40, 246, 22, 3], [166, 118, 230, 118, 2], [-126, -244, -58, -244, 3], [-326, 96, -326, 168, 2]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 224, outcrops: 42, craters: 52, rubblePiles: 26, sandbagLines: 16, hedgehogs: 12,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 0, benches: 2, coreClutter: 22, drums: 12, trucks: 7, jeeps: 3, drumClusters: 6, camps: 2, modernClutter: 22, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  horizon: { baseHex: 0x8d6a50, amp: 1.5, style: 'mesa', treeline: 0.1, forestHex: 0x5c6141, rockHex: 0xa37a58, haze: 0.86, grain: 0.55 },
  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 5.6, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, fogDensity: 0.00050, fogTintHex: 0xaa9b89, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.68, cloudOpacity2: 0.35, cloudTintHex: 0xf2e6d6, sunIntensity: 4.1, sunColorHex: 0xffe0b6, hemiIntensity: 0.36 },
  minimap: { base: [124, 98, 73], hard: [133, 110, 86], soft: [83, 71, 59], forest: 'rgba(75,83,49,.8)', forestStroke: 'rgba(46,52,31,.92)', water: 'rgba(75,92,90,.8)', waterStroke: 'rgba(45,58,59,.92)', roadCasing: 'rgba(51,40,32,.94)', roadFill: 'rgba(179,156,126,.96)', buildingFill: '#c4b6a3' },
  shot: { pos: [-284, 68, -282], look: [-30, -4, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
