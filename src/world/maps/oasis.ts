// A crescent oasis west of the town creates a short wet cut, an exposed
// caravan road and a long dune-back flank. Reuses only the desert materials.
import desert from './desert.ts';
export default {
  id: 'oasis', name: 'Sunscar Oasis',
  blurb: 'A palm-ringed spring and caravan compounds lie between broad wind-carved dune arms',
  terrain: {
    hillScale: 0.70, microScale: 0.60, rimH: 28, dunes: { amp: 5.4 }, clearMarshVeg: true, softLakes: true,
    village: { x0: -12, x1: 230, z0: -124, z1: 134, cx: 110, cz: 0, feather: 44, flatten: 0.88, relief: 0.12 },
    roads: { paths: [
      // A dog-legged caravan street slows the short town route; the souk
      // approach enters across it while the open dune bypass stays fast.
      [[30, -464], [90, -284], [122, -122], [72, -70], [72, 18], [142, 46], [156, 242], [208, 464]],
      [[-346, -460], [-300, -270], [-282, -76], [-254, 102], [-190, 286], [-100, 464]],
      [[370, -454], [326, -280], [302, -88], [302, 108], [324, 296], [356, 460]],
      [[-282, -76], [30, -100], [72, -70], [156, -74], [218, -30], [302, -88]],
      [[-314, 182], [-198, 222], [-72, 206], [66, 226], [194, 200], [334, 228]],
    ] },
    // Three overlapping spring cells bend around a dry, town-facing tongue.
    // The former satellite marsh is part of the same waterline, not a pond.
    lakes: [
      { x: -138, z: -16, r: 52, depth: 0.75, level: -1.2 },
      { x: -182, z: 32, r: 57, depth: 0.75, level: -1.2 },
      { x: -134, z: 84, r: 48, depth: 0.65, level: -1.2 },
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -334, z: 36, length: 370, width: 82, height: 8.2, yawDeg: 14 },
      { kind: 'ridge', x: 312, z: -8, length: 390, width: 90, height: 8.8, yawDeg: -12 },
      { kind: 'knoll', x: -120, z: -254, rx: 118, rz: 62, height: 6.8, yawDeg: -22 },
      { kind: 'ridge', x: -24, z: 280, length: 240, width: 68, height: 6.6, yawDeg: 76 },
      { kind: 'basin', x: -114, z: 46, rx: 132, rz: 172, height: -4.0, wetScale: 0.2 },
      { kind: 'knoll', x: 246, z: -244, rx: 66, rz: 72, height: 5.0 },
    ],
  },
  spawns: { player: { x: 60, z: -390 }, enemies: [
    { x: -252, z: 382 }, { x: -170, z: 420 }, { x: -86, z: 378 }, { x: -2, z: 422 },
    { x: 82, z: 382 }, { x: 166, z: 424 }, { x: 250, z: 384 },
  ] },
  splat: { sourcedPalette: 'desert', ...desert.splat,
    // The spring owns this liquid layer: desert's brown dry-clay tone is
    // inappropriate here. Keep its subdued lightness with a small lift.
    mudTone: (_h: number, _s: number, l: number) => [0.50, 0.35, Math.min(0.42, l * 1.5 + 0.07)],
    seaLake: true, seaFoam: 0.04, seaRamp: [0.08, 0.40], iceDrift: 0.02, marshGloss: 0.88, iceSky: [0.22, 0.46, 0.43], midRelief: 0.52, rippleDir: [0.4, 0.92] },
  vegetation: {
    grassTexTone: desert.vegetation.grassTexTone, tuftTone: desert.vegetation.tuftTone,
    species: ['palm', 'acacia', 'eucalyptus'], clusterMix: [['palm', 0.65], ['acacia', 0.3], ['eucalyptus', 0.05]],
    loneMix: [['acacia', 0.65], ['palm', 0.3], ['eucalyptus', 0.05]], rimMix: [['acacia', 0.55], ['palm', 0.35], ['eucalyptus', 0.1]],
    clusterCount: 24, loneCount: 28, rimCount: 30, grassDensity: 0.5, clusterScrub: 2.0, bushCount: 0.8, bushSpecies: 'acacia', palettes: desert.vegetation.palettes,
    belts: [{ x0: -208, z0: -104, x1: -218, z1: 148, gap: 18, jitter: 5, species: 'palm' }, { x0: 10, z0: -102, x1: 24, z1: 142, gap: 19, jitter: 5, species: 'palm' }],
  },
  props: {
    sourcedPalette: 'desert',
    plan: ['caravanserai', 'compoundSouk', 'adobe', 'bathhouse', 'marketRow', 'minaret', 'compound', 'adobe', 'market', 'ruin', 'adobe', 'compound', 'tower', 'adobe', 'marketRow', 'ruin', 'adobe', 'compound'],
    destructibleBuildings: ['deserttent', 'commandtent', 'checkpointhut', 'guardpost'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3],
    tacticalBeats: [
      { id: 'caravan-toll-compound', role: 'brawl', x: 216, z: 48, yawDeg: -90, structure: 'checkpointhut', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'western-dune-lookout', role: 'scout', x: -292, z: 50, yawDeg: 90, structure: 'guardpost', outcrop: { count: 5, radius: 9 } },
      { id: 'spring-supply-camp', role: 'support', x: -72, z: 256, yawDeg: 180, structure: 'deserttent', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
    ],
    tones: desert.props.tones, wallStyle: 'adobe', wallStoneChance: 0.16, sideSkip: 0.16, spacingPad: 7,
    wallRuns: [[38, -40, 38, 18, 2], [108, -106, 168, -106, 2], [248, 12, 248, 84, 3], [176, 90, 248, 90, 2], [-108, 280, -32, 280, 3], [-108, 216, -108, 280, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: false,
    rocks: 144, outcrops: 24, craters: 48, rubblePiles: 12, sandbagLines: 14, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 5, benches: 3, coreClutter: 22, pots: 10, laundry: 4, handcarts: 3, carts: 4, trucks: 4, jeeps: 3, drumClusters: 4, camps: 4, modernClutter: 18, looseClutter: 18, roadFence: 'fencewattle', yardFence: 'fencewattle' },
  },
  horizon: { baseHex: 0xaa936b, amp: 0.90, style: 'rolling', treeline: 0.12, forestHex: 0x70704b, rockHex: 0xae9471, haze: 0.88, grain: 0.46 },
  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, fogDensity: 0.00052, fogTintHex: 0xb0a18a, fogMix: 0.46, cloudOpacity: 0.5, cloudOpacity2: 0.22, sunIntensity: 4.0, hemiIntensity: 0.40 },
  minimap: { ...desert.minimap, water: 'rgba(45,111,108,.86)', waterStroke: 'rgba(23,70,70,.94)' },
  shot: { pos: [-252, 52, -246], look: [86, 1, 80] },
} satisfies import('./contracts.ts').MapCompositionConfig;
