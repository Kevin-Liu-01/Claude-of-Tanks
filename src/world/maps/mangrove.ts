// src/world/maps/mangrove.ts — Mangrove Reach, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The tidal spine and the western creek, the fishing village on its dry island shoulder, the three working landings
// and the fishery wharf, the hooked fishing lane and its cross tracks, the palette, sky, sea, vegetation, name and id
// are the map's identity and stay; the battlefield around them is new. The old layout spread 1.7 m of relief over open
// flats, so sightlines ran long (median 192 m, 26 % of the blocked rays at 300 m or more). Alpha's pad stood in sight
// of bravo's arc, bravo's sectors had 13-16 % cover, and three compound buildings stood in the carriageway.
//
// Reference: the shrimp-farm coast of Ca Mau at the tip of the Mekong Delta: tidal creeks fringed with mangrove, square
// aquaculture ponds boxed by earth bunds, stilt houses and fishing hamlets along the raised levee roads, and old beach
// ridges (cheniers) a few metres proud of the flats.
//
// The story on the ground: the tidal spine runs north through the map's east-centre and turns west into the creek that
// wraps the fishing village. The village stands on the dry island shoulder west of the spine, where the fishing lane
// and the cross tracks meet; its wharf works the creek landing. The delta's old terraces rise gently toward the west
// and east edges, and pond bunds box the flats on both of them. The bunds give a tank hull-down banks and break the
// long looks across the ponds. Levees line the spine's banks, broken at the causeways and the landings. Chenier islands
// screen each deployment: alpha assembles in the south-west, bravo on the northern flats. The landings need lowland
// relief (the channel receipts pin hillScale at or under 0.25 and microScale at or under 0.3), so the authored
// landforms carry the relief. The layout is balanced rather than mirrored: the spine and the creek keep their courses,
// and the three strongpoints and zone-control discs stand within 10 % of equal route distance from both deployments.
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
      [[-100, -462], [-130, -302], [-68, -138], [2, 16], [108, 170], [234, 314], [420, 430]],
      [[350, -454], [256, -300], [234, -120], [188, 48], [204, 228], [300, 460]],
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
      // The chenier islands (old beach ridges) that screen each deployment, and raised islands across the open flats
      { kind: 'knoll', x: -175, z: -300, rx: 50, rz: 45, height: 7 },
      { kind: 'knoll', x: 60, z: 335, rx: 55, rz: 40, height: 5, wetScale: 0.2 },
      { kind: 'knoll', x: -45, z: 348, rx: 42, rz: 30, height: 5, wetScale: 0.2 },
      // The hard the village landing's boat is hauled up on. The creek's bank blend keeps it a few centimetres proud of
      // the tide (its natural 10 m reads as about 0.1 m on the bank), enough to keep the beached boat dry at every
      // terrain seed (riverLandings.ts wants it 5 cm above the water).
      { kind: 'knoll', x: -143, z: 214.5, rx: 5, rz: 5, height: 10 },
      { kind: 'knoll', x: -330, z: -200, rx: 70, rz: 60, height: 6 },
      { kind: 'knoll', x: -300, z: 90, rx: 60, rz: 50, height: 5.5 },
      { kind: 'knoll', x: 330, z: -250, rx: 70, rz: 60, height: 6 },
      { kind: 'knoll', x: 310, z: 190, rx: 60, rz: 50, height: 5.5 },
      { kind: 'knoll', x: 360, z: -60, rx: 55, rz: 50, height: 5 },
      { kind: 'knoll', x: -260, z: 390, rx: 70, rz: 45, height: 5 },
      // the old delta terraces: the islands rise gently away from the tidal spine toward each map edge
      { kind: 'knoll', x: -400, z: 0, rx: 280, rz: 560, height: 8, wetScale: 0.2 },
      { kind: 'knoll', x: 440, z: 0, rx: 240, rz: 560, height: 8, wetScale: 0.2 },
      // Aquaculture pond bunds, 2.8 m earth banks, box the open flats on both terraces
      ...[[310, -330, 260, 0], [310, -200, 260, 0], [360, -40, 160, 0], [310, 120, 260, 0], [330, 260, 220, 0],
        [230, -320, 160, 90], [340, -180, 240, 90], [340, 240, 180, 90],
        [-295, 340, 290, 0], [-250, 375, 130, 90], [20, -385, 110, 90], [-320, -370, 140, 90], [-400, 0, 500, 90],
        [320, 300, 240, 0], [260, 390, 110, 90], [-355, -300, 190, 0], [420, 0, 400, 90], [20, -250, 100, 90],
        // levees on the spine's banks, broken at the causeways and the working landings
        [30, -270, 110, 90], [130, -270, 110, 90], [172, -60, 110, 84], [62, -60, 110, 84], [52, 110, 90, 70],
        [175, 175, 70, 70], [28, 225, 60, 80], [-50, 312, 140, 2],
      ].map(([x, z, length, yawDeg]) => ({ kind: 'ridge', x, z, length, width: 30, height: 2.8, yawDeg, wetScale: 0.2 })),
    ],
  },
  layoutBrief: { exceptions: {
    solidPropsInWater: 'the fishery wharf\'s shed, the planned fishery building that src/world/mangroveFisheryWharf.ts '
      + 'seats on the village creek landing, stands on its piles at the water\'s edge by design: its annex reaches '
      + 'over the creek, as it did on the original map',
  } },

  spawns: { player: { x: -210, z: -390 }, enemies: [
    { x: 40, z: 380 }, { x: 100, z: 380 }, { x: 160, z: 380 },
    { x: 10, z: 436 }, { x: 70, z: 436 }, { x: 130, z: 436 }, { x: 190, z: 436 },
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
    // regional-buildings lane: the Ca Mau stilt-house kit (maps/regional/mekong.ts)
    architecture: 'mekong',
    riverLandings: [
      { lakeIndex: 20, shoreAngleDeg: 285 }, // village-facing creek landing
      { lakeIndex: 10, shoreAngleDeg: 0 }, // relief-island net yard
      { lakeIndex: 16, shoreAngleDeg: 0 }, // northern creek working bank
    ],
    sourcedPalette: 'delta',
    plan: ['fishery', 'boatshed', 'marketRow', 'farmhouse', 'cottage', 'boatshed', 'market', 'woodshed', 'fishery', 'granary', 'boatshed', 'ruin', 'marketRow', 'farmhouse', 'depot', 'woodshed', 'cottage', 'boatshed'],
    destructibleBuildings: ['stilthouse', 'fishershack', 'longhouse', 'fieldhospital'],
    buildingLat: [12, 2], destructibleBuildingLat: [16, 3], sideSkip: 0.18, spacingPad: 7.5,
    // The three strongpoints stand on the line of equal distance between the deployments: the western fishing
    // landing below the creek, the stilt watch on the spine's west bank, and the eastern island's aid post.
    tacticalBeats: [
      { id: 'western-fishing-landing', role: 'brawl', x: -200, z: 30, yawDeg: 90, structure: 'longhouse', redoubt: true, outcrop: { count: 4, radius: 8 }, wreck: true },
      { id: 'spine-ford-watch', role: 'scout', x: 50, z: -30, yawDeg: -90, structure: 'stilthouse', outcrop: { count: 4, radius: 8 } },
      { id: 'eastern-island-aid-post', role: 'support', x: 300, z: -130, yawDeg: -100, structure: 'fieldhospital', redoubt: true, outcrop: { count: 4, radius: 9 }, wreck: true },
    ],
    extraKits: ['river'], wallStyle: 'adobe', wallStoneChance: 0.20,
    wallRuns: [[-180, -40, -180, 22, 2], [-178, 124, -116, 124, 2], [-78, 48, -14, 48, 3], [-78, -40, -14, -40, 2], [270, 78, 270, 148, 3], [-58, -268, -58, -204, 2]],
    well: true, hayCrates: true, fences: true, telegraph: false, carts: true, logs: true,
    haystacks: 8, rocks: 114, outcrops: 12, craters: 48, rubblePiles: 10, cropFields: 4, sandbagLines: 14, hedgehogs: 6,
    // the map-vehicles lane (2026-10-06, the period ruling): Vietnam: the People's Army's T-55s (the Type 59 copy),
    // BMPs and T-62s, a captured M48
    tankWrecks: { era: 'cold-war', count: 5, debris: true, ids: ['type59', 'bmp2', 't62mv1', 'm48'] },
    inhabit: { stalls: 4, benches: 3, coreClutter: 20, pots: 8, laundry: 4, handcarts: 4, carts: 3, trucks: 4, jeeps: 3, drumClusters: 4, camps: 3, modernClutter: 18, looseClutter: 20, roadFence: 'fencewattle', yardFence: 'fencewattle' },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Mekong delta's family
  // tombs, rendered stucco under little tiled roofs, standing in pairs and threes on the raised dry ground by the ponds.
  scenery: {
    landmarks: [
      { kind: 'tomb', x: -318, z: -192, yawDeg: 20, name: 'the tombs on the south-west chenier' },
      { kind: 'tomb', x: -324, z: -184, yawDeg: 26 },
      { kind: 'tomb', x: -300, z: 102, yawDeg: 200, name: 'the tombs on the west mound' },
      { kind: 'tomb', x: -294, z: 108, yawDeg: 196 },
      { kind: 'tomb', x: 322, z: -238, yawDeg: 90, name: 'the tombs on the east chenier' },
      { kind: 'tomb', x: 330, z: -244, yawDeg: 86 },
      { kind: 'tomb', x: 338, z: -236, yawDeg: 94 },
      { kind: 'tomb', x: 300, z: 202, yawDeg: 270, name: 'the tombs on the north-east mound' },
    ],
  },
  // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the Ca Mau coast is dead flat —
  // a mangrove tree line, not volcanic mountains: the ring's swells low, the far country plain
  horizon: { baseHex: 0x56735c, amp: 0.18, style: 'rolling', treeline: 0.82, panorama: { regional: 'plain', trees: 14 }, forestHex: 0x2d533b, rockHex: 0x7a8370, haze: 0.94, grain: 0.54 },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'towering-cumulus', coverage: 0.34, windDirDeg: 80, towers: 0.6 },
  sky: { ...delta.sky, sunElevationDeg: 32, sunAzimuthDeg: 94, turbidity: 5.7, fogDensity: 0.00064, fogTintHex: 0x95b0b0, fogMix: 0.52, sunIntensity: 4.0, /* lighting 2026-09-13: was 3.7 */ cloudOpacity: 1.05, cloudOpacity2: 0.72 },
  minimap: { ...delta.minimap, base: [66, 101, 63], hard: [104, 102, 77], soft: [46, 80, 67] },
  shot: { pos: [-260, 49, -260], look: [52, -1, 90] },
  // round 66 (2026-09-24, the FFT ocean): the tidal creeks under a warm air — a slow ripple on tannin-dark water,
  // little to see of the bed
  ocean: { windSpeed: 2.6, windDirDeg: 80, fetchKm: 3, amplitude: 0.8, foam: 0, breakers: 0.15, caustics: 0.25 },
} satisfies import('./contracts.ts').MapCompositionConfig;
