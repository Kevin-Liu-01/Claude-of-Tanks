// Japanese-inspired cultivated valley: contour-planted broadleaf rows,
// cedar edges, a bathhouse/market settlement and three stepped farm tracks.
import verdant from './verdant.ts';
export default {
  id: 'orchard', name: 'Orchard Valley',
  blurb: 'Terraced orchard rows, cedar groves and a quiet bathhouse village along a winding valley road',
  terrain: {
    hillScale: 1.0, microScale: 0.72, rimH: 32,
    village: { x0: -106, x1: 108, z0: -92, z1: 112, cx: -6, cz: 12, feather: 42, flatten: 0.86, relief: 0.12 },
    roads: { paths: [
      // The bathhouse street bends into the packing court; the second
      // frontage below turns back around it instead of stringing homes out.
      [[-88, -466], [-48, -290], [-32, -128], [-44, -66], [-20, -12], [34, 30], [50, 114], [6, 308], [68, 466]],
      [[-360, -460], [-328, -286], [-218, -172], [-302, 6], [-222, 172], [-258, 314], [-180, 464]],
      [[324, -458], [262, -300], [308, -132], [224, 18], [286, 164], [252, 320], [288, 466]],
      [[-218, -172], [-112, -88], [-76, -18], [-20, -12], [24, -48], [98, -56], [202, -100], [308, -132]],
      [[-324, 196], [-222, 172], [-100, 204], [50, 146], [178, 196], [330, 224]],
    ] },
    marshes: [{ x: 136, z: -128, r: 28, dip: 0.7 }, { x: -120, z: 230, r: 29, dip: 0.8 }],
    landforms: [
      { kind: 'ridge', x: -262, z: -36, length: 310, width: 64, height: 8.2, yawDeg: 6 },
      { kind: 'ridge', x: 250, z: 36, length: 320, width: 70, height: 8.6, yawDeg: -8 },
      { kind: 'ridge', x: -194, z: -218, length: 210, width: 48, height: 5.6, yawDeg: 80 },
      { kind: 'ridge', x: 172, z: 218, length: 224, width: 52, height: 6.0, yawDeg: 82 },
      { kind: 'knoll', x: -84, z: 290, rx: 82, rz: 64, height: 6.2 },
      { kind: 'basin', x: 0, z: -12, rx: 136, rz: 182, height: -3.0, settlementScale: 0.5 },
    ],
  },
  spawns: { player: { x: -68, z: -392 }, enemies: [
    { x: -256, z: 386 }, { x: -174, z: 408 }, { x: -90, z: 382 }, { x: -6, z: 424 },
    { x: 80, z: 384 }, { x: 164, z: 426 }, { x: 248, z: 388 },
  ] },
  splat: { sourcedPalette: 'verdant', fieldPatch: 1, midRelief: 0.74, tintA: [0.9, 1.06, 0.76], tintB: [0.63, 0.80, 0.53], tintC: [1.1, 1.08, 0.80], roadTint: [0.76, 0.7, 0.58] },
  vegetation: {
    species: ['oak', 'cedar', 'pine'], clusterMix: [['cedar', 0.46], ['pine', 0.34], ['oak', 0.2]],
    loneMix: [['oak', 0.64], ['cedar', 0.26], ['pine', 0.1]], rimMix: [['cedar', 0.54], ['pine', 0.36], ['oak', 0.1]],
    clusterCount: 42, loneCount: 38, rimCount: 88, grassDensity: 0.95, bushCount: 1.0, bushSpecies: 'oak',
    belts: [
      { x0: -206, z0: -96, x1: -92, z1: -68, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -204, z0: -44, x1: -104, z1: -22, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -210, z0: 40, x1: -114, z1: 66, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: 98, z0: 72, x1: 248, z1: 96, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 110, z0: 126, x1: 272, z1: 146, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 126, z0: -98, x1: 268, z1: -80, gap: 18, jitter: 0.8, species: 'oak' },
    ],
    authoredTrees: [
      // Rehouse existing oaks as cultivated parcels. Cedar/pine libraries,
      // total tree records, variants and the distant wooded rim stay intact.
      { id: 'west-lower-orchard', species: 'oak', path: [[-210, -96], [-140, -78]], count: 10, width: 0.15 },
      { id: 'west-middle-orchard', species: 'oak', path: [[-212, -44], [-142, -28]], count: 10, width: 0.15 },
      { id: 'west-upper-orchard', species: 'oak', path: [[-208, 42], [-142, 60]], count: 10, width: 0.15 },
      { id: 'east-lower-orchard', species: 'oak', path: [[146, -94], [250, -78]], count: 14, width: 0.15 },
      { id: 'east-middle-orchard', species: 'oak', path: [[146, 78], [236, 94]], count: 12, width: 0.15 },
      { id: 'east-upper-orchard', species: 'oak', path: [[150, 132], [246, 146]], count: 13, width: 0.15 },
    ],
  },
  props: {
    sourcedPalette: 'autumn',
    plan: ['bathhouse', 'farmhouse', 'marketRow', 'rangerlodge', 'granary', 'woodshed', 'cottage', 'barn', 'market', 'farmhouse', 'tavern', 'granary', 'woodshed', 'ruin', 'barn', 'cottage', 'farmhouse', 'marketRow'],
    destructibleBuildings: ['fieldhut', 'leanto', 'huntingblind', 'longhouse'],
    buildingLat: [11, 2], destructibleBuildingLat: [15, 3], sideSkip: 0.16, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'village-packing-court', role: 'brawl', x: 70, z: 56, yawDeg: -90, structure: 'longhouse', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'western-orchard-watch', role: 'scout', x: -272, z: 48, yawDeg: 110, structure: 'huntingblind', outcrop: { count: 4, radius: 8 } },
      { id: 'upper-harvest-store', role: 'support', x: 246, z: 238, yawDeg: -105, structure: 'fieldhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.68,
    // Retaining/garden walls parallel the planted terraces, ending at the
    // working tracks. Shorter runs reclaim geometry from remote field edges.
    wallRuns: [[-210, -112, -94, -84, 3], [-212, 22, -112, 48, 3], [92, 54, 242, 78, 3], [108, 110, 266, 130, 2], [-108, 90, -108, 142, 2], [122, -116, 262, -98, 3]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 12, rocks: 138, outcrops: 20, craters: 48, rubblePiles: 10, cropFields: 7, sandbagLines: 12, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, bales: 8, stooks: 8, pots: 8, laundry: 4, troughs: 2, handcarts: 4, carts: 4, trucks: 4, jeeps: 3, drumClusters: 3, camps: 2, modernClutter: 18, looseClutter: 20, roadFence: 'fencewattle', yardFence: 'fencepicket' },
  },
  horizon: { baseHex: 0x5c7154, amp: 1.05, style: 'alpine', treeline: 0.84, snowline: 2, forestHex: 0x2e513c, rockHex: 0x7a8270, haze: 0.9, grain: 0.55 },
  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 3.9, hemiIntensity: 0.42 },
  minimap: { ...verdant.minimap, base: [89, 110, 67], hard: [116, 107, 85], soft: [55, 79, 56] },
  shot: { pos: [-244, 56, -256], look: [60, 1, 98] },
} satisfies import('./contracts.ts').MapCompositionConfig;
