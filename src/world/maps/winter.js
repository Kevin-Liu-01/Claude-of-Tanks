// src/world/maps/winter.js — Erlenberg vibes: snow splat, a frozen lake you
// can drive across, bare birches, snow-dusted pines, flat overcast light.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'winter',
  name: 'Frosthollow',
  blurb: 'Snowbound farmland, bare birch stands and a frozen lake',

  terrain: {
    hillScale: 1.0,
    microScale: 0.9,
    rimH: 25,
    frozenMarshes: true,
    // no soggy marsh bowls — everything frozen reads as a crisp ice sheet
    marshes: [],
    lakes: [
      { x: 195, z: -120, r: 88, depth: 1.3 },
      { x: -190, z: -210, r: 62, depth: 1.1 },
      { x: -265, z: 265, r: 56, depth: 1.0 },
    ],
    village: { x0: -60, x1: 80, z0: -40, z1: 120, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
  },

  spawns: {
    player: { x: 14, z: -78 },
    enemies: [
      { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 280, z: 210 }, { x: -215, z: 270 },
      { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
    ],
  },

  splat: {
    grassTone: (h, s, l) => [0.575, 0.05, clamp01(0.62 + l * 0.38)], // snowpack
    dirtTone: (h, s, l) => [0.075, 0.11, clamp01(l * 0.85 + 0.10)], // frozen mud
    rockTone: (h, s, l) => [0.60, 0.03, clamp01(l * 0.95 + 0.08)],
    mudTone: (h, s, l) => [0.565, 0.24, clamp01(0.60 + l * 0.34)], // (fallback if iceLake off)
    mudRough: 0.18,
    marshGloss: 0.82,
    // dedicated ice-sheet layer: pale blue-grey albedo, pressure cracks,
    // dark depth blotches, wind drift streaks, glossy clear-ice roughness
    iceLake: true,
    iceDrift: 0.85,
    tintA: [1.03, 1.04, 1.09], tintB: [0.90, 0.93, 1.00], tintC: [1.04, 1.04, 1.07],
    roadTint: [0.74, 0.68, 0.62], // worn dark slush tracks through the snow
  },

  vegetation: {
    species: ['birch', 'pine'],
    clusterMix: [['birch', 0.55], ['pine', 0.45]],
    loneMix: [['birch', 0.6], ['pine', 0.4]],
    rimMix: [['pine', 0.8], ['birch', 0.2]],
    clusterCount: 40,
    loneCount: 85,
    rimCount: 58,
    grassDensity: 0.16,
    grassTexTone: (h, s, l) => [0.105, 0.26, clamp01(l * 1.15 + 0.08)], // dead straw
    tuftTone: (h, s, l) => [0.10, 0.20, clamp01(l * 1.05 + 0.08)],
    bushCount: 0.45,
    bushSpecies: 'birch',
    palettes: {
      birch: { // bare grey-brown shrubs + crowns — twigs kept DARK so near
        // crowns read as branch masses, not pale star-glitches
        cardHue: 0.08, cardSat: 0.08,
        texTone: (h, s, l) => [h, clamp01(s * 0.7), clamp01(l * 0.55)],
      },
      pine: { // winter spruce: near-LOD needles stay dense dark green (the
        // old l*1.3 wash bleached them to teal confetti / white asterisks);
        // the far canopy keeps its snow-dusted pale tone
        texTone: (h, s, l) => [clamp01(h * 0.94), clamp01(s * 0.72), clamp01(l * 0.9 + 0.015)],
        cardHue: 0.325, cardSat: 0.16,
        canopy: { hue: 0.36, sat: 0.10, l0: 0.40, l1: 0.68 },
      },
    },
  },

  props: {
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage'],
    tones: {
      plaster: (h, s, l) => [0.085, clamp01(s * 0.7), clamp01(l * 1.02 + 0.03)],
      roof: (h, s, l) => [0.58, clamp01(s * 0.25), clamp01(l * 1.35 + 0.18)], // snow-capped
      stone: (h, s, l) => [0.60, clamp01(s * 0.35), clamp01(l * 1.05 + 0.05)],
      wood: (h, s, l) => [h, clamp01(s * 0.7), clamp01(l * 0.95 + 0.02)],
      straw: (h, s, l) => [0.575, clamp01(s * 0.14), clamp01(l * 1.2 + 0.22)], // snowed-over stacks
    },
    rockTone: (h, s, l) => [0.60, 0.02, clamp01(l * 1.25 + 0.12)], // snowy boulders
    wallStoneChance: 0.25,
    wallRuns: [
      [-56, 8, -56, 64, 2], [74, 30, 74, 96, 4], [-8, 110, 52, 110, 2],
      [-186, -62, -118, -62, 3], [-64, 218, 8, 218, 4], [196, 108, 258, 108, 2],
      [-266, 66, -212, 66, 1],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 4, rocks: 140, outcrops: 12, craters: 22, rubblePiles: 0,
  },

  horizon: { baseHex: 0x9aa6b0, amp: 1.05 },

  sky: {
    // FLAT OVERCAST: higher-but-weak sun (no warm horizon glow), heavy grey
    // cloud deck, raised ambient/env fill so light reads diffuse
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    turbidity: 13, rayleigh: 3.2, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    fogDensity: 0.0018, fogTintHex: 0xb4bcc5, fogMix: 0.88, envIntensity: 0.4,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xaab2bc,
    sunIntensity: 1.4, sunColorHex: 0xdfe7f2, hemiIntensity: 0.8,
  },

  minimap: {
    base: [170, 178, 186], hard: [128, 122, 114], soft: [150, 168, 186],
    forest: 'rgba(64,80,72,0.85)', forestStroke: 'rgba(38,50,44,0.9)',
    water: 'rgba(158,190,214,0.85)', waterStroke: 'rgba(104,134,158,0.9)',
    roadCasing: 'rgba(60,54,46,0.9)', roadFill: 'rgba(120,108,96,0.95)',
    buildingFill: '#e4e7ec',
  },

  shot: { pos: [16, 42, -302], look: [136, -2, 16] },
};
