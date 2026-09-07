// Estuary channels form a hooked island chain. Three dry radial roads meet
// at a fishing village; short wet chords expose tanks between cover islands.
import delta from './delta.ts';
import { createLakeChannel } from './marshChannel.ts';
export default {
  id: 'mangrove', name: 'Mangrove Reach',
  blurb: 'Fishing compounds occupy low estuary islands connected by shallow fords and raised tracks',
  terrain: {
    // A low estuary floodplain, with the authored ridges below retaining
    // distinct dry island routes instead of excavating a river through hills.
    hillScale: 0.24, microScale: 0.28, rimH: 18, clearMarshVeg: true, softLakes: true,
    village: { x0: -194, x1: 46, z0: -64, z1: 138, cx: -74, cz: 32, feather: 46, flatten: 0.88, relief: 0.10 },
    roads: { paths: [
      // The fishing lane follows the dry island shoulder in a hook. Net
      // yards face the landing, and the northern track opens a second exit.
      [[-374, -462], [-290, -290], [-214, -126], [-152, -24], [-114, 26], [-114, 84], [-160, 130], [-204, 214], [-286, 462]],
      [[-100, -462], [-130, -302], [-68, -138], [2, 16], [108, 170], [234, 314], [342, 462]],
      [[350, -454], [256, -300], [234, -120], [188, 48], [204, 228], [158, 460]],
      [[-214, -126], [-82, -186], [54, -160], [198, -174], [234, -120]],
      [[-204, 214], [-160, 130], [-114, 84], [-24, 84], [72, 204], [204, 228]],
    ] },
    // One tidal spine bends around the relief island, with a western creek
    // wrapping the fishing village. Only the existing raised roads interrupt
    // its water, not broad un-authored land gaps. Reuse eighteen spine cells
    // and eight creek cells; all twenty-six share the same tidal waterline.
    lakes: [
      ...createLakeChannel([
        { x: 80, z: -310, r: 36 }, { x: 80, z: -190, r: 36 },
        { x: 124, z: -82, r: 36 }, { x: 114, z: 72, r: 36 },
        { x: 68, z: 194, r: 36 }, { x: 108, z: 308, r: 36 },
      ], -2.3),
      ...createLakeChannel([
        { x: -224, z: 202, r: 38 }, { x: -158, z: 250, r: 38 },
        { x: 56, z: 260, r: 38 },
      ], -2.3),
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -162, z: 10, length: 360, width: 54, height: 5.4, yawDeg: 8, wetScale: 0.2 },
      { kind: 'ridge', x: 218, z: 22, length: 420, width: 62, height: 5.8, yawDeg: -8, wetScale: 0.2 },
      { kind: 'knoll', x: -48, z: -230, rx: 90, rz: 72, height: 5.0 },
      { kind: 'knoll', x: -92, z: 230, rx: 92, rz: 68, height: 5.2 },
      { kind: 'basin', x: 106, z: -92, rx: 62, rz: 194, height: -2.6, wetScale: 0.2 },
      { kind: 'ridge', x: -276, z: -270, length: 190, width: 58, height: 5.2, yawDeg: 68 },
    ],
  },
  spawns: { player: { x: -106, z: -388 }, enemies: [
    { x: -254, z: 382 }, { x: -170, z: 424 }, { x: -86, z: 380 }, { x: -2, z: 426 },
    { x: 84, z: 382 }, { x: 168, z: 424 }, { x: 252, z: 388 },
  ] },
  splat: {
    ...delta.splat, sourcedPalette: 'monsoon', fieldPatch: 0,
    // Organic suspended-silt pigment, independent of the unchanged wave and
    // roughness fields. Existing grazing sheen stays muted olive-grey.
    mudTone: (_h: number, s: number, l: number) => [0.115, Math.min(1, s * 0.75), Math.min(1, l * 1.8)],
    seaFoam: 0.12, seaRamp: [0.12, 0.50], shoreDirt: true, marshGloss: 0.9,
    iceSky: [0.18, 0.19, 0.145],
    tintA: [0.78, 1.0, 0.68], tintB: [0.50, 0.70, 0.48], tintC: [0.98, 1.06, 0.78],
  },
  vegetation: {
    willowForm: 'tidalMangrove',
    grassTexTone: (h: number, s: number, l: number) => [h + 0.015, s * 0.7, l * 0.85],
    tuftTone: (h: number, s: number, l: number) => [h + 0.015, s * 0.7, l * 0.85],
    species: ['willow', 'palm', 'eucalyptus'], clusterMix: [['willow', 0.6], ['palm', 0.24], ['eucalyptus', 0.16]],
    loneMix: [['palm', 0.44], ['willow', 0.42], ['eucalyptus', 0.14]], rimMix: [['willow', 0.62], ['eucalyptus', 0.24], ['palm', 0.14]],
    clusterCount: 58, loneCount: 78, rimCount: 84, grassDensity: 1.06, bushCount: 1.14, bushSpecies: 'willow', clusterScrub: 2.0,
    belts: [{ x0: -382, z0: -40, x1: -330, z1: 258, gap: 22, jitter: 5, species: 'willow' }, { x0: 40, z0: -278, x1: 46, z1: 48, gap: 23, jitter: 5, species: 'willow' }],
    authoredTrees: [
      // Dry rooted ribbons follow the actual tidal spine, not new random
      // forest discs. Lake/causeway/village clearances remain unchanged.
      { id: 'southern-tidal-bank', species: 'willow', path: [[122, -306], [122, -208], [126, -194], [139, -154], [154, -130]], count: 22, width: 0.6 },
      { id: 'relief-island-bank', species: 'willow', path: [[168, -72], [160, 64], [132, 128]], count: 24, width: 0.6 },
      { id: 'fishing-creek-bank', species: 'willow', path: [[-116, 204], [-42, 210], [20, 216]], count: 18, width: 0.5 },
    ],
    // Existing willow allocations become uneven 3–5-tree tidal thickets.
    // Open gaps preserve raised road crossings and the working boat landings.
    tidalTrees: [
      { id: 'southern-prop-root-thickets', species: 'willow', path: [[94, -315], [94, -200]], count: 32,
        clumps: [3, 5, 4, 3, 5, 4, 4, 4] },
      { id: 'central-prop-root-thickets', species: 'willow', path: [[122, -124], [115, 105]], count: 64,
        clumps: [5, 3, 4, 5, 3, 4, 3, 5, 4, 3, 5, 4, 4, 3, 5, 4] },
      { id: 'creek-prop-root-thickets', species: 'willow', path: [[-100, 256], [32, 263]], count: 32,
        clumps: [4, 3, 5, 4, 5, 3, 4, 4] },
    ],
  },
  props: {
    riverLandings: [
      { lakeIndex: 20, shoreAngleDeg: 285 }, // village-facing creek landing
      { lakeIndex: 10, shoreAngleDeg: 0 }, // relief-island net yard
      { lakeIndex: 16, shoreAngleDeg: 0 }, // northern creek working bank
    ],
    sourcedPalette: 'delta',
    plan: ['fishery', 'boatshed', 'marketRow', 'farmhouse', 'compound', 'boatshed', 'market', 'woodshed', 'fishery', 'granary', 'boatshed', 'ruin', 'marketRow', 'farmhouse', 'depot', 'woodshed', 'compound', 'boatshed'],
    destructibleBuildings: ['stilthouse', 'fishershack', 'longhouse', 'fieldhospital'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.18, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'western-fishing-landing', role: 'brawl', x: -166, z: 90, yawDeg: 90, structure: 'longhouse', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
      { id: 'southern-ford-watch', role: 'scout', x: -22, z: -238, yawDeg: -90, structure: 'stilthouse', outcrop: { count: 4, radius: 8 } },
      { id: 'eastern-relief-island', role: 'support', x: 242, z: 110, yawDeg: -100, structure: 'fieldhospital', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    extraKits: ['river'], wallStyle: 'adobe', wallStoneChance: 0.20,
    wallRuns: [[-180, -40, -180, 22, 2], [-178, 124, -116, 124, 2], [-78, 48, -14, 48, 3], [-78, -40, -14, -40, 2], [270, 78, 270, 148, 3], [-58, -268, -58, -204, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 114, outcrops: 12, craters: 48, rubblePiles: 10, cropFields: 4, sandbagLines: 14, hedgehogs: 6,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 4, benches: 3, coreClutter: 20, pots: 8, laundry: 4, handcarts: 4, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 3, modernClutter: 18, looseClutter: 20, roadFence: 'fencewattle', yardFence: 'fencewattle' },
  },
  horizon: { baseHex: 0x56735c, amp: 0.46, style: 'rolling', treeline: 0.82, forestHex: 0x2d533b, rockHex: 0x7a8370, haze: 0.94, grain: 0.54 },
  sky: { ...delta.sky, sunElevationDeg: 32, sunAzimuthDeg: 94, turbidity: 5.7, fogDensity: 0.00064, fogTintHex: 0x95b0b0, fogMix: 0.52, sunIntensity: 3.7, cloudOpacity: 1.05, cloudOpacity2: 0.72 },
  minimap: { ...delta.minimap, base: [66, 101, 63], hard: [104, 102, 77], soft: [46, 80, 67] },
  shot: { pos: [-260, 49, -260], look: [52, -1, 90] },
} satisfies import('./contracts.ts').MapCompositionConfig;
