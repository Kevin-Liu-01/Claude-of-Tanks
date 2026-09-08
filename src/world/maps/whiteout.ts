// Wind-scoured polar logistics station, not an alpine-village reskin:
// staggered snow berms screen a wide service grid and a frozen melt pan.
import winter from './winter.ts';
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
export default {
  id: 'whiteout', name: 'Whiteout Station',
  blurb: 'A remote polar station, frozen melt pans and snow-berm service corridors beneath a pale sky',
  terrain: {
    hillScale: 0.78, microScale: 0.54, rimH: 24, frozenMarshes: true,
    village: { x0: -160, x1: 76, z0: -150, z1: 146, cx: -52, cz: 0, feather: 46, flatten: 0.84, relief: 0.10 },
    roads: { paths: [
      // Windbreak service court west of the melt pan, not a town spread
      // across the ice. Parallel station rows open into two snow corridors.
      [[-270, -118], [-100, -104], [-20, -104], [-20, 0], [70, -104], [252, -104]],
      [[-310, -460], [-280, -300], [-270, -118], [-274, 74], [-286, 274], [-300, 460]],
      [[-130, -462], [-98, -288], [-100, -104], [-100, 96], [-114, 262], [-90, 464]],
      [[298, -460], [270, -284], [252, -104], [258, 82], [288, 282], [326, 462]],
      [[-274, 74], [-202, 150], [-100, 96], [-20, 96], [64, 154], [202, 174], [288, 282]],
    ] },
    lakes: [{ x: 114, z: -22, r: 77, depth: 0.55 }, { x: -302, z: 300, r: 38, depth: 0.45 }],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -186, z: -52, length: 180, width: 44, height: 5.6, yawDeg: 8 },
      { kind: 'ridge', x: 196, z: 84, length: 190, width: 48, height: 6.0, yawDeg: -6 },
      { kind: 'ridge', x: -20, z: 268, length: 220, width: 62, height: 6.4, yawDeg: 88 },
      { kind: 'ridge', x: -10, z: -270, length: 200, width: 56, height: 5.8, yawDeg: 88 },
      { kind: 'basin', x: 98, z: 12, rx: 108, rz: 128, height: -2.2, wetScale: 0.2 },
      { kind: 'knoll', x: -346, z: 24, rx: 84, rz: 102, height: 7.0 },
    ],
  },
  spawns: { player: { x: -102, z: -390 }, enemies: [
    { x: -256, z: 382 }, { x: -174, z: 422 }, { x: -90, z: 380 }, { x: -6, z: 424 },
    { x: 78, z: 382 }, { x: 162, z: 422 }, { x: 248, z: 388 },
  ] },
  splat: { sourcedPalette: 'winter', ...winter.splat, iceDrift: 0.3, tintA: [1.02, 1.04, 1.08], tintB: [0.82, 0.88, 0.96], tintC: [1.05, 1.06, 1.08], roadTint: [0.67, 0.70, 0.72], midRelief: 0.45 },
  vegetation: {
    grassTexTone: winter.vegetation.grassTexTone, tuftTone: winter.vegetation.tuftTone,
    // A few sheltered firs break up the spruce/birch silhouette without
    // increasing the deliberately sparse station's tree placement budget.
    species: ['spruce', 'birch', 'fir'], clusterMix: [['spruce', 0.55], ['birch', 0.35], ['fir', 0.10]],
    loneMix: [['birch', 0.65], ['spruce', 0.30], ['fir', 0.05]], rimMix: [['spruce', 0.65], ['birch', 0.25], ['fir', 0.10]],
    clusterCount: 8, loneCount: 12, rimCount: 20, grassDensity: 0.20, bushCount: 0.22, bushSpecies: 'birch',
    palettes: winter.vegetation.palettes,
  },
  props: {
    sourcedPalette: 'winter',
    plan: ['depot', 'warehouse', 'watertower', 'foundryoffice', 'containerRow', 'depot', 'warehouse', 'ruin', 'firestation', 'depot', 'containerRow', 'woodshed', 'warehouse', 'ruin', 'depot', 'foundryoffice'],
    destructibleBuildings: ['quonsethut', 'relaystation', 'motorpool', 'servicegarage'],
    buildingLat: [14, 2], destructibleBuildingLat: [18, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'station-motor-pool', role: 'brawl', x: -196, z: 26, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'eastern-weather-relay', role: 'scout', x: 288, z: 38, yawDeg: -90, structure: 'relaystation', outcrop: { count: 4, radius: 8 } },
      { id: 'north-fuel-shelter', role: 'support', x: 12, z: 266, yawDeg: 180, structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true },
    ],
    tones: makeRealisticCityBuildingTones({ value: 1.04, saturation: 1.02, soot: 0.01, roofValue: 0.94 }),
    snowCap: true, extraKits: ['winterLake'], wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [[-148, -76, -148, -16, 2], [-148, 20, -148, 84, 3], [-66, -58, -4, -58, 2], [-66, 52, -4, 52, 3], [-26, 296, 56, 296, 2], [316, 0, 316, 74, 2]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: true,
    rocks: 136, outcrops: 22, craters: 50, rubblePiles: 12, sandbagLines: 16, hedgehogs: 12,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 0, benches: 2, coreClutter: 20, sleds: 10, drums: 8, trucks: 5, jeeps: 4, drumClusters: 5, camps: 2, modernClutter: 20, looseClutter: 20, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  horizon: { baseHex: 0xa3b1be, amp: 0.72, style: 'rolling', treeline: 0.08, snowline: 0.08, forestHex: 0x536371, rockHex: 0x9da9b4, haze: 0.92, grain: 0.35 },
  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, sunIntensity: 2.75, hemiIntensity: 0.58 },
  minimap: { ...winter.minimap, base: [161, 174, 186], hard: [137, 149, 159], soft: [107, 130, 149] },
  shot: { pos: [-256, 49, -262], look: [68, 0, 82] },
} satisfies import('./contracts.ts').MapCompositionConfig;
