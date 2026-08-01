// src/world/maps/autumn.js — maps r1: fall-palette river valley (Redshire in
// October). A fordable river crosses the southern third as a chain of
// shallow-dip marsh links rendered by the uSea open-water splat mode; the
// broadleaf forest runs the vegetation hue system in orange/gold; farmland
// patchwork, hay, and a ruined stone bridge dress the valley floor.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// The river: a W-E chain of shallow channel links routed along LOW ground
// (DP over the riverless seed-1337 heightfield — the meanders are the
// terrain's own valleys). dip deepens where the route crosses a saddle so
// the channel keeps reading; the two authored FORDS pinch it to a wade, and
// the link at x=-20 sits under the N-S road = the road ford/causeway.
const RIVER = [
  { x: -460, z: -186, dip: 1.4 }, { x: -420, z: -206, dip: 1.4 },
  { x: -380, z: -198, dip: 1.4 }, { x: -340, z: -170, dip: 1.6 },
  { x: -300, z: -142, r: 16, dip: 0.8 },              // WEST FORD
  { x: -260, z: -134, dip: 1.4 }, { x: -220, z: -122, dip: 2.4 },
  { x: -180, z: -150, dip: 2.9 },                     // saddle cut
  { x: -140, z: -170, dip: 1.6 }, { x: -100, z: -166, dip: 1.4 },
  { x: -60, z: -186, dip: 1.4 },
  { x: -20, z: -214, r: 19, dip: 0.9 },               // ROAD FORD (N-S lane)
  { x: 20, z: -214, dip: 1.5 }, { x: 60, z: -218, dip: 1.4 },
  { x: 100, z: -214, dip: 1.4 },
  { x: 140, z: -202, r: 16, dip: 0.8 },               // EAST FORD
  { x: 180, z: -174, dip: 1.7 }, { x: 220, z: -166, dip: 1.5 },
  { x: 260, z: -166, dip: 1.4 }, { x: 300, z: -166, dip: 1.7 },
  { x: 340, z: -162, dip: 1.4 }, { x: 380, z: -162, dip: 1.4 },
  { x: 420, z: -170, dip: 1.4 }, { x: 460, z: -154, dip: 1.4 },
].map((m) => ({ r: 25, ...m }));

