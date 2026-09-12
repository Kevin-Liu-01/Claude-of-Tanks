// A broad graded runway anchors the field; the terminal sits off its west
// edge so long sightlines trade directly against apron hard cover.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';
export default {
  id: 'airfield', name: 'Kestrel Airfield',
  blurb: 'A windswept landing strip separates dispersed shelters, service aprons and perimeter berms',
  terrain: {
    hillScale: 0.6, microScale: 0.5, rimH: 20,
    // One continuous graded landing strip, baked into the existing terrain
    // and road mask. The two old route centerlines remain navigation links.
    hardstands: [{ x: 0, z: 0, width: 36, length: 760, yawDeg: 0 }],
    village: { x0: -272, x1: -96, z0: -154, z1: 152, cx: -200, cz: -8, feather: 36, flatten: 0.92, relief: 0.06 },
    roads: { paths: [
      [[-6, -470], [-6, -290], [-6, -110], [-6, 90], [-6, 290], [-6, 470]],
      [[6, -470], [6, -290], [6, -110], [6, 90], [6, 290], [6, 470]],
      // Terminal frontage feeds two right-angle apron entrances. The long
      // parallel strip stays unobstructed, with cover on only its west side.
      [[-354, -462], [-310, -250], [-232, -126], [-232, -80], [-232, 84], [-232, 126], [-310, 280], [-332, 462]],
      [[354, -460], [322, -276], [310, -74], [320, 114], [326, 294], [354, 462]],
      [[-232, -80], [-144, -80], [-100, -176], [14, -176], [156, -184], [322, -276]],
      [[-232, 84], [-144, 84], [-112, 172], [24, 172], [166, 182], [326, 294]],
    ] },
    marshes: [{ x: 230, z: -310, r: 34, dip: 0.7 }],
    landforms: [
      { kind: 'ridge', x: -374, z: 18, length: 590, width: 52, height: 5.4 },
      { kind: 'ridge', x: 362, z: 24, length: 570, width: 58, height: 6.0 },
      { kind: 'ridge', x: 172, z: -48, length: 144, width: 40, height: 4.6, yawDeg: 86 },
      { kind: 'ridge', x: 184, z: 250, length: 154, width: 42, height: 5.0, yawDeg: 88 },
      { kind: 'knoll', x: -196, z: 306, rx: 86, rz: 58, height: 5.4 },
      { kind: 'basin', x: 188, z: -314, rx: 80, rz: 64, height: -2.2 },
    ],
  },
  spawns: { player: { x: -182, z: -388 }, enemies: [
    { x: -260, z: 392 }, { x: -176, z: 424 }, { x: -96, z: 382 }, { x: -14, z: 420 },
    { x: 68, z: 382 }, { x: 152, z: 422 }, { x: 238, z: 386 },
  ] },
  splat: { sourcedPalette: 'railyard', pavedRoads: true, roadTexMix: 0.12, townWear: 0.8, fieldPatch: 1, midRelief: 0.55, tintA: [0.94, 1.00, 0.76], tintB: [0.67, 0.76, 0.60], tintC: [1.06, 1.08, 0.86], roadTint: [0.55, 0.56, 0.54] },
  vegetation: {
    species: ['pine', 'birch', 'poplar'], clusterMix: [['pine', 0.6], ['birch', 0.25], ['poplar', 0.15]],
    loneMix: [['birch', 0.4], ['pine', 0.4], ['poplar', 0.2]], rimMix: [['pine', 0.65], ['birch', 0.2], ['poplar', 0.15]],
    clusterCount: 26, loneCount: 42, rimCount: 80, grassDensity: 0.72, bushCount: 0.82, bushSpecies: 'birch', // map pass 2026-09-12: perimeter scrub (tree/rock counts at the first-pass ceilings)
    avoid: [{ x: 0, z: -300, r: 92 }, { x: 0, z: -150, r: 92 }, { x: 0, z: 0, r: 92 }, { x: 0, z: 150, r: 92 }, { x: 0, z: 300, r: 92 }],
  },
  props: {
    sourcedPalette: 'railyard',
    plan: ['warehouse', 'depot', 'foundryoffice', 'watertower', 'warehouse', 'containerRow', 'firestation', 'depot', 'warehouse', 'ruin', 'gantry', 'foundryoffice', 'depot', 'warehouse', 'containerRow', 'ruin'],
    destructibleBuildings: ['quonsethut', 'motorpool', 'relaystation', 'guardpost'],
    buildingLat: [15, 3], destructibleBuildingLat: [19, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'terminal-apron', role: 'brawl', x: -204, z: -10, yawDeg: 90, structure: 'motorpool', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'eastern-radar-berm', role: 'scout', x: 230, z: 68, yawDeg: -90, structure: 'relaystation', outcrop: { count: 4, radius: 8 } },
      { id: 'north-dispersal-shelter', role: 'support', x: 146, z: 296, yawDeg: -90, structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    tones: makeRealisticCityBuildingTones({ value: 1, saturation: 0.92, soot: 0.01, roofValue: 0.94 }),
    wallStyle: 'fieldstone', wallStoneChance: 0.6,
    wallRuns: [[-270, -60, -270, 0, 2], [-270, 20, -270, 80, 3], [-176, -48, -112, -48, 2], [-176, 28, -112, 28, 3], [178, 262, 178, 332, 2], [196, 36, 196, 104, 2]],
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 98, outcrops: 12, craters: 58, rubblePiles: 14, sandbagLines: 18, hedgehogs: 18,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['pl01', 'm551_sheridan', 'marder1a3', 'm2a2_bradley', 'm1a2'] },
    inhabit: { stalls: 0, benches: 2, coreClutter: 20, drums: 10, trucks: 7, jeeps: 5, drumClusters: 5, camps: 3, modernClutter: 22, looseClutter: 18, roadFence: 'fencerail', yardFence: 'fencerail' },
  },
  horizon: { baseHex: 0x6f795e, amp: 0.65, style: 'rolling', treeline: 0.60, forestHex: 0x394e37, rockHex: 0x7a7c70, haze: 0.90, grain: 0.42 },
  sky: { sunElevationDeg: 30, sunAzimuthDeg: 142, turbidity: 3.8, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.81, fogDensity: 0.00048, fogTintHex: 0x92a9b7, fogMix: 0.46, envIntensity: 0.24, cloudOpacity: 0.85, cloudOpacity2: 0.45, cloudTintHex: 0xf1f2ed, sunIntensity: 4.0, sunColorHex: 0xffedda, hemiIntensity: 0.40 },
  minimap: { base: [99, 111, 77], hard: [114, 118, 111], soft: [62, 80, 64], forest: 'rgba(46,71,41,.84)', forestStroke: 'rgba(27,44,25,.94)', water: 'rgba(61,91,99,.8)', waterStroke: 'rgba(33,60,69,.94)', roadCasing: 'rgba(37,39,37,.94)', roadFill: 'rgba(149,151,144,.96)', buildingFill: '#d0d0c4' },
  shot: { pos: [-294, 52, -310], look: [80, 1, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
