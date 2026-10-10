// src/world/maps/coastal.ts — Saltmere Bay, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The bay, the strand, the fishing village and its four lanes, the palette, sky, sea, vegetation, name and id are the
// map's identity and stay; the battlefield inland of them is new. The old layout kept three of Verdant's five
// landforms, put alpha's pad on the open strand (its sector of the field had 3 % cover) and bravo's across the uplands,
// and the 2v2 pacing receipt's fastest match (seed 25001) ended in 113 s.
//
// Reference: a Breton bocage coast (the Pays de Leon): a turquoise bay behind a dune-backed strand, a whitewashed
// fishing village on the coast road, and inland the bocage: small fields boxed by hedge banks (talus) on rolling granite
// downs, with sunken lanes between the farms.
//
// Sea sheets are terrain `lakes` (flattened to sea level, softLakes = wading is bogged-slow) paired with wide
// `marshes` rings that give the splat mask its beach ramp.
//
// The story on the ground: the bay fills the east edge, fronted by the strand and the dune band. The village stands on
// the coast road behind the strand, where the two shore lanes come down to the beach. Inland, the granite downs rise in
// two long swells, one south and one north of the village's latitude, and between them the bocage fields lie on the
// lower slopes with farmsteads and hedge banks.
//
// The layout is mirror-symmetric across the axis between the two shore lanes (z = 22): every swell, hedge bank, farm,
// strongpoint and objective in the southern half has a counterpart reflected into the northern half (the four lanes
// already were; only the bay's coves are not). Alpha deploys behind the southern downs, bravo behind the northern
// downs, so the pads cannot see each other. The three zone-control objectives stand on the axis: the inland hamlet,
// the bocage crossroads and the village.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
// The inland road is grid road 0 (x = -90, the village's west lane): its vertex at z, by the grid's own jitter law
// (terrain.ts buildGridRoads, jitter 2.2, index 0), so a border stub can start exactly on its end.
const inlandRoadAt = (z: number): [number, number] => [-90 + Math.sin(z * 0.011 + 0 * 2.3) * 2.2, z];

