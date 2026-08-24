// src/world/maps/steppe.js — maps r1: Prokhorovka's older, drier cousin. A
// golden feather-grass plain with LONG sightlines, hull-down micro-folds
// (microScale pushed hard), planted windbreak tree LINES (the additive
// vegetation `belts` feature), granite outcrop spurs, a whitewashed khutor
// hamlet at the crossroads and a dusty heat-haze horizon.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'steppe',
  name: 'Tarkhan Steppe',
  blurb: 'Golden grassland — long sightlines, shallow folds, windbreak lines',

  terrain: {
    hillScale: 0.85,   // broad, unhurried landforms...
    // r2: 1.7 -> 1.35 — still real hull-down folds, but at 1.7 every crest
    // crossed the splat's slope-rock threshold and the plain speckled grey
    microScale: 1.35,  // ...but STRONG berm/scrape folds: hull-down country
    rimH: 18,
    marshes: [],       // bone dry
    village: { x0: -70, x1: 70, z0: -20, z1: 110, cx: 0, cz: 45, feather: 40, flatten: 0.82 },
    landforms: [
      { kind: 'ridge', x: -252, z: 24, length: 390, width: 62, height: 5.8, yawDeg: 6 },
      { kind: 'ridge', x: 252, z: 48, length: 382, width: 62, height: 5.6, yawDeg: -8 },
      { kind: 'ridge', x: -48, z: 244, length: 260, width: 54, height: 4.6, yawDeg: 82 },
      { kind: 'ridge', x: 74, z: -236, length: 248, width: 52, height: 4.4, yawDeg: 78 },
      { kind: 'basin', x: -146, z: -176, rx: 124, rz: 72, height: -2.4, yawDeg: -12 },
    ],
  },

  spawns: {
    // flat-scanned pad (Δh 2.9 over the ally arc — the folds stay OUT of the
    // spawn apron; they start where the drive does)
    player: { x: 250, z: -330 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc on the far northwest
    // rise (the old list scattered to ±330 x abreast of the village).
    // Flat-scanned via tools/tmp-ai-r7-spawnscan.mjs — minNy>=0.86,
    // relief<=5 m over the pad radius, >=38 m apart, >=380 m from the
    // player pad.
    enemies: [
      { x: -125, z: 378 }, { x: -188, z: 352 }, { x: -61, z: 399 }, { x: -229, z: 363 },
      { x: -32, z: 426 }, { x: -270, z: 325 }, { x: 27, z: 429 },
    ],
  },

  splat: {
    // cured feather-grass gold (fallback; sourced withered_grass set is the
    // real albedo — sourcedTextures TERRAIN_PLAN.steppe)
    grassTone: (h, s, l) => [0.118, clamp01(s * 0.8), clamp01(l * 1.04 + 0.05)],
    dirtTone: (h, s, l) => [0.085, clamp01(s * 0.8), clamp01(l * 1.0 + 0.04)],
    // r2: warm sun-bleached outcrop stone — the neutral grey read as cold
    // blue slag wherever a fold crest picked up partial rock
    rockTone: (h, s, l) => [0.082, clamp01(s * 0.30 + 0.10), clamp01(l * 1.05 + 0.05)],
    mudTone: (h, s, l) => [0.08, 0.28, clamp01(l * 1.2 + 0.02)],
    // straw lift / olive-brown DARKENER / pale hay — the macro range that
    // keeps 300-800 m readable on an open plain (the desert r3 lesson)
    // r3: darkener pulled off red toward olive — the brown fields read as
    // ploughed dirt smears on the first render
    tintA: [1.12, 1.04, 0.76], tintB: [0.78, 0.76, 0.56], tintC: [1.08, 1.02, 0.80],
    roadTint: [0.95, 0.88, 0.74], // dusty tracks
    fieldPatch: 1,       // worked-field patchwork
    midRelief: 0.85,
    midReliefFar: 760,   // the dapple must carry the long sightlines
    microAmp: 0.85,
  },

  vegetation: {
    // r2: birch is OUT — its twig-cloud crowns are authored for the bare
    // winter read and rendered as dead sticks; oak carries the full golden
    // crowns the shelterbelts need
    species: ['oak', 'pine'],
    clusterMix: [['oak', 0.85], ['pine', 0.15]],
    loneMix: [['oak', 0.9], ['pine', 0.10]],
    rimMix: [['oak', 0.6], ['pine', 0.4]],
    clusterCount: 7,   // the plain is the point — groves are rare landmarks
    loneCount: 30,
    rimCount: 34,
    grassDensity: 1.1,
    bushCount: 0.55,
    bushSpecies: 'oak',
    // planted WINDBREAK LINES (vegetation.js belts, maps r1): field-boundary
    // rows that read as the steppe's signature man-made geometry and serve
    // as the map's concealment corridors
    belts: [
      { x0: -420, z0: -150, x1: -70, z1: -162, species: 'oak', gap: 7 },
      { x0: -380, z0: 58, x1: -130, z1: 72, species: 'oak', gap: 7 },
      { x0: 120, z0: -205, x1: 400, z1: -188, species: 'oak', gap: 7 },
      { x0: 95, z0: 168, x1: 380, z1: 188, species: 'oak', gap: 7 },
      { x0: -300, z0: 258, x1: -50, z1: 272, species: 'oak', gap: 8 },
      { x0: 205, z0: -35, x1: 430, z1: -15, species: 'oak', gap: 8 },
      { x0: -430, z0: -300, x1: -180, z1: -312, species: 'oak', gap: 8 },
    ],
    grassTexTone: (h, s, l) => [0.118, clamp01(s * 0.75 + 0.05), clamp01(l * 1.05 + 0.07)],
    tuftTone: (h, s, l) => [0.122, 0.30, clamp01(l * 0.85 + 0.14)],
    palettes: {
      oak: { // late-summer shelterbelt green-gold: full crowns, dusty olive
        texTone: (h, s, l) => [clamp01(0.10 + (h - 0.22) * 0.35), clamp01(s * 0.72 + 0.06), clamp01(l * 1.0 + 0.04)],
        cardHue: 0.115, cardSat: 0.32,
        canopy: { hue: 0.12, sat: 0.32, l0: 0.28, l1: 0.42 },
        jitterHue: 0.6,
      },
      pine: { // r3: dust the rare pines — full verdant green read terrarium
        texTone: (h, s, l) => [clamp01(h * 0.96), clamp01(s * 0.55), clamp01(l * 1.0 + 0.05)],
        canopy: { hue: 0.28, sat: 0.16, l0: 0.18, l1: 0.32 },
      },
    },
  },

  props: {
    // world-dressing r1: steppe farmstead catalog — farmhouse, granary, mill
    plan: ['farmhouse', 'barn', 'tavern', 'mill', 'cottage', 'barn', 'ruin',
      'granary', 'barn', 'farmhouse', 'cottage'],
    destructibleBuildings: ['longhouse', 'deserttent', 'motorpool', 'fieldhut'],
    tacticalBeats: [
      { id: 'western-armored-farm', role: 'brawl', x: -254, z: 64, yawDeg: 8,
        structure: 'motorpool', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -15 },
      { id: 'eastern-windbreak-post', role: 'scout', x: 246, z: 62, yawDeg: -8,
        structure: 'fieldhut', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
      { id: 'northern-khutor', role: 'support', x: 24, z: 270, yawDeg: 4,
        structure: 'longhouse', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    tones: {
      plaster: (h, s, l) => [0.10, clamp01(s * 0.4), clamp01(l * 1.08 + 0.06)], // sun-baked lime wash
      roof: (h, s, l) => [0.075, clamp01(s * 0.7), clamp01(l * 0.95)],
      stone: (h, s, l) => [0.09, clamp01(s * 0.45), clamp01(l * 1.0)],
      wood: (h, s, l) => [0.08, clamp01(s * 0.85), clamp01(l * 1.0)],
      straw: (h, s, l) => [0.11, clamp01(s * 0.9), clamp01(l * 1.05 + 0.05)],
    },
    rockTone: (h, s, l) => [0.085, 0.09, clamp01(l * 0.95)], // granite spur boulders
    wallStoneChance: 0.3,
    wallRuns: [
      [-58, 4, -58, 56, 2], [70, 24, 70, 88, 3], [-6, 102, 46, 102, 1],
      // long field boundaries knitting the open plain
      [-220, -80, -150, -80, 2], [150, -140, 216, -140, 3],
      [-70, 200, 0, 200, 2], [220, 90, 286, 90, 1],
      [-320, 30, -252, 30, 3], [60, -260, 128, -260, 2],
      [-160, -280, -96, -280, 1], [260, -60, 322, -60, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // the steppe's dressing IS hay + stone: bale silhouettes on every fold
    haystacks: 34, rocks: 230, outcrops: 34, craters: 42, rubblePiles: 0,
    // Legacy-map quality backport: modern hulks scattered on the open
    // plain (baked roster tanks, paired duel beats), tank-trap lines
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['type99a', 'challenger2', 't90m', 'k2', 'm1a2'],
    },
    sandbagLines: 10,
    hedgehogs: 6,
    cropFields: 5,
    // world-dressing r1: open-plain hay economy — heavy bale/stook scatter,
    // stone-post rail fences, troughs at the farmsteads
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 1, benches: 1, coreClutter: 6,
      bales: 16, stooks: 10,
      troughs: 1, churns: 1, handcarts: 1, carts: 2,
      roadFence: 'fencerail', yardFence: 'fencewattle',
      // DESTRUCTIBLES r1: steppe columns — trucks + field cars on the road
      // net, fuel dumps, bivouac clusters in the balkas
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 3,
      modernClutter: { barrier: 4, roadsign: 5, cone: 7, transformer: 3, cablespool: 3 },
    },
  },

  horizon: {
    // low, endless: the ring must whisper, not wall — smallest amp in the
    // roster + heavy dust haze so the plain reads as if it continues forever
    baseHex: 0x77704a, amp: 0.65, style: 'rolling', treeline: 0.82,
    forestHex: 0x565232, rockHex: 0x7d7663, haze: 1.25, grain: 0.6,
  },

  sky: {
    // high dry-season sun through light dust: warm-white light, hazy skirt.
    // r2: rayleigh up / turbidity + warm casts down — the first render came
    // out sand-desert orange under a saturated navy zenith
    sunElevationDeg: 40, sunAzimuthDeg: 115,
    turbidity: 4.2, rayleigh: 1.15, mieCoefficient: 0.007, mieDirectionalG: 0.78,
    fogDensity: 0.00052, fogTintHex: 0xb3ab94, fogMix: 0.62, envIntensity: 0.18,
    cloudOpacity: 0.55, cloudOpacity2: 0.32, cloudTintHex: 0xfdf6ea,
    sunIntensity: 4.25, sunColorHex: 0xfff0d6, hemiIntensity: 0.30,
  },

  minimap: {
    base: [140, 124, 74], hard: [126, 116, 96], soft: [110, 102, 64],
    forest: 'rgba(74,88,40,0.85)', forestStroke: 'rgba(44,54,24,0.9)',
    water: 'rgba(120,112,80,0.6)', waterStroke: 'rgba(80,74,52,0.7)',
    roadCasing: 'rgba(70,58,38,0.9)', roadFill: 'rgba(212,192,148,0.95)',
    buildingFill: '#e8e2d0',
  },

  // behind the spawn looking down the long axis: ally tanks near-field, the
  // fold country + windbreak lines + hamlet running away to the dust haze
  shot: { pos: [320, 30, -420], look: [-40, 6, 140] },
};
