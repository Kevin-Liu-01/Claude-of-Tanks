// Upland waterworks: a western deployment forks around the offset reservoir,
// with a screened northern bank and a dry southern dam-side saddle.
import frontier from './frontier.ts';
export default {
  id: 'reservoir', name: 'Highland Reservoir',
  // Route preference only: other maps retain their authored shallow fords.
  navigationWaterPolicy: 'avoid-liquid',
  blurb: 'An irregular upland basin, pine-covered waterworks and a service settlement beneath high ridges',
  terrain: {
    hillScale: 1.08, microScale: 0.78, rimH: 38, clearMarshVeg: true, softLakes: true,
    village: { x0: -212, x1: 26, z0: -108, z1: 130, cx: -92, cz: 12, feather: 44, flatten: 0.82, relief: 0.18 },
    // Full platoon assembly/access, including the real outward solo search.
    // Existing hardstand stamps grade the current road grids/mask; no mesh,
    // additional terrain buffer, path or material is constructed here.
    hardstands: [
      { x: -393, z: -73, width: 76, length: 260, yawDeg: -7, grade: 0 },
    ],
    roads: { paths: [
      // Western deployment enters one fork, not one of several full-height
      // parallel lanes. The southern road uses the existing substation saddle.
      [[-424, -72], [-364, -72], [-340, -88], [-238, -174], [-78, -212],
        [42, -244], [172, -224], [294, -190], [392, -100]],
      // A longer, screened bank route passes above all three lake lobes and
      // ends at the northern assembly junction. Only the eastern spine owns
      // the continuation to the east gate; no second path re-crosses it.
      [[-340, -88], [-292, 88], [-224, 190], [-124, 222], [40, 242],
        [180, 266], [314, 238], [388, 160]],
      // Retain the settlement's two-dimensional hooked works street. This
      // is a brawl shortcut between the fork's arms, not a map-edge lane.
      [[-238, -174], [-138, -116], [-138, -42], [-82, -42], [-82, 100], [-124, 222]],
      // Retain the original local shore spine beside the kiosk/penstock.
      // Its dry north/south ends feed the two routes around the lake.
      [[42, -244], [-22, -102], [-82, -42], [-22, 42], [-4, 78], [40, 242]],
      // Two genuinely separate east-side assembly pockets: three vehicles
      // south of the basin, four on the north plateau. The rear service road
      // alone owns the connection between the southern and northern joins,
      // so each route pair has one real junction rather than overlapping grades.
      // The first northern tank stages on the open apron east of this bend;
      // it must not straddle the road's final-priority graded shoulder.
      [[370, -328], [436, -288], [420, -208], [392, -100], [416, 0],
        [388, 160], [448, 226], [372, 282], [440, 354]],
    ] },
    // Three unequal lobes form an irregular upland retention basin. Their
    // shared shoulder stays open water around a dry northern promontory;
    // three total wet cells replace the old dumbbell and satellite pond.
    lakes: [
      { x: 164, z: -26, r: 110, depth: 1.0, level: -8.0 },
      { x: 104, z: 72, r: 80, depth: 1.0, level: -8.0 },
      { x: 212, z: 68, r: 68, depth: 1.0, level: -8.0 },
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -276, z: 14, length: 426, width: 80, height: 9.2, yawDeg: 4 },
      { kind: 'ridge', x: 340, z: 12, length: 446, width: 76, height: 8.6, yawDeg: -2 },
      { kind: 'ridge', x: 102, z: -256, length: 290, width: 64, height: 7.2, yawDeg: 88 },
      { kind: 'ridge', x: 102, z: 282, length: 290, width: 68, height: 7.0, yawDeg: 86 },
      { kind: 'basin', x: 162, z: 12, rx: 152, rz: 232, height: -5.0, wetScale: 0.2 },
      { kind: 'knoll', x: -126, z: 250, rx: 94, rz: 68, height: 5.8 },
    ],
  },
  spawns: {
    player: { x: -384, z: -72,
      formation: { columnSpacingM: 8, rowSpacingM: 13 } },
    enemies: [
      { x: 370, z: -328 }, { x: 436, z: -288 }, { x: 420, z: -208 },
      { x: 436, z: 156 }, { x: 448, z: 226 }, { x: 372, z: 282 }, { x: 440, z: 354 },
    ],
  },
  splat: { sourcedPalette: 'frontier', ...frontier.splat, seaLake: true, seaFoam: 0.06, seaRamp: [0.16, 0.5], iceDrift: 0.02, marshGloss: 0.90, iceSky: [0.22, 0.37, 0.46], tintA: [0.82, 0.99, 0.74], tintB: [0.56, 0.74, 0.57], tintC: [1.0, 1.06, 0.84], roadTint: [0.72, 0.70, 0.60] },
  vegetation: {
    species: ['pine', 'fir', 'birch'], clusterMix: [['pine', 0.5], ['fir', 0.32], ['birch', 0.18]],
    loneMix: [['birch', 0.42], ['pine', 0.4], ['fir', 0.18]], rimMix: [['pine', 0.5], ['fir', 0.4], ['birch', 0.1]],
    clusterCount: 66, loneCount: 98, rimCount: 108, grassDensity: 0.96, bushCount: 1.0, bushSpecies: 'birch', clusterScrub: 1.6,
  },
  props: {
    sourcedPalette: 'frontier',
    // A supported control kiosk, bank manifold and submerged-footed intake
    // replace three accepted rubble piles; the closed works leave roads open.
    reservoirWaterworks: { lakeIndex: 1, kiosk: [14, 84], bank: [39.5, 100], intake: [46.5, 99] },
    plan: ['foundryoffice', 'depot', 'rangerlodge', 'warehouse', 'watertower', 'farmhouse', 'woodshed', 'tavern', 'depot', 'granary', 'ruin', 'cottage', 'warehouse', 'rangerlodge', 'depot', 'farmhouse', 'woodshed', 'ruin'],
    destructibleBuildings: ['transformershed', 'servicegarage', 'huntingblind', 'fieldhut'],
    buildingLat: [13, 2], destructibleBuildingLat: [17, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'waterworks-service-yard', role: 'brawl', x: -166, z: 64, yawDeg: 90, structure: 'servicegarage', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
      { id: 'eastern-shore-observation', role: 'scout', x: 328, z: 70, yawDeg: -90, structure: 'huntingblind', outcrop: { count: 4, radius: 8 } },
      { id: 'southern-saddle-substation', role: 'support', x: 68, z: -270, yawDeg: 0, structure: 'transformershed', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.76,
    wallRuns: [[-196, 28, -196, 94, 2], [-190, 112, -122, 112, 3], [-48, -10, 10, -10, 2], [-48, 104, 14, 104, 3], [292, 40, 292, 112, 2], [32, -300, 104, -300, 3]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 194, outcrops: 32, craters: 48, rubblePiles: 14, cropFields: 3, sandbagLines: 16, hedgehogs: 10,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 1, benches: 3, coreClutter: 20, bales: 6, troughs: 2, laundry: 2, handcarts: 3, carts: 3, trucks: 5, jeeps: 4, drumClusters: 5, camps: 3, modernClutter: 20, looseClutter: 20, roadFence: 'fenceplank', yardFence: 'fencerail' },
  },
  horizon: { baseHex: 0x62766a, amp: 1.25, style: 'alpine', treeline: 0.80, snowline: 2, forestHex: 0x304e40, rockHex: 0x828d87, haze: 0.90, grain: 0.52 },
  sky: { ...frontier.sky, sunElevationDeg: 26, sunAzimuthDeg: 142, turbidity: 4.2, fogDensity: 0.00058, fogTintHex: 0x91a8b5, fogMix: 0.5, cloudOpacity: 1.0, cloudOpacity2: 0.66, sunIntensity: 3.8, hemiIntensity: 0.43 },
  minimap: { ...frontier.minimap, base: [78, 105, 77], hard: [111, 114, 98], soft: [47, 75, 71], water: 'rgba(43,89,111,.86)', waterStroke: 'rgba(23,55,73,.94)' },
  shot: { pos: [-248, 57, -248], look: [108, -1, 74] },
} satisfies import('./contracts.ts').MapCompositionConfig;
