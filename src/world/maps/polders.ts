// src/world/maps/polders.ts — Tidegate Polders, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The five drainage basins, the farm court on the mill lane's loop, the pumping station, the roads, the palette, sky,
// sea, vegetation, name and id are the map's identity and stay; the ground between them is new. The old ground rolled
// like upland pasture (hillScale 0.72), not reclaimed land. Alpha's pad stood in sight of bravo's arc, bravo's seven
// pads spread 500 m along the north edge, and the zone-control discs stood up to 1.3 times farther from one team.
//
// Reference: the polders of the Scheldt estuary (South Beveland and Walcheren, autumn 1944): reclaimed clay fields
// boxed by dykes, roads along the dykes, poplar windbreaks, farms round paved yards, a pumping station at the tidegate,
// and drainage basins held at different levels.
//
// The story on the ground: the old land in the west stands a few metres above the new polders in the east, which
// sank after they were drained, and the basins step down with it, from the field drain in the south-west at +1.4 m to
// the overflow reach in the north-east at -5.4 m. The farm court stands where the causeway crosses the mill lane. The
// main dyke runs east and west through the middle of the polder, broken by a sluice in the west, and the pumping
// station works the hooked basin below it. Narrow field dykes box the polder: cross dykes face the deployments and
// long dykes run between the lanes, and the roads cut through them. Alpha deploys behind the southern cross dyke and
// bravo behind the northern one. The zone-control discs are the farm court's paved yard and a field on each side of
// it, the second within 8 m of the first's rotation about the farm court.
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'polders', name: 'Tidegate Polders',
  blurb: 'Pump-controlled retention basins, windbreak farms and raised causeways across reclaimed coastal fields',
  terrain: {
    hillScale: 0.42, microScale: 0.4, rimH: 18, clearMarshVeg: true, softLakes: true,
    // The farm court's paved yard, inside the mill lane's loop: the zone-control placement seats its middle disc there.
    hardstands: [{ x: -40, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0 }],
    village: { x0: -178, x1: 68, z0: -96, z1: 122, cx: -64, cz: 12, feather: 42, flatten: 0.88, relief: 0.12 },
    roads: { paths: roundRoadBends([
      // The mill lane folds around a compact farm court before joining the
      // raised diagonal causeway; field bypasses stay outside the settlement.
      [[-280, -100], [-144, -62], [-80, -62], [-80, 56], [-26, 56], [24, -62], [180, -120], [266, -102]],
      [[-380, -462], [-310, -286], [-280, -100], [-304, 104], [-248, 296], [-170, 466]],
      [[-126, -462], [-124, -288], [-100, -140], [-26, -12], [96, 112], [218, 280], [320, 458]],
      [[370, -452], [298, -274], [266, -102], [288, 72], [338, 260], [376, 456]],
      [[-304, 104], [-220, 170], [-82, 170], [72, 202], [216, 212], [338, 260]],
    ]) },
    // Five distinct drainage landforms, not repeated ornamental ponds. Long
    // eroded drains, a broad retention bay and an offset hooked basin share
    // sixteen authored stations / the existing 64-sample canonical contour.
    lakes: [
      // Narrow north/south field drain; unequal ends avoid a capsule outline.
      // The narrow drain needs a wider dry apron around its angular bends;
      // its wet contour stays fixed and the roads retain their own support.
      { x: -204, z: -281, r: 102, level: 1.4, bankBand: 4,
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
      // the main dyke's western half, broken by a sluice where the west drain's outfall crosses it
      { kind: 'ridge', x: -171, z: 0, length: 440, width: 44, height: 4.8, yawDeg: 0 },
      { kind: 'ridge', x: -446, z: 0, length: 110, width: 44, height: 4.8, yawDeg: 0 },
      { kind: 'ridge', x: 224, z: 12, length: 540, width: 46, height: 4.5, yawDeg: -4 },
      { kind: 'ridge', x: 10, z: 70, length: 360, width: 52, height: 5.2, yawDeg: -40, wetScale: 0.2 },
      { kind: 'knoll', x: -354, z: 74, rx: 66, rz: 84, height: 4.6 },
      { kind: 'basin', x: 114, z: -238, rx: 88, rz: 76, height: -2.2 },
      { kind: 'ridge', x: -18, z: 300, length: 180, width: 40, height: 4.0, yawDeg: 88 },
      // The old land in the west stands higher than the new polders in the east, whose basins lie lower.
      { kind: 'knoll', x: -470, z: 20, rx: 320, rz: 640, height: 7, wetScale: 0.2 },
      { kind: 'basin', x: 470, z: -10, rx: 300, rz: 640, height: -3, wetScale: 0.2 },
      // Field dykes: narrow earth banks on the field grid, cross dykes facing the deployments and long dykes between
      // the lanes; the roads cut through them at grade.
      ...[[-60, -282, 300, 0, 22], [-68, 306, 300, 0, 22], [-15, -150, 150, 0], [-113, 174, 150, 0],
        [250, -210, 180, 0], [-378, 234, 180, 0], [-180, -178, 144, 90], [52, 202, 144, 90], [100, -135, 230, 90],
        [-228, 159, 230, 90],
      ].map(([x, z, length, yawDeg, width = 18]) => ({ kind: 'ridge', x, z, length, width, height: 3.8, yawDeg })),
    ],
  },
  // Bravo's seven pads stand in two staggered rows 62 m apart behind the northern cross dyke, their centroid near the
  // rotation of alpha's pad about the farm court. 812 m between the anchors.
  spawns: { player: { x: -94, z: -390 }, enemies: [
    { x: -34, z: 450 }, { x: -65, z: 398 }, { x: -3, z: 398 }, { x: -127, z: 398 },
    { x: 59, z: 398 }, { x: -96, z: 450 }, { x: 28, z: 450 },
  ] },
  splat: { sourcedPalette: 'polders', // (ground lane, wave 248: the polders' own clay, not Verdant's black earth)
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
    // regional-buildings lane: the Zeeland polder kit (maps/regional/polder.ts)
    architecture: 'polder',
    sourcedPalette: 'coastal',
    plan: ['mill', 'farmhouse', 'granary', 'fishery', 'depot', 'cottage', 'woodshed', 'tavern', 'farmhouse', 'barn', 'barn', 'cottage', 'granary', 'ruin', 'depot', 'woodshed', 'farmhouse', 'barn'],
    destructibleBuildings: ['fieldhut', 'fishershack', 'transformershed', 'huntingblind'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'tidegate-pump-yard', role: 'brawl', x: 250, z: 0, yawDeg: 75, structure: 'transformershed', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
      { id: 'western-windbreak-hide', role: 'scout', x: -334, z: 22, yawDeg: 90, structure: 'huntingblind', outcrop: { count: 4, radius: 8 } },
      { id: 'causeway-farm-store', role: 'support', x: -48, z: 228, yawDeg: 175, structure: 'fieldhut', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.45,
    wallRuns: [[-174, -40, -174, 16, 2], [-168, 90, -108, 90, 2], [-54, -88, 10, -88, 3], [246, 58, 246, 126, 2], [-84, 250, -14, 250, 3], [-76, 198, -76, 264, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 18, rocks: 112, outcrops: 12, craters: 48, rubblePiles: 10, cropFields: 10, sandbagLines: 14, hedgehogs: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: { stalls: 2, benches: 3, coreClutter: 18, bales: 12, stooks: 12, troughs: 2, laundry: 3, handcarts: 3, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 2, modernClutter: 18, looseClutter: 18, roadFence: 'fenceplank', yardFence: 'fencepicket' },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the drainage machinery of a
  // Zeeland polder. A steel windmotor stands on the bank of each low basin it lifts water out of, every rotor turned
  // into the same sea wind; a 150 kV line on lattice towers strides across the flats from the old land to the new.
  scenery: {
    landmarks: [
      { kind: 'windpump', x: 82, z: -206, yawDeg: 300, name: 'the windmotor on the retention bay' },
      { kind: 'windpump', x: 36, z: 250, yawDeg: 300, name: 'the windmotor on the overflow reach' },
      { kind: 'windpump', x: -122, z: 228, yawDeg: 300, name: 'the windmotor by the oxbow' },
    ],
    powerLines: [{ towers: [[-440, -330], [-150, -140], [120, 90], [430, 260]], heightM: 32, name: 'the 150 kV line' }],
  },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): a second skyline rank of windbreak crowns on
  // the very low ring, sparse stone heaps on the outland (treeline 0.30 fell in the rockfield's dead zone) and more
  // tone grain (0.5 -> 0.60); the authored 0.18 amplitude is unchanged
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): below-sea-level Zeeland — dykes and
  // poplar rows, no range: the far country plain
  horizon: { baseHex: 0x697a59, amp: 0.18, style: 'rolling', treeline: 0.30, treelineLayers: 2, panorama: { regional: 'plain', trees: 14 }, outlandRocks: 0.40, forestHex: 0x3c5840, rockHex: 0x818577, haze: 0.94, grain: 0.60 },
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the broken deck (1.1 / 0.72) missed the low-stratus
  // auto branch (0.95 / 0.90 and turbidity 7), so over the flattest ring in the game the 620 m deck was fully hazed
  // at 2-12° — an explicit 420 m North Sea stratocumulus of 2600 m masses; light patchiness (cloudShadowAmp 0.18)
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'broken-stratocumulus', baseM: 600, coverage: 0.68, streets: 0.4, cells: 0.8, cellM: 750, fogBank: 0.35, fogBankTopM: 80, contrails: 0.5, contrailAge: 0.75, nightGlow: 0.6, nightGlowHex: 0xffb070 },
  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, cloudAltM: 420, cloudHazeK: 0.00016, cloudUvM: 2600, cloudShadowAmp: 0.18, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },
  minimap: { base: [88, 112, 69], hard: [122, 117, 90], soft: [54, 80, 67], forest: 'rgba(44,78,43,.84)', forestStroke: 'rgba(26,51,27,.92)', water: 'rgba(66,103,114,.84)', waterStroke: 'rgba(35,67,78,.94)', roadCasing: 'rgba(54,47,36,.92)', roadFill: 'rgba(188,176,144,.96)', buildingFill: '#d3ccb9' },
  shot: { pos: [-268, 46, -256], look: [28, 1, 112] },
  // round 66 (2026-09-24, the FFT ocean): the polders' drained lakes take the sea wind across the flats — a short
  // steady chop that reads as moving water where the sheet lay flat
  ocean: { windSpeed: 3.6, windDirDeg: 300, fetchKm: 5, amplitude: 0.9, foam: 0.05, breakers: 0.2, caustics: 0.3 },
} satisfies import('./contracts.ts').MapCompositionConfig;
