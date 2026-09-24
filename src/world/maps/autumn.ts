// src/world/maps/autumn.ts — Amberford: a Norman / English river-ford market
// town in October. Round 48 (owner 2026-09-23: "Frosthollow, Amberford and
// Tarkhan Steppe look good and have unique colour schemes but are straight
// rips of Verdant Field, exact same maps — need redesign"): the battlefield is
// new — the river runs diagonally south-west to north-east through a
// floodplain, crossed by the old coach road on a stone bridge below the town
// and by a shallow gravel FORD (the name) under the manor lane; the walled
// market town with its church square stands on the higher north bank; a weir
// and water mill hold the reach upstream; orchards and hedged fields fill the
// south bank between the river and a sunken lane; a wooded escarpment walls
// the east; the manor park with its lake lies north-east. The autumn palette,
// sky, vegetation species, prop tones, minimap and river material are the
// round-1 identity and are unchanged.

import { createMarshChannel } from './marshChannel.ts';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The river: SW -> NE. Stations follow the low ground of the seed-1337 field
// (corridor DP over the marsh-less heightfield, $SP/r48a/analyze.mjs route);
// r 25 / dip 1.5 is the open river, the two authored CROSSINGS pinch it:
// the BRIDGE narrows under the coach road and the FORD under the manor lane.
// A road crossing is dry by construction (terrain.ts zeroes the water mask
// within 14 m of a road centreline and grades the causeway), so the river is
// fordable exactly where a lane crosses it and soft water elsewhere — except
// where a station authors `crossing: 'bridge'` (round 61, 2026-09-24): there
// the road crosses on a level stone deck resolved by terrain.ts (the span is
// the river's own wet reach along the road, the deck 2.4 m over the water
// surface, the approaches graded to it), the water keeps its level and its
// wetness under the deck, the bed stays the river bed, and mapKits.ts builds
// the arched span, the abutments and the parapets from that plane.
const RIVER_STATIONS = [
  { x: -450, z: -330, dip: 1.4 }, { x: -410, z: -306 }, { x: -370, z: -284 }, { x: -330, z: -266 },
  { x: -290, z: -246 }, { x: -250, z: -222 }, { x: -212, z: -196 },
  { x: -176, z: -172 }, // the WEIR reach: the mill stands on the north bank here
  { x: -140, z: -152 }, { x: -104, z: -134 }, { x: -70, z: -114 }, { x: -40, z: -92 },
  { x: -20, z: -68, r: 18, dip: 1.0, crossing: 'bridge' as const }, // the BRIDGE narrows (coach road): a true span
  { x: 14, z: -42 }, { x: 52, z: -20 }, { x: 96, z: -4 }, { x: 140, z: 10 },
  { x: 186, z: 24, r: 17, dip: 1.5 }, // the FORD (manor lane): the wade over gravel (dip drops the lane to the water)
  { x: 230, z: 46 }, { x: 272, z: 78 }, { x: 312, z: 118 }, { x: 348, z: 166 },
  { x: 378, z: 220 }, { x: 402, z: 276 }, { x: 422, z: 332 }, { x: 440, z: 390, dip: 1.3 },
].map((m) => ({ r: 25, dip: 1.5, ...m }));
const CROSSINGS = RIVER_STATIONS.filter(station => station.r < 25);
const RIVER = createMarshChannel(RIVER_STATIONS).map(station => {
  let r = station.r;
  // New overlaps connect the river, but the crossing section at each authored
  // narrows stays inside its original bank envelope: a neighbour's circle may
  // not widen the wade where the lane crosses. Measured along the river's own
  // tangent at the crossing (the round-1 rule assumed a west-east river).
  for (const ford of CROSSINGS) {
    const index = RIVER_STATIONS.indexOf(ford);
    const previous = RIVER_STATIONS[index - 1], next = RIVER_STATIONS[index + 1];
    const length = Math.hypot(next.x - previous.x, next.z - previous.z);
    const tx = (next.x - previous.x) / length, tz = (next.z - previous.z) / length;
    const dx = station.x - ford.x, dz = station.z - ford.z;
    const along = Math.abs(dx * tx + dz * tz);
    if (along >= r) continue;
    const across = Math.max(0, ford.r - Math.abs(-dx * tz + dz * tx));
    r = Math.min(r, Math.hypot(along, across));
  }
  return r === station.r ? station : { ...station, r };
});

