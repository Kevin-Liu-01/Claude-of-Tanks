// A logging country T-junction with a diagonal clearcut, a wet western
// bypass and a screened eastern spur. Planted belts define the cut edges.
//
// Reference: Longleaf, Rapides Parish, Louisiana — the Crowell Long Leaf Lumber Company's sawmill town in the longleaf
// pine flatwoods (its mill now the Southern Forest Heritage Museum), crossed in September 1941 by the Louisiana
// Maneuvers: the mill and its burner by the log pond, the planer mill and lumber sheds, the dry kilns, the logging
// railroad's engine shed and water tank, the commissary on its loading platform, the boarding house, the manager's
// raised cottage, the workers' shotgun and dogtrot houses on brick piers under tin, the clearcuts and the planted pine.
//
// 2026-10-05 (the map-revival lane; the owner: "make sure all maps look completely new and revitalized like verdant"):
// the town is built in that construction (maps/regional/longleaf.ts), every building where it stood, the houses' yards
// fenced in plank with their privies and gardens; the pines grow as longleaf pine over its grass-stage seedlings
// (treeBiomes.ts).
import frontier from './frontier.ts';
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'longleaf', name: 'Longleaf Crossing',
  blurb: 'Pine clearcuts, timber yards and a winding logging spur around a wooded creek hollow',
  terrain: {
    hillScale: 0.88, microScale: 0.76, rimH: 30,
    village: { x0: -142, x1: 92, z0: -54, z1: 158, cx: -26, cz: 54, feather: 42, flatten: 0.84, relief: 0.16 },
    roads: { paths: roundRoadBends([
      // The timber loading lane hooks around the garage yard. The diagonal
      // clearcut route passes its open end, creating an exposed crossing.
      [[-294, 56], [-230, 50], [-116, 24], [-36, 18], [-36, 114], [40, 114], [104, 140], [228, 10]],
      [[-380, -460], [-308, -298], [-258, -128], [-294, 56], [-258, 246], [-206, 464]],
      [[-100, -466], [-132, -308], [-144, -150], [-36, 18], [104, 140], [210, 288], [310, 462]],
      [[334, -460], [264, -314], [282, -158], [228, 10], [294, 184], [306, 332], [354, 464]],
      [[-306, 280], [-172, 236], [-28, 256], [104, 224], [228, 254], [354, 278]],
    ]) },
    marshes: [{ x: -342, z: -124, r: 38, dip: 0.9 }, { x: -334, z: -32, r: 35, dip: 0.9 }, { x: -350, z: 158, r: 36, dip: 0.8 }],
    // (the map-revival lane, round 2; gauntlet wave 124: "no log pond … in any frame"): the mill's log pond at the foot of
    // its slip, the logs floated down to it from the woods
    softLakes: true,
    lakes: [{ x: -52, z: 136, r: 12, depth: 1.1, boats: 0 }],
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
      // 2026-10-02 (maps lane B): the pine swell south of the northern landing, which screens it from the southern
      // assembly height across the hollow.
      { kind: 'ridge', x: -10, z: 304, length: 300, width: 60, height: 7.5, yawDeg: 2, corridorScale: 1 },
    ],
  },
  spawns: { player: { x: -118, z: -390 }, enemies: [
    { x: -252, z: 386 }, { x: -168, z: 424 }, { x: -84, z: 380 }, { x: 0, z: 426 },
    { x: 84, z: 382 }, { x: 168, z: 424 }, { x: 252, z: 386 },
  ] },
  splat: { sourcedPalette: 'verdant', townWear: 1.6, fieldPatch: 0.6, midRelief: 0.80, tintA: [0.82, 0.97, 0.65], tintB: [0.54, 0.70, 0.48], tintC: [1.0, 1.02, 0.73], roadTint: [0.69, 0.61, 0.48] },
  vegetation: {
    // (round 2, wave 124: "saturated broccoli-crowned blobs rather than tall, sparse-crowned longleaf"): the flatwoods are
    // longleaf alone — open groves over the wiregrass (treeBiomes `open`), the grass-stage seedlings for scrub — and the
    // hardwoods keep to the creek bottom (the belts below)
    species: ['pine', 'cedar', 'oak'], clusterMix: [['pine', 1.0]],
    loneMix: [['pine', 0.96], ['oak', 0.04]], rimMix: [['pine', 0.92], ['oak', 0.08]],
    clusterCount: 62, loneCount: 86, rimCount: 104, grassDensity: 1.0, bushCount: 0.9, bushSpecies: 'pine', clusterScrub: 0.5,
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
      // the creek bottom's hardwoods (water oak and sweetgum in the oak slot) along the basin's two banks
      { x0: -356, z0: -196, x1: -352, z1: 196, gap: 13, jitter: 4, skip: 0.2, species: 'oak' },
      { x0: -322, z0: -186, x1: -318, z1: 186, gap: 15, jitter: 4, skip: 0.3, species: 'oak' },
    ],
  },
  props: {
    sourcedPalette: 'frontier',
    // the map-revival lane (2026-10-05): the mill-town kit (maps/regional/longleaf.ts) builds the plan in the company
    // town's construction, every building where it stood
    architecture: 'longleaf',
    // The landmarks lane (2026-10-06; src/world/landmarks/towers.ts fireLookout): the forest's fire lookout on the western
    // ridge's crest, the highest open ground of the pine country — a steel lattice tower 26 m to its glazed cab, the
    // zig-zag stair inside its frame, seen over the canopy from both deployments.
    landmarks: [
      // round 2 (2026-10-06; gauntlet waves 154-158: the set pieces "in no setting"): the towerman's compound round the
      // tower's foot, its split-rail fence and gate toward the road, and the beaten track from the gate down to the forest
      // road (both dressing pieces, authored before the tower: they refuse nothing)
      { kind: 'garden', x: -216, z: -46, yawDeg: -90, name: "the lookout's compound", params: { width: 16, depth: 16, fence: 'fencerail', beds: false, path: 0, back: 'fence' } },
      { kind: 'path', x: -246.6, z: -51.35, yawDeg: -102.4, name: "the track from the lookout to the road", params: { length: 44, width: 2.6, surface: 'earth' } },
      { kind: 'fireLookout', x: -216, z: -46, yawDeg: 0, name: 'the fire lookout on the western ridge', params: { height: 26 } },
    ],
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
    // (round 2, wave 124: "a breeze-block shed", "a log cabin"): the town's own board sheds — lean-tos, the fire watch,
    // board shacks and a creek camp on stilts
    destructibleBuildings: ['leanto', 'huntingblind', 'fishershack', 'stilthouse'],
    buildingLat: [13, 2], destructibleBuildingLat: [17, 3], sideSkip: 0.18, spacingPad: 8,
    tacticalBeats: [
      { id: 'crossing-timber-yard', role: 'brawl', x: -64, z: 74, yawDeg: 90, structure: 'leanto', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'eastern-cut-fire-watch', role: 'scout', x: 310, z: -60, yawDeg: -90, structure: 'huntingblind', outcrop: { count: 4, radius: 9 } },
      { id: 'western-creek-camp', role: 'support', x: -268, z: 238, yawDeg: 90, structure: 'stilthouse', redoubt: true, outcrop: { count: 5, radius: 10 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.62,
    // (round 2, wave 124: "cut stone"): no fieldstone walls in the Louisiana pinewoods — the yards are fenced in plank
    wallRuns: [],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 30, outcrops: 0, craters: 48, rubblePiles: 10, cropFields: 2, sandbagLines: 14, hedgehogs: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: { stalls: 1, benches: 3, coreClutter: 18, bales: 6, troughs: 2, laundry: 2, handcarts: 3, carts: 4, trucks: 6, jeeps: 4, drumClusters: 4, camps: 4, modernClutter: 18, looseClutter: 22, roadFence: 'fenceplank', yardFence: 'fenceplank' },
  },
  // the map-revival lane (2026-10-05, round 2; gauntlet wave 124: "no log pond, lumber stacks or working mill yard"): the
  // mill yard between the sawmill and the loading flatbeds — the sawn pine stickered in its drying stacks — and the log deck
  // beside the slip down to the pond (maps/sceneryKit.ts lumberstack, logdeck)
  scenery: {
    landmarks: [
      ...[[-76, 88], [-76, 97], [-76, 106], [-68, 88], [-68, 97], [-68, 106]].map(([x, z], i) => (
        { kind: 'lumberstack' as const, x, z, yawDeg: 2 * ((i % 3) - 1), name: `the drying stacks ${i + 1}` })),
      { kind: 'logdeck', x: -63, z: 117, yawDeg: 0, name: 'the log deck at the slip' },
    ],
  },
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): longleaf pine flatwoods: flat, the
  // skyline its pine woods
  // 2026-10-05 (the map-revival lane, round 2; gauntlet wave 124: hill-country relief and "a flat water-like band on the
  // horizon" behind the flatwoods — the plain panorama's far band reads as sea, as it did on Kestrel): the ring closes in
  // two rows of pinewoods and the far country is the flatwoods' low swells under the haze
  horizon: { baseHex: 0x52674a, amp: 0.3, style: 'rolling', treeline: 0.95, treelineLayers: 2, panorama: { regional: 'upland', ampM: 110, trees: 22 }, forestHex: 0x2c4b33, rockHex: 0x747664, haze: 0.92, grain: 0.58 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.32, streets: 0.5, towers: 0.2, rain: 0.3 },
  sky: { ...frontier.sky, sunElevationDeg: 24, sunAzimuthDeg: 108, fogDensity: 0.00062, fogTintHex: 0x8f9f9c, fogMix: 0.52, cloudOpacity: 1.05, cloudOpacity2: 0.72, sunIntensity: 3.7 },
  minimap: { ...frontier.minimap, base: [73, 95, 59], hard: [105, 96, 73], soft: [44, 65, 48] },
  shot: { pos: [-244, 50, -250], look: [50, 1, 100] },
} satisfies import('./contracts.ts').MapCompositionConfig;
