// A logging country T-junction with a diagonal clearcut, a wet western
// bypass and a screened eastern spur. Planted belts define the cut edges.
import frontier from './frontier.ts';
export default {
  id: 'longleaf', name: 'Longleaf Crossing',
  blurb: 'Pine clearcuts, timber yards and a winding logging spur around a wooded creek hollow',
  terrain: {
    hillScale: 1.05, microScale: 0.86, rimH: 30,
    village: { x0: -142, x1: 92, z0: -54, z1: 158, cx: -26, cz: 54, feather: 42, flatten: 0.84, relief: 0.16 },
    roads: { paths: [
      // The timber loading lane hooks around the garage yard. The diagonal
      // clearcut route passes its open end, creating an exposed crossing.
      [[-294, 56], [-230, 50], [-116, 24], [-36, 18], [-36, 114], [40, 114], [104, 140], [228, 10]],
      [[-380, -460], [-308, -298], [-258, -128], [-294, 56], [-258, 246], [-206, 464]],
      [[-100, -466], [-132, -308], [-144, -150], [-36, 18], [104, 140], [210, 288], [310, 462]],
      [[334, -460], [264, -314], [282, -158], [228, 10], [294, 184], [306, 332], [354, 464]],
      [[-306, 280], [-172, 236], [-28, 256], [104, 224], [228, 254], [354, 278]],
    ] },
    marshes: [{ x: -342, z: -124, r: 38, dip: 0.9 }, { x: -334, z: -32, r: 35, dip: 0.9 }, { x: -350, z: 158, r: 36, dip: 0.8 }],
    // One worked southern harvest, following the existing stump/log stations.
    // Irregular edges leave fingers of regrowth beside the retained pine belt;
    // the rest of the diagonal opening remains older, grassed-over ground.
    workedGround: [{ feather: 14, strength: 1, boundary: [
      [-198, -298], [-166, -320], [-134, -298], [-128, -274],
      [-86, -256], [-73, -211], [-43, -197], [-35, -158],
      [1, -134], [8, -112], [43, -84], [22, -59],
      [-23, -68], [-47, -101], [-67, -135], [-73, -165],
      [-126, -193], [-136, -235], [-176, -259],
    ] }],
    landforms: [
      { kind: 'ridge', x: -210, z: -62, length: 330, width: 70, height: 7.2, yawDeg: -24 },
      { kind: 'ridge', x: 226, z: 90, length: 330, width: 74, height: 7.8, yawDeg: -28 },
      { kind: 'ridge', x: 30, z: -240, length: 230, width: 64, height: 6.4, yawDeg: 72 },
      { kind: 'knoll', x: -102, z: 286, rx: 90, rz: 72, height: 6.8 },
      { kind: 'basin', x: -338, z: 0, rx: 74, rz: 192, height: -3.4, wetScale: 0.4 },
      { kind: 'knoll', x: 344, z: -222, rx: 60, rz: 76, height: 5.2 },
    ],
  },
  spawns: { player: { x: -118, z: -390 }, enemies: [
    { x: -252, z: 386 }, { x: -168, z: 424 }, { x: -84, z: 380 }, { x: 0, z: 426 },
    { x: 84, z: 382 }, { x: 168, z: 424 }, { x: 252, z: 386 },
  ] },
  splat: { sourcedPalette: 'verdant', townWear: 1.6, fieldPatch: 0.6, midRelief: 0.80, tintA: [0.82, 0.97, 0.65], tintB: [0.54, 0.70, 0.48], tintC: [1.0, 1.02, 0.73], roadTint: [0.69, 0.61, 0.48] },
  vegetation: {
    species: ['pine', 'cedar', 'oak'], clusterMix: [['pine', 0.70], ['cedar', 0.2], ['oak', 0.1]],
    loneMix: [['pine', 0.64], ['cedar', 0.20], ['oak', 0.16]], rimMix: [['pine', 0.72], ['cedar', 0.22], ['oak', 0.06]],
    clusterCount: 62, loneCount: 86, rimCount: 104, grassDensity: 1.0, bushCount: 1.1, bushSpecies: 'oak', clusterScrub: 1.8,
    // The two existing west loading bays are worked short. Keep every grass
    // record and the terrain/prop safety masks; only its height is reduced.
    stubblePatches: [
      { x0: -109, x1: -78, z0: 56, z1: 72, feather: 4, heightScale: 0.16 },
      { x0: -109, x1: -78, z0: 92, z1: 108, feather: 4, heightScale: 0.16 },
    ],
    // Remove the random grove layer from the harvested swath; the two
    // planted edge belts below remain outside these clearing discs.
    avoid: [{ x: -150, z: -266, r: 70 }, { x: -74, z: -170, r: 70 }, { x: 14, z: -64, r: 70 }, { x: 96, z: 30, r: 70 }, { x: 178, z: 128, r: 70 }, { x: 258, z: 216, r: 70 }],
    belts: [
      { x0: -244, z0: -304, x1: 206, z1: 202, gap: 21, jitter: 5, skip: 0.18, species: 'pine' },
      { x0: -72, z0: -278, x1: 328, z1: 208, gap: 22, jitter: 5, skip: 0.18, species: 'pine' },
    ],
  },
  props: {
    sourcedPalette: 'frontier',
    loggingYard: {
      // Existing flatbeds load beside grounded cut timber inside the western
      // garage apron. The existing access loop and defensive bay stay clear.
      flatbeds: [{ x: -84, z: 64, yaw: 0 }, { x: -84, z: 100, yaw: 0 }],
      bundles: [
        { x: -104, z: 64, yaw: -Math.PI / 2 }, { x: -103.2, z: 64, yaw: -Math.PI / 2 },
        { x: -102.4, z: 64, yaw: -Math.PI / 2 }, { x: -101.6, z: 64, yaw: -Math.PI / 2 },
        { x: -100.8, z: 64, yaw: -Math.PI / 2 },
        { x: -104, z: 100, yaw: -Math.PI / 2 }, { x: -103.2, z: 100, yaw: -Math.PI / 2 },
        { x: -102.4, z: 100, yaw: -Math.PI / 2 }, { x: -101.6, z: 100, yaw: -Math.PI / 2 },
        { x: -100.8, z: 100, yaw: -Math.PI / 2 },
      ],
      clearcut: [[-114, -238], [-74, -176], [-20, -100]],
    },
    plan: ['rangerlodge', 'woodshed', 'depot', 'barn', 'logcabin', 'warehouse', 'woodshed', 'tavern', 'granary', 'depot', 'logcabin', 'ruin', 'woodshed', 'barn', 'farmhouse', 'rangerlodge', 'depot', 'logcabin'],
    destructibleBuildings: ['leanto', 'huntingblind', 'fieldhut', 'servicegarage'],
    buildingLat: [13, 2], destructibleBuildingLat: [17, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'crossing-timber-yard', role: 'brawl', x: -64, z: 74, yawDeg: 90, structure: 'servicegarage', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'eastern-cut-fire-watch', role: 'scout', x: 264, z: 52, yawDeg: -90, structure: 'huntingblind', outcrop: { count: 4, radius: 9 } },
      { id: 'western-creek-camp', role: 'support', x: -268, z: 238, yawDeg: 90, structure: 'leanto', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.62,
    wallRuns: [[-118, 52, -118, 114, 2], [-108, 142, -44, 142, 3], [4, 68, 70, 68, 2], [4, 68, 4, -2, 3], [-300, 208, -300, 282, 2], [292, 10, 292, 88, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 164, outcrops: 24, craters: 48, rubblePiles: 10, cropFields: 2, sandbagLines: 14, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['m1a1', 'm2a2_bradley', 'm551_sheridan', 'm60a3', 'm1a2_sepv3'] },
    inhabit: { stalls: 1, benches: 3, coreClutter: 18, bales: 6, troughs: 2, laundry: 2, handcarts: 3, carts: 4, trucks: 6, jeeps: 4, drumClusters: 4, camps: 4, modernClutter: 18, looseClutter: 22, roadFence: 'fenceplank', yardFence: 'fenceplank' },
  },
  horizon: { baseHex: 0x52674a, amp: 1.0, style: 'rolling', treeline: 0.92, forestHex: 0x2c4b33, rockHex: 0x747664, haze: 0.92, grain: 0.58 },
  sky: { ...frontier.sky, sunElevationDeg: 24, sunAzimuthDeg: 108, fogDensity: 0.00062, fogTintHex: 0x8f9f9c, fogMix: 0.52, cloudOpacity: 1.05, cloudOpacity2: 0.72, sunIntensity: 3.7 },
  minimap: { ...frontier.minimap, base: [73, 95, 59], hard: [105, 96, 73], soft: [44, 65, 48] },
  shot: { pos: [-244, 50, -250], look: [50, 1, 100] },
} satisfies import('./contracts.ts').MapCompositionConfig;
