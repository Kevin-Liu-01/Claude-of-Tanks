// A working reclaimed wetland: offset drainage cells leave a dry diagonal
// causeway, a western farm loop and an eastern pumping-station approach.
export default {
  id: 'polders', name: 'Tidegate Polders',
  blurb: 'Pump-controlled retention basins, windbreak farms and raised causeways across reclaimed coastal fields',
  terrain: {
    hillScale: 0.72, microScale: 0.64, rimH: 18, clearMarshVeg: true, softLakes: true,
    village: { x0: -178, x1: 68, z0: -96, z1: 122, cx: -64, cz: 12, feather: 42, flatten: 0.88, relief: 0.12 },
    roads: { paths: [
      // The mill lane folds around a compact farm court before joining the
      // raised diagonal causeway; field bypasses stay outside the settlement.
      [[-280, -100], [-144, -62], [-80, -62], [-80, 56], [-26, 56], [24, -62], [180, -120], [266, -102]],
      [[-380, -462], [-310, -286], [-280, -100], [-304, 104], [-248, 296], [-170, 466]],
      [[-126, -462], [-124, -288], [-100, -140], [-26, -12], [96, 112], [218, 280], [320, 458]],
      [[370, -452], [298, -274], [266, -102], [288, 72], [338, 260], [376, 456]],
      [[-304, 104], [-220, 170], [-82, 170], [72, 202], [216, 212], [338, 260]],
    ] },
    // Five distinct drainage landforms, not repeated ornamental ponds. Long
    // eroded drains, a broad retention bay and an offset hooked basin share
    // sixteen authored stations / the existing 64-sample canonical contour.
    lakes: [
      // Narrow north/south field drain; unequal ends avoid a capsule outline.
      { x: -204, z: -281, r: 102, level: 1.4,
        radii: [0.20, 0.23, 0.30, 0.49, 1.00, 0.44, 0.26, 0.21,
          0.24, 0.26, 0.34, 0.48, 0.78, 0.42, 0.31, 0.24] },
      // Broad retention bay with a sheltered southwest inlet.
      { x: 117, z: -257, r: 70, level: -2.6,
        radii: [0.91, 0.95, 0.91, 0.78, 0.71, 0.68, 0.86, 0.92,
          0.84, 0.70, 0.48, 0.60, 0.77, 0.78, 0.90, 0.96] },
      // One-sided hooked elbow below the pumping station's dry bank.
      { x: 166, z: -6, r: 73, level: -3.3,
        radii: [0.76, 0.78, 0.73, 0.63, 0.66, 0.95, 0.61, 0.42,
          0.38, 0.44, 0.51, 0.66, 0.91, 0.89, 0.81, 0.75] },
      // East/west oxbow and a separately oriented tapering overflow reach.
      { x: -163, z: 267, r: 61, level: 0,
        radii: [0.87, 0.63, 0.33, 0.22, 0.23, 0.35, 0.53, 0.87,
          1.00, 0.85, 0.50, 0.29, 0.26, 0.29, 0.47, 0.73] },
      { x: 100, z: 286, r: 72, level: -5.4,
        radii: [0.90, 1.00, 0.60, 0.37, 0.34, 0.34, 0.40, 0.62,
          0.89, 0.72, 0.48, 0.39, 0.35, 0.40, 0.55, 0.73] },
    ],
    marshes: [],
    landforms: [
      { kind: 'ridge', x: -226, z: 0, length: 550, width: 44, height: 4.8, yawDeg: 0 },
      { kind: 'ridge', x: 224, z: 12, length: 540, width: 46, height: 4.5, yawDeg: -4 },
      { kind: 'ridge', x: 10, z: 70, length: 360, width: 52, height: 5.2, yawDeg: -40, wetScale: 0.2 },
      { kind: 'knoll', x: -354, z: 74, rx: 66, rz: 84, height: 4.6 },
      { kind: 'basin', x: 114, z: -238, rx: 88, rz: 76, height: -2.2 },
      { kind: 'ridge', x: -18, z: 300, length: 180, width: 40, height: 4.0, yawDeg: 88 },
    ],
  },
  spawns: { player: { x: -94, z: -390 }, enemies: [
    // The second pad sits clear of the west causeway's graded shoulder.
    { x: -246, z: 390 }, { x: -152, z: 426 }, { x: -92, z: 378 }, { x: -10, z: 420 },
    { x: 76, z: 386 }, { x: 162, z: 422 }, { x: 248, z: 388 },
  ] },
  splat: { sourcedPalette: 'verdant',
    fieldPatch: 1.25, seaLake: true, seaFoam: 0.05, seaRamp: [0.12, 0.48], shoreDirt: true, iceDrift: 0.02,
    marshGloss: 0.82, iceSky: [0.30, 0.42, 0.43], midRelief: 0.64,
    tintA: [0.84, 1.01, 0.66], tintB: [0.60, 0.76, 0.51], tintC: [1.08, 1.08, 0.78], roadTint: [0.76, 0.72, 0.61],
  },
  vegetation: {
    species: ['poplar', 'willow', 'oak'], clusterMix: [['willow', 0.48], ['poplar', 0.36], ['oak', 0.16]],
    loneMix: [['poplar', 0.62], ['willow', 0.28], ['oak', 0.10]], rimMix: [['poplar', 0.54], ['willow', 0.34], ['oak', 0.12]],
    clusterCount: 42, loneCount: 64, rimCount: 72, grassDensity: 1.02, bushCount: 0.9, bushSpecies: 'willow',
    belts: [
      { x0: -192, z0: -182, x1: -188, z1: 208, gap: 17, jitter: 1.6, species: 'poplar' },
      { x0: 190, z0: -328, x1: 208, z1: -98, gap: 18, jitter: 1.2, species: 'willow' },
    ],
    authoredTrees: [
      // Existing poplars move onto the field headland, outside the protected
      // farm court; crossings retain their ordinary empty road shoulders.
      { id: 'west-field-headland', species: 'poplar', path: [[-226, -174], [-232, -50], [-238, 102]], count: 22, width: 0.4 },
      { id: 'north-field-headland', species: 'poplar', path: [[-204, 150], [-142, 150], [-78, 150]], count: 12, width: 0.4 },
      { id: 'east-drain-willow-edge', species: 'willow', path: [[120, -321], [139, -317], [165, -310], [187, -287], [191, -260]], count: 18, width: 0.5 },
    ],
  },
  props: {
    sourcedPalette: 'coastal',
    plan: ['mill', 'farmhouse', 'granary', 'fishery', 'depot', 'cottage', 'woodshed', 'tavern', 'farmhouse', 'barn', 'barn', 'cottage', 'granary', 'ruin', 'depot', 'woodshed', 'farmhouse', 'barn'],
    destructibleBuildings: ['fieldhut', 'fishershack', 'transformershed', 'huntingblind'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'tidegate-pump-yard', role: 'brawl', x: 244, z: 24, yawDeg: 75, structure: 'transformershed', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
      { id: 'western-windbreak-hide', role: 'scout', x: -334, z: 22, yawDeg: 90, structure: 'huntingblind', outcrop: { count: 4, radius: 8 } },
      { id: 'causeway-farm-store', role: 'support', x: -48, z: 228, yawDeg: 175, structure: 'fieldhut', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.45,
    wallRuns: [[-174, -40, -174, 16, 2], [-168, 90, -108, 90, 2], [-54, -88, 10, -88, 3], [246, 58, 246, 126, 2], [-84, 250, -14, 250, 3], [-76, 198, -76, 264, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 18, rocks: 112, outcrops: 12, craters: 48, rubblePiles: 10, cropFields: 10, sandbagLines: 14, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true },
    inhabit: { stalls: 2, benches: 3, coreClutter: 18, bales: 12, stooks: 12, troughs: 2, laundry: 3, handcarts: 3, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 2, modernClutter: 18, looseClutter: 18, roadFence: 'fenceplank', yardFence: 'fencepicket' },
  },
  horizon: { baseHex: 0x697a59, amp: 0.18, style: 'rolling', treeline: 0.30, forestHex: 0x3c5840, rockHex: 0x818577, haze: 0.94, grain: 0.5 },
  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },
  minimap: { base: [88, 112, 69], hard: [122, 117, 90], soft: [54, 80, 67], forest: 'rgba(44,78,43,.84)', forestStroke: 'rgba(26,51,27,.92)', water: 'rgba(66,103,114,.84)', waterStroke: 'rgba(35,67,78,.94)', roadCasing: 'rgba(54,47,36,.92)', roadFill: 'rgba(188,176,144,.96)', buildingFill: '#d3ccb9' },
  shot: { pos: [-268, 46, -256], look: [28, 1, 112] },
} satisfies import('./contracts.ts').MapCompositionConfig;