export default {
  id: 'coastal',
  name: 'Saltmere Bay',
  blurb: 'Turquoise bay, dune-backed strand and a whitewashed fishing village',

  terrain: {
    hillScale: 0.6,   // the granite downs' broad swell (was 0.95: no 60 m disc of level ground inland)
    microScale: 0.65, // field-scale folds (was 0.9)
    rimH: 26,
    coastRimFadeM: 120, // round 47 follow-up: the bay's headlands climb to the rim over 120 m instead of standing on the strand
    // the bay: three overlapping sheets along the east edge; softLakes =
    // liquid water (bogged 'soft' ground), not a drivable ice pan
    softLakes: true,
    // all three sheets pinned to ONE sea level so the bay never steps
    // (depth kept: its presence selects the hard-edged lake MASK branch, so
    // fM hits 1 right at the sheet edge and the open water reads to shore)
    // Restore the three unequal coves and intervening headlands of the
    // original coast. The shared contour/sea continuation carries them past
    // the boundary; simplifying the strand into one crescent is unnecessary.
    // One datum and unioned bank grading keep overlapping coves connected.
    lakes: [
      { x: 460, z: -60, r: 190, level: -4.0, depth: 0.6, shelfM: 18, boats: 3 },
      { x: 470, z: 160, r: 170, level: -4.0, depth: 0.6, shelfM: 17, boats: 2 },
      { x: 480, z: -270, r: 150, level: -4.0, depth: 0.6, shelfM: 16, boats: 2 },
    ],
    marshes: [
      { x: 460, z: -60, r: 218, dip: 0.5 },
      { x: 470, z: 160, r: 196, dip: 0.5 },
      { x: 480, z: -270, r: 172, dip: 0.45 },
    ],
    dunes: { amp: 3.4 }, // low transverse dune band over the open ground
    // (r2: the mesa bluffs are OUT — the noise-placed walls landed as grey
    // slab cliffs mid-meadow and read as artifacts, not headlands)
    village: { x0: 40, x1: 250, z0: -80, z1: 150, cx: 150, cz: 30, feather: 45, flatten: 0.86 },
    villageWear: 'activity-patches',
    workedGround: [
      // Sandy turning courts explain the two shore-road termini. They meet
      // the existing capped lanes on dry land without paving across the bay.
      { feather: 4, strength: 0.9, boundary: [[247, -66], [261, -70], [276, -63], [280, -50], [270, -37], [251, -38], [241, -49]] },
      { feather: 4, strength: 0.9, boundary: [[245, 81], [262, 78], [277, 86], [280, 99], [269, 112], [250, 110], [241, 96]] },
      // Market stalls flank the actual road junction (163.77, 95.66).
      { feather: 8, strength: 0.92, boundary: [[140, 76], [174, 71], [192, 88], [185, 113], [149, 118], [136, 99]] },
      // Fishery/boatshed frontages on both sides of the x≈168 coast road.
      { feather: 7, strength: 0.82, boundary: [[141, -77], [171, -77], [197, -45], [190, 7], [199, 40], [176, 51], [141, 45], [145, 9], [134, -28]] },
    ],
    landforms: [
      // The granite downs, south and north: long swells that screen each pad from the axis.
      ...[[-40, -236, 160, 44, 8.5, 4], [250, -250, 70, 46, 6, -10]].flatMap(([x, z, rx, rz, height, yaw]) => [
        { kind: 'knoll', x, z, rx, rz, height, yawDeg: yaw },
        { kind: 'knoll', x, z: 44 - z, rx, rz, height, yawDeg: -yaw },
      ]),
      // Hedge banks (talus): low earth banks along the bocage field boundaries, hull-down lines for both teams.
      ...[[-250, -120, 150, 2], [-40, -110, 120, -4], [-330, -40, 110, 80]].flatMap(([x, z, length, yaw]) => [
        { kind: 'ridge', x, z, length, width: 22, height: 2.4, yawDeg: yaw },
        { kind: 'ridge', x, z: 44 - z, length, width: 22, height: 2.4, yawDeg: -yaw },
      ]),
      // a granite outcrop on the downs' shoulder, each with its reflection
      ...[[20, -170]].flatMap(([x, z]) => [
        { kind: 'knoll', x, z, rx: 30, rz: 24, height: 6 },
        { kind: 'knoll', x, z: 44 - z, rx: 30, rz: 24, height: 6 },
      ]),
      // the granite tor on the axis between the hamlet's green and the crossroads' meadow: it parts the inland lane
      // from the bocage lane where they meet
      { kind: 'knoll', x: -222, z: 22, rx: 24, rz: 30, height: 6.5 },
      // granite tors on the lower slopes, south and north, under the bocage crofts
      ...[[-260, -101]].flatMap(([x, z]) => [
        { kind: 'knoll', x, z, rx: 26, rz: 30, height: 6 },
        { kind: 'knoll', x, z: 44 - z, rx: 26, rz: 30, height: 6 },
      ]),
    ],
    // The inland hamlet's green and the bocage crossroads' meadow on the axis: level aprons (each at its ground's own
    // level, clear of the lanes) the zone-control placement seats its 30 m discs on. The village disc seats on the
    // village's graded floor.
    hardstands: [
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): tilted 7 % with its slope, a 16 m bank
      { x: -290, z: 22, width: 60, length: 60, yawDeg: 179, level: -0.4, grade: 0.072, bankM: 16 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 20 m bank
      { x: -155, z: 22, width: 60, length: 60, yawDeg: 0, level: 6.6, grade: 0, bankM: 20 },
    ],
    // E-W lanes CLIP at the strand (hi: 262) so no road paves into the bay
    // 2026-10-02 redesign: the four village lanes keep their own 32 m lattice inside the village. The inland road (road
    // 0, the utility line) runs the square's length and leaves it through two border stubs; the coast road now runs
    // between the two bocage lanes, and the shore lanes leave the inland road for the strand. Every border exit is an
    // authored path the endpoint completion grades through the rim (grid lanes drawn to the edge climbed it at 33-37 %).
    roads: { grid: { xs: [{ at: -90, lo: -448, hi: 448 }, { at: 168, lo: -224, hi: 256 }],
      zs: [{ at: -52, lo: -96, hi: 262 }, { at: 96, lo: -96, hi: 262 }], jitter: 2.2 }, paths: [
      // 4 / 5 — the bocage lanes: from the west edge past the crofts and farmsteads, across the inland road and over
      // the downs' eastern shoulder to the coast road; the northern lane is the southern one's reflection across the
      // axis.
      [[-448, -130], [-330, -140], [-230, -152], [-150, -162], [-90, -152], [0, -170], [90, -200], [168, -210]],
      [[-448, 174], [-330, 184], [-230, 196], [-150, 206], [-90, 196], [0, 214], [90, 244], [168, 254]],
      // 6 / 7 — the inland road's border stubs: each starts exactly on the road's end inside the square, so the
      // endpoint completion grades the exit through the rim like any authored path's.
      [inlandRoadAt(448), [inlandRoadAt(448)[0], 449]],
      [inlandRoadAt(-448), [inlandRoadAt(-448)[0], -449]],
    ] },
  },

  layoutBrief: { exceptions: {
    solidPropsInRoad: 'one fishing-village frontage building at the shore lane\'s junction with the coast road, '
      + 'unchanged from the original map (whose village frontage its shore receipts pin), stands 1.4 m into the coast '
      + 'road\'s carriageway',
  } },

  spawns: {
    // Alpha deploys behind the southern downs; bravo's seven pads (two rows) stand behind the northern downs, their
    // centroid the reflection of alpha's pad across the axis. 806 m between the anchors.
    player: { x: -40, z: -381 },
    enemies: [
      { x: -130, z: 410 }, { x: -70, z: 410 }, { x: -10, z: 410 }, { x: 50, z: 410 },
      { x: -100, z: 446 }, { x: -40, z: 446 }, { x: 20, z: 446 },
    ],
  },

  splat: {
    // wind-cured maritime sward (procedural fallback; sourced grass carries
    // the real albedo — see sourcedTextures TERRAIN_PLAN.coastal)
    grassTone: (h: number, s: number, l: number) => [0.185, clamp01(s * 0.85), clamp01(l * 1.0 + 0.02)],
    // D layer doubles as the BEACH: pale dry strand sand
    dirtTone: (h: number, s: number, l: number) => [0.105, 0.30, clamp01(0.30 + l * 0.62)],
    // pale grey headland rock (chalk-adjacent, never desert-red)
    rockTone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.35), clamp01(l * 1.06 + 0.05)],
    // r3: deepen + green the authored water — the raw layer under fresnel +
    // sun spec read as pale sparkle, not a teal bay
    mudTone: (h: number, s: number, l: number) => [clamp01(h * 0.98), clamp01(s * 1.1), clamp01(l * 0.82)],
    // open-water mode: surf line + whitecaps + sand shoals in the shallows
    seaLake: true,
    seaFoam: 0.62,
    seaRamp: [0.30, 0.62], // the lake mask is hard-edged — water reads to shore
    iceDrift: 0.12,     // sand-shoal coverage in the SHALLOWS (D layer)
    marshGloss: 0.95,   // water gloss response
    iceSky: [0.30, 0.46, 0.58], // restrained reflection; water keeps visible depth
    tintA: [1.10, 1.04, 0.82], tintB: [0.80, 0.82, 0.68], tintC: [1.06, 1.05, 0.92],
    roadTint: [0.96, 0.90, 0.78], // sandy coast lanes
    microAmp: 0.8,
    rippleDir: [0.85, 0.5],
    rippleAmp: 0.20, // faint wind ripple on the dune band
    rippleShoreOnly: true, // pasture stays grass; wind relief belongs to the strand
    wornDirtStrength: 0.32, // inland wear stays muted turf, not broad beach-sand islands (map pass 2026-09-12: back toward the reference breakup)
  },

  vegetation: {
    // round 76 (2026-09-26): no palm beside the maritime pines and cedars — a species mismatch on a temperate shore
    species: ['pine', 'cedar', 'oak'],
    clusterMix: [['pine', 0.48], ['cedar', 0.32], ['oak', 0.20]],
    loneMix: [['pine', 0.38], ['cedar', 0.31], ['oak', 0.31]],
    rimMix: [['cedar', 0.48], ['pine', 0.37], ['oak', 0.15]],
    // map pass 2026-09-12: the pasture between the strand and the crofts read
    // as an empty lawn from the establishing shot; gorse/marram scrub, more
    // windswept lone trees and grey shore boulders close the foreground.
    clusterCount: 42,
    loneCount: 116,
    rimCount: 70,
    grassDensity: 0.85,
    bushCount: 1.25,
    bushSpecies: 'oak',
    grassTexTone: (h: number, s: number, l: number) => [0.155, clamp01(s * 0.8), clamp01(l * 1.02 + 0.04)],
    tuftTone: (h: number, s: number, l: number) => [0.145, 0.26, clamp01(l * 0.92 + 0.08)],
    palettes: {
      // maritime pines: a touch bluer/darker than the verdant stand
      pine: {
        texTone: (h: number, s: number, l: number) => [clamp01(h * 1.04), clamp01(s * 0.9), clamp01(l * 0.98)],
        canopy: { hue: 0.34, sat: 0.22, l0: 0.16, l1: 0.30 },
      },
      oak: { // salt-pruned coastal scrub
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.92), clamp01(s * 0.72), clamp01(l * 1.0 + 0.05)],
        cardHue: 0.20, cardSat: 0.24,
        canopy: { hue: 0.21, sat: 0.24, l0: 0.30, l1: 0.44 },
      },
    },
  },

  props: {
    // regional-buildings lane: the Breton granite kit (maps/regional/breton.ts)
    architecture: 'breton',
    // world-dressing r1: + chapel and granary in the fishing village
    plan: ['fishery', 'boatshed', 'chapel', 'netyard', 'market', 'cottage',
      'lighthouse', 'cottage', 'ruin', 'barn', 'granary', 'boatshed',
      'netyard', 'cottage', 'tower', 'cottage'],
    destructibleBuildings: ['fishershack', 'saunahut', 'leanto', 'guardpost'],
    tacticalBeats: [
      { id: 'south-bocage-croft', role: 'brawl', x: -260, z: -103, yawDeg: 0,
        structure: 'saunahut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'north-bocage-croft', role: 'brawl', x: -260, z: 147, yawDeg: 180,
        structure: 'saunahut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'south-downs-post', role: 'support', x: 40, z: -103, yawDeg: 8,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'north-downs-post', role: 'support', x: 40, z: 147, yawDeg: 188,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: 15 },
      { id: 'south-strand-shack', role: 'scout', x: 222, z: -170, yawDeg: -8,
        structure: 'fishershack', outcrop: { count: 4, radius: 8, scaleMax: 2.7 } },
      { id: 'north-strand-shack', role: 'scout', x: 222, z: 214, yawDeg: 172,
        structure: 'fishershack', outcrop: { count: 4, radius: 8, scaleMax: 2.7 } },
    ],
    // The bocage farmsteads above the lanes, south and north, sited on the slopes' level shelves: they part the
    // inland lane from the bocage lane.
    plannedSites: [
      { structure: 'farmhouse', x: -216, z: -98, yawDeg: 0 }, { structure: 'barn', x: -192, z: -120, yawDeg: 90 },
      { structure: 'farmhouse', x: -138, z: 154, yawDeg: 180 }, { structure: 'barn', x: -186, z: 166, yawDeg: 270 },
      // the field barns on the hedge banks between the bocage lane and the coast lane
      { structure: 'barn', x: -50, z: -102, yawDeg: 90 }, { structure: 'barn', x: -20, z: 146, yawDeg: 270 },
    ],
    sideSkip: 0.12, spacingPad: 7,
    buildingLat: [11, 4.5], maxSpread: 2.2,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.095, clamp01(s * 0.35), clamp01(l * 1.10 + 0.08)], // whitewash
      roof: (h: number, s: number, l: number) => [0.575, clamp01(s * 0.30 + 0.04), clamp01(l * 0.80)],    // slate blue-grey
      stone: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.5), clamp01(l * 1.0 + 0.02)],
      wood: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.38), clamp01(l * 1.10 + 0.05)],     // salt-silvered timber (r3: lifted — read as tar)
      straw: null,
    },
    rockTone: (h: number, s: number, l: number) => [0.10, 0.08, clamp01(l * 1.02 + 0.04)], // grey shore boulders
    wallStoneChance: 0.85,
    wallRuns: [
      // village crofts
      [60, -34, 118, -34, 2], [196, 60, 196, 116, 3], [80, 120, 140, 120, 1],
      [126, -64, 126, -18, 2],
      // bocage field walls on the hedge banks, each with its reflection across the axis
      [-320, -170, -250, -170, 3], [-320, 214, -250, 214, 3],
      [-120, -60, -60, -60, 2], [-120, 104, -60, 104, 2],
      [-20, -120, 40, -130, 1], [-20, 164, 40, 174, 1],
      [-400, -100, -340, -110, 2], [-400, 144, -340, 154, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 14, rocks: 262, outcrops: 30, craters: 30, rubblePiles: 0,
    // DESTRUCTIBLES r1: modern hulks on the shore road (baked roster tanks)
    // + landing-defense dressing (hedgehog obstacles, sandbag lines)
    // the map-vehicles lane (2026-10-06, the period ruling): Brittany in the 1960s: the French Army's AMX-30s and
    // M47 Pattons
    // the present-day coast (the coordinator, 2026-10-08: its civilians the Breton coast's today): a present-day cast,
    // the French Leclerc and a CV90 beside a T-90M, a BMP-3 and a Leopard 2A7V
    tankWrecks: { era: 'modern', count: 5, debris: true, ids: ['leclerc', 't90m', 'cv90', 'bmp3', 'leo2a7v'] },
    sandbagLines: 10,
    hedgehogs: 7,
    // world-dressing r1: harbor-village inhabitants — fish-crate/barrel
    // clutter through the lanes, a quayside stall pair, laundry between the
    // crofts; stone-post rail fences on the field boundaries
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 2, benches: 2, coreClutter: 9,
      bales: 4,
      troughs: 1, laundry: 1, handcarts: 1, carts: 2,
      roadFence: 'fencerail', yardFence: 'fencepicket',
      // DESTRUCTIBLES r1: quayside logistics — trucks at the harbor lanes,
      // fuel-drum points, a shore bivouac
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 2,
      modernClutter: { barrier: 4, roadsign: 5, cone: 7, transformer: 3, cablespool: 3 },
    },
    cropFields: 3,
  },

  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Pays de Leon's granite and
  // its wayside stone. The axis knoll carries the tor between the hamlet's green and the crossroads' meadow; a tor
  // stands on each downs' shoulder above its bocage lane; the downs' granite shows through their thin soil; a calvary
  // marks each bocage crossroads on the inland road; a standing stone rises on each swell of the downs. Mirrored across
  // the axis like the rest of the map. (The hedges on the hedge banks belong to the land-cover lane.)
  scenery: {
    // the bocage's hedge lines stand on earth banks (the talus): the ground lane's land use draws the hedges' lines
    // (landUse.ts) and the banks follow them (fieldWorks.ts; decor, no collision)
    fieldWorks: { banks: true },
    rocks: [
      { form: 'tor', geology: 'granite', x: -222, z: 22, radius: 7, height: 5.5, yawDeg: 24, name: 'the axis tor' },
      { form: 'tor', geology: 'granite', x: 14, z: -152, radius: 5, height: 4.2, yawDeg: 70, name: 'the south downs tor' },
      { form: 'tor', geology: 'granite', x: 14, z: 196, radius: 5, height: 4.2, yawDeg: -70, name: 'the north downs tor' },
    ],
    // the granite showing through the thin soil of the downs' swells: whalebacks, small tors and their stone
    rockFields: [
      { geology: 'granite', x: -40, z: -236, radius: 120, count: 7, slopeBias: 0.5, size: [2.5, 5.5], name: 'the south downs granite' },
      { geology: 'granite', x: -40, z: 280, radius: 120, count: 7, slopeBias: 0.5, size: [2.5, 5.5], name: 'the north downs granite' },
    ],
    landmarks: [
      { kind: 'calvary', x: -78, z: -140, yawDeg: 15, name: 'the south crossroads calvary' },
      { kind: 'calvary', x: -78, z: 184, yawDeg: -15, name: 'the north crossroads calvary' },
      { kind: 'menhir', x: -70, z: -236, height: 4.6, name: 'the south downs standing stone' },
      { kind: 'menhir', x: -70, z: 280, height: 4.6, name: 'the north downs standing stone' },
    ],
  },

  horizon: {
    // soft coastal uplands ringing the bay, heavily hazed so the wall melts
    // toward the bright maritime sky instead of boxing the sea in
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): Finistère's low, wind-scoured granite
    // moors behind the bocage — no range
    baseHex: 0x5b6a50, amp: 0.55, style: 'rolling', treeline: 0.90, treelineLayers: 2, panorama: { regional: 'upland', ampM: 180, trees: 6 },
    forestHex: 0x3d5539, rockHex: 0x757a6c, haze: 1.08, grain: 0.8,
    // round 40 (2026-09-22, "water at the edge: same level and shader beyond"): no authored grey — the aperture takes
    // this map's deep-water colour (waterContact.ts) and the shallow-water sheet continues over it (edgeWater.ts)
    seaOpening: { azimuthDeg: 90, widthDeg: 118, level: -4.0 },
  },

  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'sea-streets', windDirDeg: 190, farBand: 0.65, fogBank: 0.45, fogBankTopM: 110, nightGlow: 0.25 },
  sky: {
    sunElevationDeg: 38, sunAzimuthDeg: 115,
    turbidity: 2.8, rayleigh: 1.8, mieCoefficient: 0.004, mieDirectionalG: 0.80,
    // r2: 0.00060 -> 0.00046 — the bay sits 300-700 m from every meaningful
    // camera; the heavier marine fog washed the water to featureless grey
    fogDensity: 0.00046, fogTintHex: 0x93a7bd, fogMix: 0.6, envIntensity: 0.24,
    cloudOpacity: 0.85, cloudOpacity2: 0.55, cloudTintHex: 0xffffff,
    sunIntensity: 4.5, sunColorHex: 0xfff3e0, hemiIntensity: 0.36,
  },

  minimap: {
    base: [96, 106, 66], hard: [128, 120, 96], soft: [168, 154, 116],
    forest: 'rgba(40,68,36,0.82)', forestStroke: 'rgba(24,44,22,0.9)',
    water: 'rgba(46,102,118,0.88)', waterStroke: 'rgba(26,64,76,0.9)',
    roadCasing: 'rgba(52,46,32,0.9)', roadFill: 'rgba(206,188,148,0.95)',
    buildingFill: '#e6e4da',
  },

  // over the shallows looking up the coastline: surf + strand run the frame
  // diagonal, village + lighthouse mid-left, uplands behind
  shot: { pos: [356, 40, -300], look: [96, -10, 190] },
  // round 66 (2026-09-24, the FFT ocean): an onshore breeze off the open sea to the east with a little swell behind
  // it — a real coast, its breakers on the bay's strand; amplitude 0.7 keeps the swell under the jetty deck
  ocean: { windSpeed: 5.2, windDirDeg: 190, fetchKm: 30, swell: 0.35, swellDirDeg: 185, amplitude: 0.7, choppiness: 0.9, foam: 0.5, breakers: 0.85, caustics: 0.6 },
} satisfies import('./contracts.ts').MapCompositionConfig;
