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
    // 2026-10-05 (the map-revival lane, round 2; gauntlet wave 123: "the terraces never appear … flat, straight-edged
    // quilted farmland"): the valley sides stepped into the Chouf's contour terraces (terrain.ts applyTerraces) — level
    // benches a riser of 2.6 m apart, no riser steeper than 0.6, the steps fading on level ground, in the drive corridors,
    // the village and the marshes — west and east of the village from the valley's southern swell to its northern one
    terraces: [
      { polygon: [[-430, -260], [-135, -260], [-135, 260], [-430, 260]], feather: 30, stepM: 2.6 },
      { polygon: [[135, -260], [430, -260], [430, 260], [135, 260]], feather: 30, stepM: 2.6 },
    ],
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
  // (round 4, gauntlet wave 212: the terrace risers "near-black, blue-slate gashes ... cold dark bluish-grey rubble instead
  // of the warm dressed cream sandstone") the rock layer (Verdant's Rock058, a dark blue-grey slate) tinted to the
  // Chouf's cream limestone, the ground lane's measure (about sRGB 140 / 132 / 110: their renders at [2.1, 1.8, 1.4] drew the
  // risers near-white from the bird; Saltwind's mechanism)
  splat: { sourcedPalette: 'verdant', sourcedTint: { R: [1.85, 1.6, 1.25] }, fieldPatch: 1, midRelief: 0.74, tintA: [0.9, 1.06, 0.76], tintB: [0.63, 0.80, 0.53], tintC: [1.1, 1.08, 0.80], roadTint: [0.76, 0.7, 0.58] },
  vegetation: {
    species: ['oak', 'cedar', 'pine'], clusterMix: [['cedar', 0.46], ['pine', 0.34], ['oak', 0.2]],
    loneMix: [['oak', 0.64], ['cedar', 0.26], ['pine', 0.1]], rimMix: [['cedar', 0.54], ['pine', 0.36], ['oak', 0.1]],
    clusterCount: 42, loneCount: 38, rimCount: 88, grassDensity: 0.95, bushCount: 1.0, bushSpecies: 'oak',
    // (round 4, wave 212: "the cedars and umbrella pines on the upper slopes are missing") the woods on the valley's upper
    // slopes and its ridges, closed (the trees lane's landscape-woods hook: the stands' centres on the top 35 % of the
    // square by height and slope), their cedar and pine mix the clusters'; the field trees keep the field law
    landscapeWoods: { zone: 0.35, slopeDeg: 12, merge: 30 },
    belts: [
      { x0: -206, z0: -96, x1: -92, z1: -68, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -204, z0: -44, x1: -104, z1: -22, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: -210, z0: 40, x1: -114, z1: 66, gap: 17, jitter: 0.8, species: 'oak' },
      { x0: 98, z0: 72, x1: 248, z1: 96, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 110, z0: 126, x1: 272, z1: 146, gap: 18, jitter: 0.8, species: 'oak' },
      { x0: 126, z0: -98, x1: 268, z1: -80, gap: 18, jitter: 0.8, species: 'oak' },
    ],
    authoredTrees: [
      // 2026-10-05 (the map-revival lane, round 2: the terraces' T3): olive groves on the benches beside the village, every
      // row along a bench's centre line (a contour of the ground before it was stepped, nudged to the bench's level
      // stretch) on the planar hillsides; the existing oaks rehoused as the olives (no new trees)
      { id: 'west-lower-orchard-1', species: 'oak', path: [[-130.1, -36.9], [-138.7, -39.4], [-142.7, -45.1], [-143.9, -52.8], [-149.6, -57.4], [-154.9, -62.2], [-158.5, -68.2], [-162.6, -73.9], [-162.2, -82.8], [-171.1, -85.0], [-172.7, -92.5]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-lower-orchard-2', species: 'oak', path: [[-138.2, -6.6], [-145.5, -10.0], [-149.1, -16.0], [-149.9, -24.0], [-155.6, -28.6], [-161.7, -32.8], [-165.4, -38.8], [-169.0, -44.8], [-171.4, -51.7], [-175.5, -57.4], [-182.0, -61.4]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-lower-orchard-3', species: 'oak', path: [[-154.7, -7.2], [-157.9, -13.4], [-161.6, -19.4], [-166.8, -24.3], [-174.6, -27.4], [-178.2, -33.4], [-177.8, -42.3], [-186.7, -44.5], [-189.6, -51.1], [-190.0, -59.4], [-198.9, -61.6]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'west-upper-orchard-1', species: 'oak', path: [[-198.6, 45.3], [-189.7, 42.7], [-184.4, 47.8], [-178.4, 51.6], [-172.4, 55.4], [-166.6, 59.6], [-160.0, 62.0], [-153.7, 64.9], [-145.0, 62.7], [-141.1, 71.1], [-134.7, 73.9]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-upper-orchard-1', species: 'oak', path: [[146.9, 78.7], [153.4, 84.8], [160.4, 85.4], [167.9, 80.0], [174.7, 83.1], [181.5, 85.7], [188.6, 83.9], [195.3, 88.4], [202.5, 86.6], [209.7, 83.7], [216.2, 90.3]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-lower-orchard-1', species: 'oak', path: [[202.2, -168.5], [205.2, -176.3], [213.2, -177.3], [217.0, -183.8], [221.2, -190.0], [228.0, -192.6], [235.4, -194.3], [239.2, -200.9], [244.6, -205.5], [252.6, -206.4], [257.9, -211.0]], count: 11, width: 0.15, bench: { searchM: 10 } },
      { id: 'east-lower-orchard-2', species: 'oak', path: [[190.0, -176.7], [192.0, -185.7], [201.2, -185.0], [206.8, -189.2], [212.5, -193.4], [215.4, -201.1], [221.1, -205.3], [226.7, -209.5], [233.2, -212.4], [238.2, -217.4], [242.7, -223.1]], count: 11, width: 0.15, bench: { searchM: 10 } },
    ],
  },
  props: {
    // (2026-10-06, the coordinator: the old identity's timber bathhouse dropped — the Chouf kit builds the hammam)
    sourcedPalette: 'orchard',
    // The landmarks lane (round 2, 2026-10-06, the seat agreed with the map-revival lane): the square's Ottoman fountain
    // on its setts, turned to the village grid, set into the finished village (it vetoes its ground, landmarks/types.ts
    // `ground`: what the passes after it would stand there is left out, every other record stands where it stood). The
    // silk khan planned beside it is withdrawn: the valley's long sight lines run through the village, and the layout
    // brief's long-sight share (at least 0.03) stood at 0.0302 without it — a khan anywhere near the square cut 58 to 84
    // of the 1 247 long rays where 30 could go (it measured 0.028).
    landmarks: [
      { kind: 'path', x: 17.5, z: 5, yawDeg: 142, ground: 'veto', name: "the fountain's square", params: { length: 11, width: 11, surface: 'stone' } },
      { kind: 'fountain', x: 17.5, z: 5, yawDeg: 142, ground: 'veto', name: 'the Ottoman fountain', params: { style: 'ottoman', radius: 3 } },
    ],
    // the map-revival lane (2026-10-05): the Chouf kit (maps/regional/chouf.ts) builds the plan in the mountain
    // village's sandstone, every building where it stood
    architecture: 'chouf',
    plan: ['bathhouse', 'farmhouse', 'marketRow', 'rangerlodge', 'granary', 'woodshed', 'cottage', 'barn', 'market', 'farmhouse', 'tavern', 'granary', 'woodshed', 'ruin', 'barn', 'cottage', 'farmhouse', 'marketRow'],
    // (round 4; the landmarks lane lays the square's setts out to the house fronts round its sabil — the rectangle
    // (5.7, 3.2) (18.7, 13.3) (29.6, -0.8) (16.7, -10.9), yaw 142 — and this lane closes it) the houses that close the
    // square stand after the plan has placed its own, so every plan house keeps its seat; each front 0.5 m back from the
    // setts, toward the square: the souk's arcade on the south-east side (the south corner left open, a lane out toward
    // road 3), a store at the north-east side's end beside the plan's house there, a dar at the south-west side's south
    // end beside the plan's store. The south-west side's west end stays open (inside the 7.5 m road clearance of road 0).
    plannedSitesAfterPlan: true,
    plannedSites: [
      { structure: 'marketRow', x: 27.07, z: -6.89, yawDeg: -38.04, terrace: true },
      { structure: 'granary', x: 31.34, z: 3.09, yawDeg: -127.7, terrace: true },
      { structure: 'cottage', x: 10.57, z: -11.5, yawDeg: 52.08, terrace: true },
    ],
    // (round 2, wave 123: "leftover Western forms … wood barns"): the war's own light structures in place of the timber
    // huts and the longhouse — a checkpoint hut, sentry posts, command and aid tents
    // (round 3, gauntlet wave 208: "modern tarps among the fields") no command or aid tents: the checkpoint hut and the
    // sentry posts only
    destructibleBuildings: ['checkpointhut', 'guardpost'],
    buildingLat: [11, 2], destructibleBuildingLat: [15, 3], sideSkip: 0.16, spacingPad: 7.5,
    tacticalBeats: [
      { id: 'village-packing-court', role: 'brawl', x: 70, z: 56, yawDeg: -90, structure: 'checkpointhut', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
      { id: 'western-orchard-watch', role: 'scout', x: -330, z: 140, yawDeg: 110, structure: 'guardpost', outcrop: { count: 4, radius: 8 } },
      { id: 'upper-harvest-store', role: 'support', x: 246, z: 238, yawDeg: -105, structure: 'guardpost', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.68,
    // Retaining/garden walls parallel the planted terraces, ending at the
    // working tracks. Shorter runs reclaim geometry from remote field edges.
    wallRuns: [[-210, -112, -94, -84, 3], [-212, 22, -112, 48, 3], [92, 54, 242, 78, 3], [108, 110, 266, 130, 2], [-108, 90, -108, 142, 2], [122, -116, 262, -98, 3]],
    // (round 2, wave 123: hay bales and stacks are the Western farm's; the Chouf threshes on the roof and the floor)
    // (round 3, wave 208: "a storybook European well") no village well: the landmarks lane's Ottoman sabil is the square's water
    well: false, hayCrates: false, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 0, rocks: 138, outcrops: 20, craters: 48, rubblePiles: 10, cropFields: 7, sandbagLines: 12, hedgehogs: 8,
    // the map-vehicles lane (2026-10-06, the period ruling): Lebanon, 1982: the Merkava Mk 1, Magach (M60A1) and
    // Sho't (Centurion), Syria's T-62s and T-72M
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['merkava1b', 'm60a1', 'centurion5', 't62mv1', 't72m1_jaguar'] },
    // (round 2, wave 123: "picket and rail fencing"): dry stone walls along the lanes and round the yards; (round 3, wave
    // 208) no camps — no modern tarps in Deir el Qamar
    inhabit: { stalls: 4, benches: 4, coreClutter: 22, bales: 0, stooks: 0, pots: 8, laundry: 4, troughs: 2, handcarts: 4, carts: 4, trucks: 4, jeeps: 3, drumClusters: 3, camps: 0, modernClutter: 18, looseClutter: 20, roadFence: 'wallstone', yardFence: 'wallstone' },
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
  // (the border's land past the edge keeps its alpine landform; the ring's own relief rolls — horizonRelief ringStyle)
  // (round 4, wave 212: "jagged alpine-looking peaks on the skyline (Mount Lebanon's ridges are rounder)") the near ring's
  // ridges rolling, the far panorama's upland at its height
  horizon: { baseHex: 0x5c7154, amp: 0.9, style: 'rolling', ringStyle: 'rolling', treeline: 0.8, snowline: 2, panorama: { regional: 'upland', ampM: 450, treeline: 0.75, rockSlope: 0.35 }, forestHex: 0x2e513c, rockHex: 0x9c9a8a, haze: 0.9, grain: 0.55 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.28, streets: 0.4, contrails: 0.3 },
  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 3.9, hemiIntensity: 0.42 },
  minimap: { ...verdant.minimap, base: [89, 110, 67], hard: [116, 107, 85], soft: [55, 79, 56] },
  shot: { pos: [-244, 56, -256], look: [60, 1, 98] },
} satisfies import('./contracts.ts').MapCompositionConfig;
