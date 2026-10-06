// Orchard Valley: a cultivated valley of contour-planted orchard rows, cedar edges, a village with its bathhouse and
// market and three stepped farm tracks.
//
// Reference: the Chouf on Mount Lebanon — the terraced valley below the Barouk and Ain Zhalta cedar forest, between
// Beiteddine and Deir el Qamar: olive and apple terraces held by dry stone walls down the valley sides, stone pines and
// the cedars on the upper slopes, and the mountain village of the 19th century in dressed cream sandstone — the
// central-hall house (dar) under its red Marseille tiles with the triple arch (qanatir) over the door, the older houses
// under flat earth roofs with their stone rollers, the hammam's domes, the souk's vaulted shops, the sabil fountain, the
// church's open bell arch.
//
// 2026-10-05 (the map-revival lane; the owner: "make sure all maps look completely new and revitalized like verdant"):
// the village is built in that construction (maps/regional/chouf.ts), every building where it stood, the gardens walled
// behind the houses with their vine arbors (the kit's yards); the orchards grow as olives, the pines as the
// Mediterranean pines and the cedars as the cedar of Lebanon (treeBiomes.ts).
import verdant from './verdant.ts';
import { roundRoadBends } from './roadBends.ts';
export default {
  id: 'orchard', name: 'Orchard Valley',
  blurb: 'Terraced orchard rows, cedar groves and a quiet bathhouse village along a winding valley road',
  terrain: {
    hillScale: 1.0, microScale: 0.72, rimH: 32,
    village: { x0: -106, x1: 108, z0: -92, z1: 112, cx: -6, cz: 12, feather: 42, flatten: 0.86, relief: 0.12 },
    // (round 2, gauntlet wave 123: the buildings "set on lawns"): the village ground in its plots — the walled yards,
    // kitchen gardens and threshing floors running back from the lanes (terrain.ts createVillagePlotWear)
    villageWear: 'plots',
    roads: { paths: roundRoadBends([
      // The bathhouse street bends into the packing court; the second
      // frontage below turns back around it instead of stringing homes out.
      [[-88, -466], [-48, -290], [-32, -128], [-44, -66], [-20, -12], [34, 30], [50, 114], [6, 308], [68, 466]],
      [[-360, -460], [-328, -286], [-218, -172], [-302, 6], [-222, 172], [-258, 314], [-180, 464]],
      [[324, -458], [262, -300], [308, -132], [224, 18], [286, 164], [252, 320], [288, 466]],
      [[-218, -172], [-112, -88], [-76, -18], [-20, -12], [24, -48], [98, -56], [202, -100], [308, -132]],
      [[-324, 196], [-222, 172], [-100, 204], [50, 146], [178, 196], [330, 224]],
    ]) },
    marshes: [{ x: 136, z: -128, r: 28, dip: 0.7 }, { x: -120, z: 230, r: 29, dip: 0.8 }],
    landforms: [
      // the valley's two flanks (2026-10-02, maps lane B: set back to the valley's real sides, off Verdant's skeleton)
      { kind: 'ridge', x: -326, z: -30, length: 330, width: 70, height: 8.6, yawDeg: 6 },
      { kind: 'ridge', x: 322, z: 30, length: 340, width: 74, height: 9, yawDeg: -8 },
      { kind: 'ridge', x: -194, z: -218, length: 210, width: 48, height: 5.6, yawDeg: 80 },
      { kind: 'ridge', x: 172, z: 218, length: 224, width: 52, height: 6.0, yawDeg: 82 },
      { kind: 'knoll', x: -84, z: 290, rx: 82, rz: 64, height: 6.2 },
      { kind: 'basin', x: 0, z: -12, rx: 136, rz: 182, height: -3.0, settlementScale: 0.5 },
      // 2026-10-02 (maps lane B): the swells that close the valley's two ends, each screening one team's assembly
      // ground from the other's down the valley floor; the farm tracks cross them in cuttings.
      { kind: 'ridge', x: -40, z: -338, length: 340, width: 70, height: 7, yawDeg: 3 },
      { kind: 'ridge', x: -20, z: 330, length: 340, width: 70, height: 6, yawDeg: -3 },
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
      // Four orchard blocks of three contour rows each, 9 m apart, on the terraces above their retaining walls: the
      // existing oaks rehoused as cultivated parcels (no new trees; the cedar and pine stands stay the edges).
      { id: 'west-lower-orchard-1', species: 'oak', path: [[-210, -96], [-140, -78]], count: 10, width: 0.15 },
      { id: 'west-lower-orchard-2', species: 'oak', path: [[-212.2, -87.3], [-142.2, -69.3]], count: 10, width: 0.15 },
      { id: 'west-lower-orchard-3', species: 'oak', path: [[-214.5, -78.6], [-144.5, -60.6]], count: 10, width: 0.15 },
      { id: 'west-upper-orchard-1', species: 'oak', path: [[-208, 42], [-142, 60]], count: 10, width: 0.15 },
      { id: 'west-upper-orchard-2', species: 'oak', path: [[-210.4, 50.7], [-144.4, 68.7]], count: 10, width: 0.15 },
      { id: 'west-upper-orchard-3', species: 'oak', path: [[-212.7, 59.4], [-146.7, 77.4]], count: 10, width: 0.15 },
      { id: 'east-lower-orchard-1', species: 'oak', path: [[168, -127], [256, -116]], count: 11, width: 0.15 },
      { id: 'east-lower-orchard-2', species: 'oak', path: [[169.1, -135.9], [257.1, -124.9]], count: 11, width: 0.15 },
      { id: 'east-lower-orchard-3', species: 'oak', path: [[170.2, -144.9], [258.2, -133.9]], count: 11, width: 0.15 },
      { id: 'east-upper-orchard-1', species: 'oak', path: [[150, 132], [246, 146]], count: 12, width: 0.15 },
      { id: 'east-upper-orchard-2', species: 'oak', path: [[148.7, 140.9], [244.7, 154.9]], count: 12, width: 0.15 },
      { id: 'east-upper-orchard-3', species: 'oak', path: [[147.4, 149.8], [243.4, 163.8]], count: 12, width: 0.15 },
    ],
  },
  props: {
    sourcedPalette: 'orchard', bathhouseStyle: 'timber',
    // the map-revival lane (2026-10-05): the Chouf kit (maps/regional/chouf.ts) builds the plan in the mountain
    // village's sandstone, every building where it stood
    architecture: 'chouf',
    plan: ['bathhouse', 'farmhouse', 'marketRow', 'rangerlodge', 'granary', 'woodshed', 'cottage', 'barn', 'market', 'farmhouse', 'tavern', 'granary', 'woodshed', 'ruin', 'barn', 'cottage', 'farmhouse', 'marketRow'],
    // (round 2, wave 123: "leftover Western forms … wood barns"): the war's own light structures in place of the timber
    // huts and the longhouse — a checkpoint hut, sentry posts, command and aid tents
    destructibleBuildings: ['checkpointhut', 'guardpost', 'commandtent', 'fieldhospital'],
    buildingLat: [11, 2], destructibleBuildingLat: [15, 3], sideSkip: 0.16, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'village-packing-court', role: 'brawl', x: 70, z: 56, yawDeg: -90, structure: 'checkpointhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'western-orchard-watch', role: 'scout', x: -330, z: 140, yawDeg: 110, structure: 'guardpost', outcrop: { count: 4, radius: 8 } },
      { id: 'upper-harvest-store', role: 'support', x: 246, z: 238, yawDeg: -105, structure: 'commandtent', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.68,
    // Retaining/garden walls parallel the planted terraces, ending at the
    // working tracks. Shorter runs reclaim geometry from remote field edges.
    wallRuns: [[-210, -112, -94, -84, 3], [-212, 22, -112, 48, 3], [92, 54, 242, 78, 3], [108, 110, 266, 130, 2], [-108, 90, -108, 142, 2], [122, -116, 262, -98, 3]],
    // (round 2, wave 123: hay bales and stacks are the Western farm's; the Chouf threshes on the roof and the floor)
    well: true, hayCrates: false, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 0, rocks: 138, outcrops: 20, craters: 48, rubblePiles: 10, cropFields: 7, sandbagLines: 12, hedgehogs: 8,
    tankWrecks: { era: 'modern', count: 5, debris: true,
      ids: ['marder1a3', 'ua_t84_oplot_m', 'm551_sheridan', 'pt91m', 'm1a1'] },
    // (round 2, wave 123: "picket and rail fencing"): dry stone walls along the lanes and round the yards
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, bales: 0, stooks: 0, pots: 8, laundry: 4, troughs: 2, handcarts: 4, carts: 4, trucks: 4, jeeps: 3, drumClusters: 3, camps: 2, modernClutter: 18, looseClutter: 20, roadFence: 'wallstone', yardFence: 'wallstone' },
  },
  // the map-revival lane (2026-10-05; the scenery lane's generators, world/scenery.ts): a Maronite cross at the village's
  // south entry and another on the western spur over the terraces, a cairn on the eastern flank's crest
  scenery: {
    landmarks: [
      { kind: 'waysidecross', x: -54, z: -112, yawDeg: 10, name: 'the cross at the village entry' },
      { kind: 'waysidecross', x: -318, z: -36, yawDeg: 90, name: 'the cross on the western spur' },
      { kind: 'cairn', x: 318, z: 40, name: 'the cairn on the eastern crest' },
    ],
  },

  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the valley's
  // forested mountains: steep and rounded, wooded to the crests, no snow or alpine rock (the Barouk's cedar ridge)
  // 2026-10-05 (the map-revival lane, round 2; gauntlet wave 123: "a flat, cardboard-lit jagged backdrop peak" and a
  // banded mountainside): Mount Lebanon is long rounded limestone ridges — pale rock on the steeper flanks, pine and
  // oak scrub below — not alpine peaks: the rolling ring and the upland panorama raised to the Barouk's bulk
  horizon: { baseHex: 0x5c7154, amp: 0.9, style: 'rolling', treeline: 0.8, snowline: 2, panorama: { regional: 'upland', ampM: 450, treeline: 0.75, rockSlope: 0.35 }, forestHex: 0x2e513c, rockHex: 0x9c9a8a, haze: 0.9, grain: 0.55 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.28, streets: 0.4, contrails: 0.3 },
  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 3.9, hemiIntensity: 0.42 },
  minimap: { ...verdant.minimap, base: [89, 110, 67], hard: [116, 107, 85], soft: [55, 79, 56] },
  shot: { pos: [-244, 56, -256], look: [60, 1, 98] },
} satisfies import('./contracts.ts').MapCompositionConfig;