// The walled town on the north-bank rise; its market square is the crossroads
// where the coach road meets the mill lane and the manor lane.
const TOWN = { x0: -200, x1: -20, z0: 20, z1: 190 };

export default {
  id: 'autumn',
  name: 'Amberford',
  blurb: 'Fall-gold broadleaf valley, a fording river and hillside farms',
  // Round 48: bots cross the river at the bridge and the ford only (the open
  // river is soft water). Reservoir uses the same policy around its basin.
  navigationWaterPolicy: 'avoid-liquid',

  terrain: {
    // round 48: a lowland river valley (was 1.05) — the water surface is one graded plane
    hillScale: 0.8,
    microScale: 1.0,
    rimH: 26,
    marshes: RIVER, // the river IS the marsh chain (soft, wadeable)
    clearMarshVeg: true, // keep the channel clear of tufts; reeds stay on the banks
    // the manor lake is liquid water like the river (bogged 'soft'), not an ice pan
    softLakes: true,
    lakes: [
      { x: 140, z: 268, r: 50, depth: 1.2 }, // the manor park lake
    ],
    village: { ...TOWN, cx: -110, cz: 100, feather: 40, flatten: 0.80, relief: 0.18 },
    roads: { paths: [
      // 0 the old coach road: south edge -> the cross lanes -> the stone bridge -> the market square -> north edge
      [[300, -470], [262, -380], [200, -280], [120, -170], [13, -103], [-20, -68], [-53, -33], [-90, 40],
        [-110, 100], [-130, 170], [-150, 240], [-180, 330], [-210, 420], [-240, 470]],
      // 1 the manor lane: from the cross lanes north over the FORD, past the park to the north-east edge
      [[120, -170], [204, -20], [186, 24], [168, 68], [165, 110], [215, 190], [270, 270], [320, 360], [350, 470]],
      // 2 the mill lane: from the market square west along the north bank above the mill reach to the west edge.
      // Its border portal leaves at (-512,-188): the corridor the road completion stamps past radius 434 (68 m
      // either side of the added tail) must stay clear of the river's south-west end, whose bank-band samples
      // (1.8 R) would otherwise read a different rim in the completed and uncompleted builds (roadContinuity).
      [[-110, 100], [-180, 60], [-230, 0], [-260, -60], [-300, -120], [-360, -150], [-440, -170]],
      // 3 the sunken lane: along the south bank between the orchards, from the south-west corner to the cross lanes.
      // Its portal leaves at (-512,-477), far enough south that the river's end stations sit > 32 m inward of the
      // added tail (the stamped corridor never reaches their bank-band samples — roadContinuity).
      [[-470, -440], [-390, -370], [-300, -330], [-210, -290], [-130, -250], [-50, -215], [30, -200], [120, -170]],
      // 4 the north lane: from the market square east between the hedged fields to the manor gates
      [[-110, 100], [-30, 140], [60, 165], [140, 180], [215, 190]],
    ] },
    landforms: [
      // the wooded escarpment along the east (the manor park lies beyond its northern end)
      { kind: 'ridge', x: 420, z: -80, length: 480, width: 92, height: 11.5, yawDeg: 88 },
      // the town rise on the north bank: the settlement keeps the whole knoll
      { kind: 'knoll', x: -110, z: 120, rx: 190, rz: 150, height: 4.2, settlementScale: 1 },
      // the west spur above the mill reach
      { kind: 'ridge', x: -320, z: -40, length: 320, width: 84, height: 7.0, yawDeg: 38 },
      // the south upland the coach road climbs out of toward the player's deployment
      { kind: 'ridge', x: 180, z: -330, length: 300, width: 96, height: 5.0, yawDeg: 15 },
      // The river VALLEY: the water is one graded plane (liquidMarshSurface fits a
      // 0.5 % fall SW -> NE), so the valley floor is sculpted to it — hills the river
      // cuts through become shallow gorges, hollows are filled to a terrace, and the
      // banks never stand as levees above the fields. wetScale 1 keeps every form
      // acting under the channel. Measured on the marsh-less field ($SP/r48a/design.mjs valley).
      { kind: 'knoll', x: -370, z: -284, rx: 55, rz: 45, height: 2.6, yawDeg: 30, wetScale: 1 },
      { kind: 'basin', x: -215, z: -200, rx: 130, rz: 75, height: -6.0, yawDeg: 33, wetScale: 1 },
      { kind: 'knoll', x: -95, z: -140, rx: 95, rz: 60, height: 4.8, yawDeg: 33, wetScale: 1 },
      { kind: 'knoll', x: -395, z: -335, rx: 90, rz: 60, height: 5.5, yawDeg: 30, wetScale: 1 },
      { kind: 'knoll', x: -48, z: -98, rx: 55, rz: 45, height: 3.2, yawDeg: 33, wetScale: 1 },
      { kind: 'knoll', x: -280, z: -180, rx: 50, rz: 40, height: 2.5, yawDeg: 33, wetScale: 1 },
      { kind: 'knoll', x: 300, z: 50, rx: 60, rz: 45, height: 2.5, yawDeg: 30, wetScale: 1 },
      { kind: 'basin', x: 55, z: -22, rx: 75, rz: 65, height: -4.5, yawDeg: 20, wetScale: 1 },
      { kind: 'knoll', x: 140, z: 10, rx: 50, rz: 45, height: 4.0, wetScale: 1 },
      { kind: 'basin', x: 312, z: 118, rx: 60, rz: 60, height: -6.0, wetScale: 1 },
      { kind: 'basin', x: 410, z: 300, rx: 110, rz: 70, height: -4.5, yawDeg: 68, wetScale: 1 },
      { kind: 'basin', x: 436, z: 384, rx: 62, rz: 52, height: -4.0, wetScale: 1 },
      { kind: 'basin', x: -290, z: -246, rx: 55, rz: 50, height: -3.0, yawDeg: 30, wetScale: 1 },
      // the FORD: the wade's bed sits at the water plane so the lane dips to a wheel-deep crossing
      { kind: 'basin', x: 186, z: 30, rx: 60, rz: 45, height: -2.4, yawDeg: 68, wetScale: 1 },
    ],
  },

  spawns: {
    // player on the south-east upland's lower shelf (round 48 pacing, 2026-09-24:
    // the first pad at (330, -380) put the arc 870 m away — the far end of the
    // fleet — and the last bots ran out of clock; 60 m down the approach, minNy
    // 0.924, relief 2.8 m over 22 m, all four battlePacing seeds resolve): the
    // opening drive drops to the cross lanes and chooses the bridge or the ford.
    // The upland is uneven beyond the pad, so the allies deploy in Reservoir's
    // compact columns instead of the wide lateral arc.
    player: { x: 303, z: -327, formation: { columnSpacingM: 8, rowSpacingM: 13 } },
    // one enemy arc north of the town, clear of the coach road and the park
    // Flat-scanned on the marsh-less field ($SP/r48a/design.mjs pads): minNy >= 0.90
    // and relief <= 4 m over the 22 m pad, >= 30 m off a lane, >= 45 m apart, >= 800 m
    // from the player pad, clear of the town rise, the lake apron and the river.
    enemies: [
      { x: -280, z: 370 }, { x: -180, z: 440 }, { x: -120, z: 410 }, { x: -70, z: 360 },
      { x: -10, z: 370 }, { x: 50, z: 400 }, { x: 150, z: 410 },
    ],
  },

  splat: {
    // hay-gold meadow (procedural fallback; the sourced grass set carries an
    // olive-gold multiply tint — sourcedTextures TERRAIN_PLAN.autumn)
    grassTone: (h: number, s: number, l: number) => [0.135, clamp01(s * 0.9), clamp01(l * 1.02 + 0.02)],
    dirtTone: (h: number, s: number, l: number) => [0.082, clamp01(s * 0.9), clamp01(l * 0.98 + 0.02)],
    rockTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.5), clamp01(l * 1.02 + 0.02)],
    // r3: dark olive-teal river water (raw layer + sky sheen read pale-grey)
    mudTone: (h: number, s: number, l: number) => [0.52, clamp01(s * 0.95), clamp01(l * 0.78)],
    // open-water mode tuned RIVER: gentler foam (bank riffles), mud shoals
    seaLake: true,
    seaFoam: 0.12, // r4: bank riffles only — even 0.22 read as rapids sparkle at range
    // r2: river links are 25 m circles with soft feathered masks — the sea's
    // 0.40/0.78 ramp left only dotted puddle cores and painted the whole
    // channel as pale bare-mud apron. The tight ramp merges the chain into a
    // continuous waterway with narrow banks.
    seaRamp: [0.10, 0.45],
    iceDrift: 0.06,
    marshGloss: 0.85,
    iceSky: [0.26, 0.34, 0.42], // muted reflection; the river stays dark beneath it
    // the fall macro range: hay-gold lift, RUSSET-BROWN darkener, pale straw
    tintA: [1.18, 1.05, 0.72], tintB: [0.78, 0.70, 0.52], tintC: [1.10, 1.02, 0.78],
    roadTint: [1.0, 0.94, 0.82],
    fieldPatch: 1, // harvest-field patchwork on the open slopes
  },

  vegetation: {
    species: ['oak', 'aspen', 'birch', 'poplar'],
    clusterMix: [['oak', 0.45], ['aspen', 0.30], ['birch', 0.15], ['poplar', 0.10]],
    loneMix: [['oak', 0.38], ['aspen', 0.32], ['birch', 0.18], ['poplar', 0.12]],
    rimMix: [['oak', 0.38], ['aspen', 0.28], ['birch', 0.18], ['poplar', 0.16]],
    // round 48: the escarpment woods, the hedgerows and the orchard rows are
    // authored below; the random clusters and lone trees give way to them
    clusterCount: 50,
    loneCount: 130,
    rimCount: 95,
    grassDensity: 0.95,
    bushCount: 1.0,
    bushSpecies: 'oak',
    grassTexTone: (h: number, s: number, l: number) => [clamp01(h * 0.72), clamp01(s * 0.85), clamp01(l * 1.0 + 0.03)],
    tuftTone: (h: number, s: number, l: number) => [0.125, 0.30, clamp01(l * 0.95 + 0.05)],
    palettes: {
      // Autumn families use the existing species atlases. Muted card tints
      // avoid multiplying orange saturation twice; the atlas keeps its
      // clump-to-clump hue spread. cardL0 is wind flex, not color lightness.
      oak: {
        texTone: (h: number, s: number, l: number) => [clamp01(0.075 + (h - 0.22) * 0.60), clamp01(s * 0.80 + 0.02), clamp01(l * 1.02)],
        cardHue: 0.065, cardSat: 0.24, cardL0: 0.30,
        canopy: { hue: 0.070, sat: 0.28, l0: 0.27, l1: 0.39 },
        jitterHue: 0.85,
      },
      // Birch keeps gold; aspen is paler straw, not a second identical gold.
      birch: {
        birchLeaves: true,
        texTone: (h: number, s: number, l: number) => [clamp01(0.115 + (h - 0.10) * 0.12), clamp01(s * 0.55 + 0.12), clamp01(l * 0.92 + 0.10)],
        cardHue: 0.115, cardSat: 0.28, cardL0: 0.42,
        canopy: { hue: 0.115, sat: 0.34, l0: 0.36, l1: 0.52 },
        jitterHue: 0.6,
      },
      aspen: {
        birchLeaves: true,
        texTone: (h: number, s: number, l: number) => [clamp01(0.135 + (h - 0.10) * 0.10), clamp01(s * 0.40 + 0.08), clamp01(l * 0.92 + 0.10)],
        cardHue: 0.135, cardSat: 0.16, cardL0: 0.42,
        canopy: { hue: 0.135, sat: 0.24, l0: 0.36, l1: 0.52 },
        jitterHue: 0.6,
      },
      // Existing poplars supply ochre/olive variation without adding conifers.
      poplar: {
        texTone: (h: number, s: number, l: number) => [clamp01(0.145 + (h - 0.22) * 0.60), clamp01(s * 0.80 + 0.02), clamp01(l * 1.02)],
        cardHue: 0.150, cardSat: 0.26, cardL0: 0.30,
        canopy: { hue: 0.150, sat: 0.32, l0: 0.27, l1: 0.39 },
        jitterHue: 0.85,
      },
    },
    // Authored tree lines: the escarpment woods (four staggered ranks along
    // the east ridge), hedgerows on the field walls of both banks, the poplar
    // avenue up the manor drive. Belts are real cover (full site rules).
    belts: [
      // the wooded escarpment: four staggered ranks along the east ridge
      { x0: 372, z0: -300, x1: 372, z1: 120, gap: 10, jitter: 5, species: 'oak' },
      { x0: 390, z0: -310, x1: 390, z1: 130, gap: 9, jitter: 5, species: 'birch' },
      { x0: 408, z0: -300, x1: 408, z1: 140, gap: 9, jitter: 5, species: 'oak' },
      { x0: 426, z0: -290, x1: 426, z1: 130, gap: 10, jitter: 5, species: 'aspen' },
      // the sunken lane: hedgerows 14 m either side of the lane (south side first)
      { x0: -384, z0: -383, x1: -294, z1: -343, gap: 13, jitter: 2, species: 'oak' },
      { x0: -396, z0: -357, x1: -306, z1: -317, gap: 13, jitter: 2, species: 'oak' },
      { x0: -294, z0: -343, x1: -204, z1: -303, gap: 13, jitter: 2, species: 'oak' },
      { x0: -306, z0: -317, x1: -216, z1: -277, gap: 13, jitter: 2, species: 'oak' },
      { x0: -204, z0: -303, x1: -124, z1: -263, gap: 13, jitter: 2, species: 'oak' },
      { x0: -216, z0: -277, x1: -136, z1: -237, gap: 13, jitter: 2, species: 'oak' },
      { x0: -124, z0: -263, x1: -44, z1: -228, gap: 13, jitter: 2, species: 'oak' },
      { x0: -136, z0: -237, x1: -56, z1: -202, gap: 13, jitter: 2, species: 'oak' },
      { x0: -47, z0: -229, x1: 33, z1: -214, gap: 13, jitter: 2, species: 'oak' },
      { x0: -53, z0: -201, x1: 27, z1: -186, gap: 13, jitter: 2, species: 'oak' },
      { x0: 34, z0: -213, x1: 124, z1: -183, gap: 13, jitter: 2, species: 'oak' },
      { x0: 26, z0: -187, x1: 116, z1: -157, gap: 13, jitter: 2, species: 'oak' },
      // the north lane: hedgerows 14 m either side, east of the town wall
      { x0: -26, z0: 127, x1: 64, z1: 152, gap: 13, jitter: 2, species: 'oak' },
      { x0: -34, z0: 153, x1: 56, z1: 178, gap: 13, jitter: 2, species: 'oak' },
      { x0: 63, z0: 151, x1: 143, z1: 166, gap: 13, jitter: 2, species: 'oak' },
      { x0: 57, z0: 179, x1: 137, z1: 194, gap: 13, jitter: 2, species: 'oak' },
      { x0: 142, z0: 166, x1: 217, z1: 176, gap: 13, jitter: 2, species: 'oak' },
      { x0: 138, z0: 194, x1: 213, z1: 204, gap: 13, jitter: 2, species: 'oak' },
      // the manor drive: a poplar avenue 13 m either side of the lane up to the park
      { x0: 176, z0: 103, x1: 226, z1: 183, gap: 14, jitter: 1, species: 'poplar' },
      { x0: 154, z0: 117, x1: 204, z1: 197, gap: 14, jitter: 1, species: 'poplar' },
      { x0: 226, z0: 183, x1: 281, z1: 263, gap: 14, jitter: 1, species: 'poplar' },
      { x0: 204, z0: 197, x1: 259, z1: 277, gap: 14, jitter: 1, species: 'poplar' },
      { x0: 281, z0: 264, x1: 331, z1: 354, gap: 14, jitter: 1, species: 'poplar' },
      { x0: 259, z0: 276, x1: 309, z1: 366, gap: 14, jitter: 1, species: 'poplar' },
    ],
    authoredTrees: [
      // orchards on the south-bank terrace between the sunken lane and the river
      // (rows parallel to the river; rehoused lone oaks)
      { id: 'west-orchard-lower', species: 'oak', path: [[-300, -307], [-230, -269]], count: 10, width: 0.15 },
      { id: 'west-orchard-upper', species: 'oak', path: [[-306, -293], [-236, -254]], count: 10, width: 0.15 },
      { id: 'mid-orchard-lower', species: 'oak', path: [[-125, -212], [-54, -174]], count: 10, width: 0.15 },
      { id: 'mid-orchard-upper', species: 'oak', path: [[-131, -197], [-61, -159]], count: 10, width: 0.15 },
      { id: 'east-orchard-lower', species: 'oak', path: [[40, -134], [106, -90]], count: 10, width: 0.15 },
      { id: 'east-orchard-upper', species: 'oak', path: [[35, -119], [101, -75]], count: 10, width: 0.15 },
    ],
  },

  props: {
    // round 48: a market town's plan — the church and the inn on the square,
    // a Norman tower keep, the market hall and rows, shops, granaries and
    // cottages; consumed along the town's three streets, the remainder fills
    // the blocks between them
    plan: ['tavern', 'cottage', 'church', 'cornershop', 'market', 'marketRow', 'cottage', 'tower',
      'granary', 'cottage', 'schoolhouse', 'farmhouse', 'cottage', 'chapel', 'barn', 'cottage',
      'cornershop', 'cottage', 'ruin', 'cottage', 'granary', 'cottage', 'farmhouse', 'woodshed',
      'cottage', 'barn'],
    blockFill: true,
    monument: true, // the market cross on the square
    destructibleBuildings: ['fieldhut', 'leanto', 'longhouse', 'commandtent'],
    tacticalBeats: [
      // the inn and yard at the south end of the bridge: the brawl for the crossing
      { id: 'bridgehead-inn', role: 'brawl', x: -10, z: -135, yawDeg: -50,
        structure: 'longhouse', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 16 },
      // the ford watch on the south bank east of the wade
      { id: 'ford-watch', role: 'scout', x: 240, z: -50, yawDeg: 10,
        structure: 'fieldhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      // the manor park: the headquarters camp on the lawn above the lake
      { id: 'manor-park-camp', role: 'support', x: 235, z: 320, yawDeg: -110,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -16 },
    ],
    tones: {
      plaster: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.75 + 0.05), clamp01(l * 1.02 + 0.02)],
      roof: (h: number, s: number, l: number) => [0.045, clamp01(s * 0.85), clamp01(l * 0.92)], // weathered red-brown tile
      stone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.6), clamp01(l * 0.98)],
      wood: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.85), clamp01(l * 0.92)],
      straw: (h: number, s: number, l: number) => [0.105, clamp01(s * 0.9 + 0.05), clamp01(l * 1.05 + 0.05)], // bright hay
    },
    rockTone: (h: number, s: number, l: number) => [0.10, 0.10, clamp01(l * 0.95 + 0.02)], // mossy grey field stones
    wallStoneChance: 0.4,
    wallRuns: [
      // the town wall (gates open where the three streets pass)
      [TOWN.x0 + 4, TOWN.z0 + 4, TOWN.x0 + 4, TOWN.z1 - 4], [TOWN.x0 + 4, TOWN.z1 - 4, TOWN.x1 - 4, TOWN.z1 - 4],
      [TOWN.x1 - 4, TOWN.z1 - 4, TOWN.x1 - 4, TOWN.z0 + 4], [TOWN.x1 - 4, TOWN.z0 + 4, TOWN.x0 + 4, TOWN.z0 + 4],
      // (the bridge parapets stood here as two field-wall runs until round 61; they are the bridge kit's own solid
      // records on the deck now — a wall run seats on the terrain, which is the river bed under the span)
      // south-bank field walls: from the sunken lane's hedge toward the river bank
      [-173, -251, -185, -228, 1], [-82, -209, -97, -176, 1], [12, -185, -2, -112, 2], [89, -161, 56, -63, 3],
      // north-bank field walls: from the north lane down to the river bank
      [20, 112, 28, 32, 2], [110, 160, 112, 67, 3],
      // the manor park wall around the lake's south-west
      [40, 220, 40, 310, 2], [40, 310, 110, 330, 3],
      // the mill yard: behind the mill house on the reach above the bridge (mapKits derives the mill six links upstream)
      [-149, -104, -111, -80, 1],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 30, rocks: 180, outcrops: 18, craters: 44, rubblePiles: 0,
    // Legacy-map quality backport: modern hulks along the valley lanes (baked roster
    // tanks) + harvest-season logistics dressing
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['m60a2', 'ua_t84_oplot_m', 't90a', 'm1a1', 't80u'],
    },
    sandbagLines: 10,
    hedgehogs: 5,
    cropFields: 8, // the harvest is in — stubble plots + standing rows on both banks
    cropForm: 'harvest',
    // world-dressing r1: harvest dressing — stook-heavy fields, wattle yard
    // hurdles, churns + laundry in the farmyards, carts on the lanes
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 4, benches: 2, coreClutter: 10,
      bales: 12, stooks: 14,
      troughs: 1, churns: 1, laundry: 1, handcarts: 2, carts: 3,
      roadFence: 'fenceplank', yardFence: 'fencewattle',
      // DESTRUCTIBLES r1: requisitioned farm lorries + roadside camps
      trucks: 3, jeeps: 1, drumClusters: 3, camps: 2,
      modernClutter: { barrier: 4, roadsign: 4, cone: 6, transformer: 3, cablespool: 3 },
    },
  },

  horizon: {
    // fall uplands: rust-brown forest to near the crests, hazed warm
    baseHex: 0x6d6440, amp: 1.0, style: 'rolling', treeline: 0.94, treelineLayers: 2,
    forestHex: 0x6a4d28, rockHex: 0x7a7260, haze: 0.95, grain: 0.7,
  },

  sky: {
    // low golden-afternoon sun — the light that sells the season
    sunElevationDeg: 24, sunAzimuthDeg: 115,
    turbidity: 3.4, rayleigh: 1.35, mieCoefficient: 0.006, mieDirectionalG: 0.82,
    fogDensity: 0.00070, fogTintHex: 0x9aa3b5, fogMix: 0.55, envIntensity: 0.2,
    cloudOpacity: 0.75, cloudOpacity2: 0.5, cloudTintHex: 0xfff4e4,
    sunIntensity: 4.3, sunColorHex: 0xffe6bd, hemiIntensity: 0.30,
  },

  minimap: {
    base: [112, 96, 54], hard: [110, 100, 82], soft: [82, 88, 60],
    forest: 'rgba(96,58,22,0.82)', forestStroke: 'rgba(58,34,12,0.9)',
    water: 'rgba(58,86,96,0.85)', waterStroke: 'rgba(34,52,60,0.9)',
    roadCasing: 'rgba(48,40,26,0.9)', roadFill: 'rgba(200,180,138,0.95)',
    buildingFill: '#d9cfc0',
  },

  // behind the player's deployment on the south-east upland looking down the
  // coach road over the floodplain: ally tanks near-field, the bridge and the
  // river mid-frame, the walled town and its church on the rise beyond
  shot: { pos: [388, 34, -478], look: [-60, 6, 60] },
  // round 66 (2026-09-24, the FFT ocean): the river's ripple under a light air off the meadows
  ocean: { windSpeed: 2.6, windDirDeg: 100, fetchKm: 2, amplitude: 0.6, foam: 0, breakers: 0.05, caustics: 0.35 },
} satisfies import('./contracts.ts').MapCompositionConfig;