export default {
  id: 'autumn',
  name: 'Amberford',
  blurb: 'Fall-gold broadleaf valley, a fording river and hillside farms',

  terrain: {
    hillScale: 1.05,
    microScale: 1.0,
    rimH: 26,
    marshes: RIVER, // the river IS the marsh chain (soft, wadeable)
    clearMarshVeg: true, // keep the channel clear of tufts; reeds stay on the banks
    village: { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
  },

  spawns: {
    // player south of the river (flat-scanned pad: minNy 0.909, Δh 1.6 over
    // the ±55 m ally arc): the opening drive fords or bridges the channel
    player: { x: 210, z: -350 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc north of the river (the
    // old verdant-copied list scattered to ±330 x abreast of the village).
    // Flat-scanned via tools/tmp-ai-r7-spawnscan.mjs — minNy>=0.86,
    // relief<=5 m, river marsh chain rejected as soft, >=38 m apart,
    // >=380 m from the player pad.
    enemies: [
      { x: -108, z: 362 }, { x: -187, z: 347 }, { x: -34, z: 388 }, { x: -213, z: 378 },
      { x: 22, z: 419 }, { x: -222, z: 328 }, { x: 67, z: 420 },
    ],
  },

  splat: {
    // hay-gold meadow (procedural fallback; the sourced grass set carries an
    // olive-gold multiply tint — sourcedTextures TERRAIN_PLAN.autumn)
    grassTone: (h, s, l) => [0.135, clamp01(s * 0.9), clamp01(l * 1.02 + 0.02)],
    dirtTone: (h, s, l) => [0.082, clamp01(s * 0.9), clamp01(l * 0.98 + 0.02)],
    rockTone: (h, s, l) => [0.09, clamp01(s * 0.5), clamp01(l * 1.02 + 0.02)],
    // r3: dark olive-teal river water (raw layer + sky sheen read pale-grey)
    mudTone: (h, s, l) => [0.52, clamp01(s * 0.95), clamp01(l * 0.78)],
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
    iceSky: [0.44, 0.52, 0.60], // muted autumn sky sheen (r3: darker — grazing views own the sheet)
    // the fall macro range: hay-gold lift, RUSSET-BROWN darkener, pale straw
    tintA: [1.18, 1.05, 0.72], tintB: [0.78, 0.70, 0.52], tintC: [1.10, 1.02, 0.78],
    roadTint: [1.0, 0.94, 0.82],
    fieldPatch: 1, // harvest-field patchwork on the open slopes
  },

  vegetation: {
    species: ['oak', 'birch', 'pine'],
    clusterMix: [['oak', 0.60], ['birch', 0.30], ['pine', 0.10]],
    loneMix: [['oak', 0.50], ['birch', 0.40], ['pine', 0.10]],
    rimMix: [['oak', 0.45], ['pine', 0.35], ['birch', 0.20]],
    clusterCount: 68,
    loneCount: 150,
    rimCount: 95,
    grassDensity: 0.95,
    bushCount: 1.0,
    bushSpecies: 'oak',
    grassTexTone: (h, s, l) => [clamp01(h * 0.72), clamp01(s * 0.85), clamp01(l * 1.0 + 0.03)],
    tuftTone: (h, s, l) => [0.125, 0.30, clamp01(l * 0.95 + 0.05)],
    palettes: {
      // the fall canopy: oak remapped to the orange-red band; the WIDE
      // default hue jitter (kept near full) swings individuals between
      // scarlet, pumpkin and residual olive — the mixed-stand fall read
      oak: {
        texTone: (h, s, l) => [clamp01(0.055 + (h - 0.22) * 0.25), clamp01(s * 1.02 + 0.10), clamp01(l * 1.02)],
        cardHue: 0.058, cardSat: 0.52, cardL0: 0.30,
        // r2: far-canopy sat 0.50 -> 0.42, l1 0.42 -> 0.39 — the 300 m+
        // stands read salmon-pink candy against the hazed rim
        canopy: { hue: 0.060, sat: 0.42, l0: 0.27, l1: 0.39 },
        jitterHue: 0.85,
      },
      // birches go clear gold (twig texture warmed hard + gold cards)
      birch: {
        texTone: (h, s, l) => [0.105, clamp01(s * 0.55 + 0.22), clamp01(l * 0.92 + 0.10)],
        cardHue: 0.105, cardSat: 0.55, cardL0: 0.42,
        canopy: { hue: 0.11, sat: 0.50, l0: 0.36, l1: 0.52 },
        jitterHue: 0.6,
      },
      // pines keep their green — the evergreen counterpoint that makes the
      // gold read as SEASON, not as a tinted screenshot
    },
  },

  props: {
    // world-dressing r1: harvest-farm catalog — farmhouse, granary, chapel
    plan: ['farmhouse', 'barn', 'cottage', 'chapel', 'barn', 'granary', 'ruin',
      'cottage', 'barn', 'farmhouse', 'cottage', 'barn', 'granary', 'cottage'],
    tones: {
      plaster: (h, s, l) => [0.085, clamp01(s * 0.75 + 0.05), clamp01(l * 1.02 + 0.02)],
      roof: (h, s, l) => [0.045, clamp01(s * 0.85), clamp01(l * 0.92)], // weathered red-brown tile
      stone: (h, s, l) => [0.09, clamp01(s * 0.6), clamp01(l * 0.98)],
      wood: (h, s, l) => [0.075, clamp01(s * 0.85), clamp01(l * 0.92)],
      straw: (h, s, l) => [0.105, clamp01(s * 0.9 + 0.05), clamp01(l * 1.05 + 0.05)], // bright hay
    },
    rockTone: (h, s, l) => [0.10, 0.10, clamp01(l * 0.95 + 0.02)], // mossy grey field stones
    wallStoneChance: 0.4,
    wallRuns: [
      [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
      [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1],
      // valley-floor field boundaries either side of the river
      [-186, -62, -118, -62, 3], [148, -196, 148, -132, 2],
      [-64, 218, 8, 218, 4], [196, 108, 258, 108, 2], [-266, 66, -212, 66, 1],
      [96, -320, 158, -320, 3], [-40, -240, 30, -240, 2],
      [180, -80, 246, -80, 1], [-300, -160, -238, -160, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 30, rocks: 180, outcrops: 18, craters: 44, rubblePiles: 0,
    wrecks: 5,
    cropFields: 7, // the harvest is in — stubble plots + standing rows
    // world-dressing r1: harvest dressing — stook-heavy fields, wattle yard
    // hurdles, churns + laundry in the farmyards, carts on the lanes
    wallStyle: 'fieldstone',
    inhabit: {
      stalls: 2, benches: 1, coreClutter: 8,
      bales: 12, stooks: 14,
      troughs: 1, churns: 1, laundry: 1, handcarts: 1, carts: 3,
      roadFence: 'fenceplank', yardFence: 'fencewattle',
    },
  },

  horizon: {
    // fall uplands: rust-brown forest to near the crests, hazed warm
    baseHex: 0x6d6440, amp: 1.0, style: 'rolling', treeline: 0.94,
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

  // behind the player cluster looking across the river valley to the village:
  // ally tanks near-field, water + ford mid-frame, gold forest beyond
  shot: { pos: [150, 32, -428], look: [10, 4, 40] },
};
