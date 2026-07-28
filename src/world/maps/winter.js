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
    // shallow depths: the sheet now flattens nearly to the shoreline and the
    // level tracks the LOWEST bank point, so banks stay ~0.5 m snow lips —
    // the old 1.0-1.3 m drops read as steep-walled craters, not lakes
    lakes: [
      { x: 195, z: -120, r: 88, depth: 0.55 },
      { x: -190, z: -210, r: 62, depth: 0.5 },
      { x: -265, z: 265, r: 56, depth: 0.45 },
    ],
    // wider settlement footprint: the hamlet reads as a proper village core
    // instead of one lonely building cluster on an empty snowfield
    village: { x0: -84, x1: 100, z0: -56, z1: 150, cx: 10, cz: 40, feather: 42, flatten: 0.85 },
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
    // pale snow-dusted rock: keeps steep lake banks / cut slopes from reading
    // as dark holes punched into the snowfield
    rockTone: (h, s, l) => [0.585, 0.05, clamp01(l * 1.0 + 0.22)],
    mudTone: (h, s, l) => [0.565, 0.24, clamp01(0.60 + l * 0.34)], // (fallback if iceLake off)
    mudRough: 0.18,
    marshGloss: 0.92,
    // dedicated ice-sheet layer: blue-grey albedo, bright refrozen pressure
    // cracks, dark depth blotches, glossy clear-ice roughness. Drift LOW:
    // 0.85 buried most of the sheet back under snow albedo and the "lake"
    // vanished into the snowfield
    iceLake: true,
    // 0.45 (r5): more windblown snow encroaching from the shores — the sheet
    // grades into the snowfield instead of sitting as a clean punched ellipse
    iceDrift: 0.45,
    tintA: [1.03, 1.04, 1.09], tintB: [0.90, 0.93, 1.00], tintC: [1.04, 1.04, 1.07],
    roadTint: [0.74, 0.68, 0.62], // worn dark slush tracks through the snow
  },

  vegetation: {
    species: ['birch', 'pine'],
    clusterMix: [['birch', 0.55], ['pine', 0.45]],
    loneMix: [['birch', 0.6], ['pine', 0.4]],
    rimMix: [['pine', 0.8], ['birch', 0.2]],
    clusterCount: 66, // denser birch/pine stands — forest blocks as landmarks (r5)
    loneCount: 92,
    rimCount: 64,
    // sparser, FROSTED tufts: the old dark dense scatter read as uniform
    // speckle noise across the snowfield in wide shots. r5: slightly up now
    // that the scatter clumps in hollows instead of pepper-spraying
    grassDensity: 0.15,
    grassTexTone: (h, s, l) => [0.105, 0.16, clamp01(l * 1.1 + 0.22)], // rimed straw
    tuftTone: (h, s, l) => [0.11, 0.10, clamp01(l * 1.05 + 0.26)],
    bushCount: 0.30,
    // pine scrub, not birch twig-balls: the dark leafless bush scatter read
    // as speckle noise against the snow in establishing shots
    bushSpecies: 'pine',
    palettes: {
      birch: { // bare grey-brown shrubs + crowns — twigs kept DARK so near
        // crowns read as branch masses, not pale star-glitches
        cardHue: 0.08, cardSat: 0.08,
        texTone: (h, s, l) => [h, clamp01(s * 0.7), clamp01(l * 0.55)],
      },
      pine: { // winter spruce: near-LOD needles stay dense dark green (the
        // old l*1.3 wash bleached them to teal confetti / white asterisks).
        // r3: far canopy desaturated ~40% toward blue-grey-green and dropped
        // in value — the mint-pastel crowns popped as toy accents against the
        // overcast grade (critique: 'saturated mint against desaturated snow')
        texTone: (h, s, l) => [clamp01(h * 0.94), clamp01(s * 0.6), clamp01(l * 0.86 + 0.012)],
        cardHue: 0.345, cardSat: 0.10,
        canopy: { hue: 0.40, sat: 0.06, l0: 0.33, l1: 0.55 },
      },
    },
  },

  props: {
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage', 'barn', 'cottage',
      'cottage', 'ruin', 'cottage', 'barn'],
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

  horizon: {
    // r3: the 0.38 snowline left every foothill and the whole near wall bare
    // — with the warm grade on top the range read as tan desert dunes framing
    // a snow map. Snowline dropped to 0.18 (snow-bound to the valley floor,
    // rock only piercing on cliffs), base/rock pushed cold blue-grey and the
    // caps near-white so the ring still reads FROZEN through fog + warm grade.
    baseHex: 0x76839a, amp: 1.2, style: 'alpine', snowline: 0.18,
    rockHex: 0x49536b, snowHex: 0xf4f8fe, haze: 0.8,
  },

  sky: {
    // FLAT OVERCAST: higher-but-weak sun (no warm horizon glow), heavy grey
    // cloud deck, raised ambient/env fill so light reads diffuse
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    // turbidity 13 → 8.5: the mie-loaded sky sampled a warm CREAM horizon
    // color that leaked into the fog mix + aerial scatter and tanned the
    // whole alpine ring; 8.5 keeps the milky overcast without the sepia cast
    turbidity: 8.5, rayleigh: 2.6, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    // 0.0018 fogged the alpine wall to a flat cutout by 800 m — 0.0011 keeps
    // the overcast depth while letting snow/rock contrast survive to the ridge
    // envIntensity raised for the ice sheet's sky reflection; sun dropped and
    // hemi raised so light reads flatter/more diffuse (overcast brief)
    // fogMix 0.88 → 0.94: scene fog locks to the COLD tint, not the sky sample
    fogDensity: 0.0011, fogTintHex: 0xb9c4d2, fogMix: 0.94, envIntensity: 0.52,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xaab2bc,
    sunIntensity: 1.15, sunColorHex: 0xdfe7f2, hemiIntensity: 0.92,
  },

  minimap: {
    base: [170, 178, 186], hard: [128, 122, 114], soft: [150, 168, 186],
    forest: 'rgba(64,80,72,0.85)', forestStroke: 'rgba(38,50,44,0.9)',
    water: 'rgba(158,190,214,0.85)', waterStroke: 'rgba(104,134,158,0.9)',
    roadCasing: 'rgba(60,54,46,0.9)', roadFill: 'rgba(120,108,96,0.95)',
    buildingFill: '#e4e7ec',
  },

  // camera raised (42 -> 56): from 42 m the frozen lake subtends a few pixels
  // of near-grazing sliver and its signature ice sheet could not read at all
  // framed so the frozen lake (the map's signature feature) reads clearly:
  // slightly raised and shifted vs the old [16,42,-302] which caught the
  // sheet at a few pixels of near-grazing sliver
  shot: { pos: [40, 52, -288], look: [175, -4, -75] },
};
