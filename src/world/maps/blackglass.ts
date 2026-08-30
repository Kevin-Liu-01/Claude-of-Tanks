// blackglass.js — collapsed arcologies and a bombed civic district laid over
// rolling transit cuts. The skyline is deliberately different from Steinburg:
// fewer buildings, far larger masses, and long diagonal firing corridors.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'blackglass',
  name: 'Blackglass District',
  blurb: 'Broken arcologies, elevated transit ruins and a flooded financial quarter under a storm front',
  terrain: {
    hillScale: 0.62, microScale: 0.72, rimH: 36,
    marshes: [
      { x: -54, z: 36, r: 48, dip: 1.4 }, { x: 34, z: 72, r: 42, dip: 1.2 },
    ],
    village: { x0: -294, x1: 304, z0: -288, z1: 302, cx: 6, cz: 16, feather: 54, flatten: 0.82, relief: 0.46 },
    roads: { paths: [
      [[-450, -430], [-330, -302], [-210, -174], [-76, -34], [74, 104], [212, 246], [354, 430]],
      [[390, -452], [276, -304], [160, -164], [42, -22], [-88, 126], [-218, 278], [-354, 444]],
      [[-438, -120], [-286, -110], [-142, -92], [8, -106], [162, -88], [318, -112], [446, -100]],
      [[-430, 178], [-284, 154], [-136, 178], [18, 150], [168, 180], [316, 156], [442, 180]],
      [[-238, -438], [-210, -280], [-232, -120], [-204, 42], [-230, 208], [-202, 432]],
      [[226, -438], [204, -278], [232, -118], [202, 42], [228, 210], [204, 432]],
    ] },
    landforms: [
      { kind: 'ridge', x: -288, z: 20, length: 520, width: 86, height: 8.0, yawDeg: -8, settlementScale: 0.72 },
      { kind: 'ridge', x: 292, z: 18, length: 520, width: 86, height: 8.2, yawDeg: 9, settlementScale: 0.72 },
      { kind: 'ridge', x: 10, z: 292, length: 360, width: 74, height: 6.8, yawDeg: 88, settlementScale: 0.70 },
      { kind: 'knoll', x: -164, z: -182, rx: 94, rz: 72, height: 6.0, yawDeg: 24, settlementScale: 0.65 },
      { kind: 'basin', x: 24, z: 54, rx: 122, rz: 104, height: -4.8, yawDeg: -12, settlementScale: 0.82 },
      { kind: 'knoll', x: 176, z: -214, rx: 86, rz: 62, height: 5.4, yawDeg: -18, settlementScale: 0.66 },
    ],
  },
  spawns: {
    player: { x: -248, z: -392 },
    enemies: [
      { x: -222, z: 384 }, { x: -146, z: 422 }, { x: -68, z: 378 },
      { x: 12, z: 420 }, { x: 94, z: 378 }, { x: 176, z: 416 }, { x: 254, z: 374 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.37, clamp01(s * 0.18), clamp01(l * 0.44 + 0.03)],
    dirtTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.22), clamp01(l * 0.52 + 0.025)],
    rockTone: (h: number, s: number, l: number) => [0.62, clamp01(s * 0.18), clamp01(l * 0.52)],
    tintA: [0.65, 0.72, 0.76], tintB: [0.38, 0.43, 0.46], tintC: [0.82, 0.72, 0.61],
    roadTint: [0.32, 0.35, 0.37], roadTexMix: 0.88, townWear: 2.0, midRelief: 0.95,
  },
  vegetation: {
    species: ['cedar', 'cypress', 'pine'], clusterMix: [['cedar', 0.45], ['cypress', 0.35], ['pine', 0.20]],
    loneMix: [['cypress', 0.45], ['cedar', 0.35], ['pine', 0.20]], rimMix: [['cedar', 0.55], ['cypress', 0.30], ['pine', 0.15]],
    clusterCount: 18, loneCount: 36, rimCount: 62, grassDensity: 0.32,
    bushCount: 0.38, bushSpecies: 'cedar',
  },
  props: {
    plan: [
      'arcology', 'needletower', 'parkingdeck', 'civichall', 'ruin', 'terracetower',
      'factory', 'parkingdeck', 'broadcasttower', 'foundryoffice', 'ruin', 'civichall',
      'arcology', 'parkingdeck', 'warehouse', 'megatower', 'ruin', 'factory',
      'civichall', 'parkingdeck', 'needletower', 'ruin', 'terracetower', 'foundryoffice',
      'warehouse', 'parkingdeck', 'broadcasttower', 'civichall', 'ruin', 'megatower',
      'factory', 'parkingdeck', 'arcology', 'ruin', 'civichall', 'needletower',
    ],
    destructibleBuildings: [
      'motorpool', 'transformershed', 'commandtent', 'checkpointhut',
      'servicegarage', 'relaystation', 'corneroffice',
    ],
    tacticalBeats: [
      { id: 'sunken-exchange', role: 'brawl', x: -58, z: 42, yawDeg: 45,
        structure: 'motorpool', redoubt: true, wreck: true, wreckOffsetX: -18 },
      { id: 'transit-scar', role: 'scout', x: -228, z: -148, yawDeg: -8,
        structure: 'checkpointhut', outcrop: { count: 5, radius: 9, scaleMax: 2.7 } },
      { id: 'arcology-overlook', role: 'support', x: 232, z: 172, yawDeg: 8,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: 16 },
    ],
    blockFill: true, streetRows: true, streetRowsAfterLandmarks: true,
    streetRowRoadStride: 2, ruinChance: 0.54, curbs: true, lampposts: true,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.61, clamp01(s * 0.18), clamp01(l * 0.56)],
      plaster2: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.25), clamp01(l * 0.52)],
      plaster3: (h: number, s: number, l: number) => [0.56, clamp01(s * 0.22), clamp01(l * 0.48)],
      stone: (h: number, s: number, l: number) => [0.60, clamp01(s * 0.16), clamp01(l * 0.59)],
      roof: (h: number, s: number, l: number) => [0.03, clamp01(s * 0.23), clamp01(l * 0.42)],
      wood: null, straw: null,
    },
    wallStyle: 'brick', wallStoneChance: 0.82, buildingLat: [15, 7],
    sideSkip: 0.06, spacingPad: 4.0, maxSpread: 4.6,
    wallRuns: [
      [-310, -172, -210, -142, 2], [-304, 164, -204, 194, 3],
      [208, -170, 310, -140, 3], [208, 166, 310, 196, 2],
      [-154, -278, -50, -250, 1], [60, 260, 162, 290, 4],
      [-282, -20, -282, 86, 3], [284, -66, 284, 42, 2],
    ],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: false, logs: false,
    rocks: 124, outcrops: 18, craters: 116, rubblePiles: 164,
    hedgehogs: 34, sandbagLines: 28, townCraters: true,
    tankWrecks: { era: 'modern', count: 8, debris: true },
    inhabit: {
      stalls: 0, benches: 6, coreClutter: 38, drums: 22,
      trucks: 11, jeeps: 7, drumClusters: 10, camps: 4, modernClutter: 42,
      roadFence: 'fencerail', yardFence: 'fencerail',
    },
  },
  horizon: {
    baseHex: 0x333e46, amp: 1.05, style: 'escarpment', treeline: 0.24,
    forestHex: 0x263431, rockHex: 0x53606a, haze: 1.0, grain: 0.50,
  },
  sky: {
    sunElevationDeg: 18, sunAzimuthDeg: 242, turbidity: 8.4, rayleigh: 1.3,
    mieCoefficient: 0.013, mieDirectionalG: 0.88, fogDensity: 0.00082,
    fogTintHex: 0x788794, fogMix: 0.65, envIntensity: 0.18,
    cloudOpacity: 1.34, cloudOpacity2: 1.12, cloudTintHex: 0xaeb8c1,
    sunIntensity: 3.5, sunColorHex: 0xffb77e, hemiIntensity: 0.38, postExposure: 0.91,
  },
  minimap: {
    base: [58, 68, 73], hard: [74, 81, 86], soft: [48, 57, 61],
    forest: 'rgba(35,52,47,.70)', forestStroke: 'rgba(22,33,30,.88)',
    water: 'rgba(52,78,90,.76)', waterStroke: 'rgba(31,51,60,.88)',
    roadCasing: 'rgba(20,25,29,.96)', roadFill: 'rgba(91,101,107,.95)', buildingFill: '#b9b8b4',
  },
  shot: { pos: [-344, 48, -308], look: [18, 12, 46] },
} satisfies import('./contracts.ts').MapCompositionConfig;
