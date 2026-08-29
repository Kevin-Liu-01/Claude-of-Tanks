// src/world/maps/coastal.ts — maps r1: Fisherman's Bay / Overlord vibes. A
// turquoise bay fills the east edge (uSea open-water splat mode), fronted by
// a strand of beach apron + surf line, a dune band, headland bluffs, and a
// whitewashed fishing village on the coast road. Sea sheets are terrain
// `lakes` (flattened to sea level, softLakes = wading is bogged-slow) paired
// with wide `marshes` rings that give the splat mask its beach ramp.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'coastal',
  name: 'Saltmere Bay',
  blurb: 'Turquoise bay, dune-backed strand and a whitewashed fishing village',

  terrain: {
    hillScale: 0.95,
    microScale: 0.9,
    rimH: 26,
    // the bay: three overlapping sheets along the east edge; softLakes =
    // liquid water (bogged 'soft' ground), not a drivable ice pan
    softLakes: true,
    // all three sheets pinned to ONE sea level so the bay never steps
    // (depth kept: its presence selects the hard-edged lake MASK branch, so
    // fM hits 1 right at the sheet edge and the open water reads to shore)
    lakes: [
      { x: 460, z: -60, r: 190, level: -4.0, depth: 0.6 },
      { x: 470, z: 160, r: 170, level: -4.0, depth: 0.6 },
      { x: 480, z: -270, r: 150, level: -4.0, depth: 0.6 },
    ],
    // matching shore rings: these paint the WIDE feathered mask ramp the
    // uSea shader splits into beach apron / surf line / open water, and add
    // a gentle strand dip so the beach grades below the meadow
    marshes: [
      { x: 460, z: -60, r: 218, dip: 0.5 },
      { x: 470, z: 160, r: 196, dip: 0.5 },
      { x: 480, z: -270, r: 172, dip: 0.45 },
    ],
    dunes: { amp: 3.4 }, // low transverse dune band over the open ground
    // (r2: the mesa bluffs are OUT — the noise-placed walls landed as grey
    // slab cliffs mid-meadow and read as artifacts, not headlands)
    village: { x0: 40, x1: 250, z0: -80, z1: 150, cx: 150, cz: 30, feather: 45, flatten: 0.86 },
    landforms: [
      { kind: 'ridge', x: -252, z: -34, length: 322, width: 78, height: 6.6, yawDeg: 4 },
      { kind: 'ridge', x: 212, z: 54, length: 266, width: 68, height: 5.2, yawDeg: -10, wetScale: 0.72 },
      { kind: 'ridge', x: -44, z: 246, length: 226, width: 62, height: 5.0, yawDeg: 80 },
      { kind: 'knoll', x: -170, z: -224, rx: 92, rz: 68, height: 5.8, yawDeg: -20 },
      { kind: 'basin', x: 88, z: -250, rx: 112, rz: 72, height: -2.2, yawDeg: 10, wetScale: 0.76 },
    ],
    // E-W lanes CLIP at the strand (hi: 262) so no road paves into the bay
    roads: { grid: { xs: [-90, 168], zs: [{ at: -52, hi: 262 }, { at: 96, hi: 262 }], jitter: 2.2 } },
  },

  spawns: {
    // flat-scanned strand-side pad (minNy 0.926, Δh 1.9 over the ally arc;
    // r4: shifted +22 m east — the first pad's exit lane wedged on a rock
    // cluster ~13 m out, probed live via tools/tmp-coastal-spawn-test)
    player: { x: 232, z: -352 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc on the north headland
    // (the old list scattered to (-350,130)/(180,215) — half the "enemy team"
    // started mid-map). Flat-scanned via tools/tmp-ai-r7-spawnscan.mjs —
    // minNy>=0.86, relief<=5 m, bay sheets cleared by 24 m + soft strand
    // rejected, >=38 m apart, >=380 m from the player pad.
    enemies: [
      { x: 43, z: 344 }, { x: -52, z: 341 }, { x: 66, z: 390 }, { x: -125, z: 344 },
      { x: 120, z: 433 }, { x: -174, z: 354 }, { x: 162, z: 412 },
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
  },

  vegetation: {
    species: ['pine', 'cedar', 'oak', 'palm'],
    clusterMix: [['pine', 0.48], ['cedar', 0.32], ['oak', 0.20]],
    loneMix: [['pine', 0.30], ['cedar', 0.25], ['oak', 0.25], ['palm', 0.20]],
    rimMix: [['cedar', 0.48], ['pine', 0.37], ['oak', 0.15]],
    clusterCount: 34,
    loneCount: 88,
    rimCount: 70,
    grassDensity: 0.85,
    bushCount: 0.9,
    bushSpecies: 'oak',
    grassTexTone: (h: number, s: number, l: number) => [0.155, clamp01(s * 0.8), clamp01(l * 1.02 + 0.04)],
    tuftTone: (h: number, s: number, l: number) => [0.145, 0.26, clamp01(l * 0.92 + 0.08)],
    palettes: {
      // maritime pines: a touch bluer/darker than the verdant stand
      pine: {
        texTone: (h: number, s: number, l: number) => [clamp01(h * 1.04), clamp01(s * 0.9), clamp01(l * 0.98)],
        canopy: { hue: 0.34, sat: 0.22, l0: 0.16, l1: 0.30 },
      },
      // shore palms: real green (the desert palette's dusty olive would read
      // dead against the bay), still desaturated enough to sit in the grade
      palm: {
        texTone: (h: number, s: number, l: number) => [clamp01(h), clamp01(s * 0.85), clamp01(l * 0.95)],
        cardHue: 0.25, cardSat: 0.30,
        frond: { hue: 0.25, sat: 0.30, l: 0.36 },
        canopy: { hue: 0.26, sat: 0.28, l0: 0.28, l1: 0.44 },
      },
      oak: { // salt-pruned coastal scrub
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.92), clamp01(s * 0.72), clamp01(l * 1.0 + 0.05)],
        cardHue: 0.20, cardSat: 0.24,
        canopy: { hue: 0.21, sat: 0.24, l0: 0.30, l1: 0.44 },
      },
    },
  },

  props: {
    // world-dressing r1: + chapel and granary in the fishing village
    plan: ['fishery', 'boatshed', 'chapel', 'netyard', 'market', 'cottage',
      'lighthouse', 'cottage', 'ruin', 'barn', 'granary', 'boatshed',
      'netyard', 'cottage', 'tower', 'cottage'],
    destructibleBuildings: ['fishershack', 'saunahut', 'leanto', 'guardpost'],
    tacticalBeats: [
      { id: 'western-coast-road-croft', role: 'brawl', x: -250, z: -60, yawDeg: 0,
        structure: 'saunahut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -15 },
      { id: 'strand-observation-shack', role: 'scout', x: 245, z: -70, yawDeg: -8,
        structure: 'fishershack', outcrop: { count: 4, radius: 8, scaleMax: 2.7 } },
      { id: 'northern-headland-post', role: 'support', x: -48, z: 260, yawDeg: 8,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
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
      // inland field boundaries staging the approach lanes
      [-200, -80, -140, -80, 3], [-140, -80, -140, -22, 1],
      [-60, 190, 10, 190, 2], [-260, 120, -196, 120, 1],
      [-120, -220, -52, -220, 2], [30, -180, 96, -180, 3],
      [-320, -20, -258, -20, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 8, rocks: 200, outcrops: 22, craters: 30, rubblePiles: 0,
    // DESTRUCTIBLES r1: modern hulks on the shore road (baked roster tanks)
    // + landing-defense dressing (hedgehog obstacles, sandbag lines)
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['merkava3d', 'ariete', 'type10', 'leclerc', 'm1a1'],
    },
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

  horizon: {
    // soft coastal uplands ringing the bay, heavily hazed so the wall melts
    // toward the bright maritime sky instead of boxing the sea in
    baseHex: 0x5b6a50, amp: 0.75, style: 'rolling', treeline: 0.90, treelineLayers: 2,
    forestHex: 0x3d5539, rockHex: 0x757a6c, haze: 1.25, grain: 0.8,
  },

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
};
