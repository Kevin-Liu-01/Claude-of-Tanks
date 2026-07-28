// src/world/maps/desert.js — El Halluf vibes: ridged dunes, flat-topped mesas,
// an adobe village on the crossroads, palm clusters, warm sand haze.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'desert',
  name: 'Sirocco Wadi',
  blurb: 'Sun-baked dunes, red mesas and an adobe crossroads village',

  terrain: {
    hillScale: 0.85,
    microScale: 0.7,
    rimH: 30,
    dunes: { amp: 7.5 },
    // taller, harder-edged plateaus: tighter threshold band => steeper cliff
    // walls that read as true rock mesas on the skyline, not tinted dunes
    mesas: { amp: 38, thr0: 0.70, thr1: 0.755 },
    marshes: [], // no marshes — dry wadi
    village: { x0: -70, x1: 74, z0: -34, z1: 112, cx: 4, cz: 40, feather: 40, flatten: 0.9 },
  },

  spawns: {
    player: { x: 14, z: -86 },
    enemies: [
      { x: -40, z: 315 }, { x: 130, z: 350 }, { x: 262, z: 230 }, { x: -210, z: 268 },
      { x: -325, z: 135 }, { x: 328, z: 128 }, { x: 20, z: 428 },
    ],
  },

  splat: {
    grassTone: (h, s, l) => [0.094, 0.36, clamp01(0.26 + l * 1.15)],
    dirtTone: (h, s, l) => [0.083, 0.34, clamp01(l * 1.3 + 0.05)],
    rockTone: (h, s, l) => [0.045, clamp01(s * 3.2 + 0.12), clamp01(l * 1.02)],
    mudTone: (h, s, l) => [0.078, 0.30, clamp01(l * 1.5 + 0.04)], // cracked dry clay
    mudRough: 1.15,
    tintA: [1.10, 1.02, 0.85], tintB: [0.94, 0.89, 0.79], tintC: [1.12, 1.06, 0.90],
    // r5: darker packed track — the old near-sand tint made the desert road a
    // faint smear across the dunes
    roadTint: [0.94, 0.87, 0.76],
    // r6: 0.22 -> 0.30 — the strata beds must dominate the cliff read so any
    // residual planar-UV stretch registers as sediment layers, not smear
    strata: 0.30,
    microAmp: 0.3,          // tame the near-field dot speckle (ripples instead)
    rippleDir: [0.8, 0.6],  // global wind direction for the sand ripples
    rippleAmp: 0.26,        // anisotropic ripple normal strength
    // bright low-sun sand turned the shared mid-frequency normal dapple into
    // a leopard-spot shadow field across the whole foreground — run it low
    // and let the wind ripples carry the mid-range surface interest
    midRelief: 0.3,
  },

  vegetation: {
    species: ['palm', 'oak'],
    clusterMix: [['palm', 1]],
    // all-palm standalone trees: the occasional far-LOD oak read as a pale
    // olive saucer floating over the oasis
    loneMix: [['palm', 1]],
    rimMix: [['palm', 1]],
    // r5: denser oases + more standalone palms — the sparse-stick read was a
    // top critique item; scrub density up with the new clump-gated scatter
    clusterCount: 19,
    loneCount: 68,
    rimCount: 30,
    // r6: 0.3 -> 0.42 — compensates the stricter two-scale thicket gating so
    // scrub concentrates into dense wadis instead of thinning out overall
    grassDensity: 0.42,
    // pale sun-bleached straw: the old darker olive tufts/scrub read as
    // black pepper speckle against the bright sand in establishing shots
    grassTexTone: (h, s, l) => [0.112, clamp01(s * 0.55), clamp01(l * 1.05 + 0.14)],
    tuftTone: (h, s, l) => [0.115, 0.20, clamp01(l * 0.95 + 0.18)],
    bushCount: 0.9, // r6: same budget-compensation as grassDensity
    bushSpecies: 'oak',
    palettes: {
      oak: { // dusty olive scrub, lifted toward sage so it sits on bright sand
        texTone: (h, s, l) => [0.15, clamp01(s * 0.55), clamp01(l * 1.0 + 0.07)],
        canopy: { hue: 0.16, sat: 0.20, l0: 0.26, l1: 0.40 },
      },
      palm: { // r6: fronds desaturated + darkened ~20% — the old bright toy-
        // plastic green crowns broke the muted sand grade in the foreground;
        // dusty date-palm olive sits in the scene palette instead
        texTone: (h, s, l) => [clamp01(h * 0.99), clamp01(s * 0.74), clamp01(l * 0.80)],
        cardHue: 0.235, cardSat: 0.20,
        // near-LOD blade vertex tint (buildPalmGeometry pal.frond): khaki-olive
        frond: { hue: 0.19, sat: 0.19, l: 0.41 },
        canopy: { hue: 0.24, sat: 0.26, l0: 0.17, l1: 0.29 },
      },
    },
  },

  props: {
    plan: ['adobe', 'adobe', 'adobe', 'tower', 'adobe', 'ruin',
      'adobe', 'adobe', 'adobe', 'adobe'],
    tones: {
      plaster: (h, s, l) => [0.068, 0.52, clamp01(l * 0.98 + 0.02)], // warm sand-plaster adobe
      roof: (h, s, l) => [0.065, clamp01(s * 0.8), clamp01(l * 1.1)],
      stone: (h, s, l) => [0.07, clamp01(s * 2 + 0.1), clamp01(l * 1.18 + 0.03)], // sandstone
      wood: (h, s, l) => [0.08, clamp01(s * 0.9), clamp01(l * 1.15)],
      straw: null,
    },
    rockTone: (h, s, l) => [0.05, 0.34, clamp01(l * 1.15 + 0.04)], // red-rock boulders
    wallStoneChance: 1.0,
    wallRuns: [
      [-58, 4, -58, 58, 2], [70, 26, 70, 92, 3], [-6, 104, 48, 104, 1],
      [-170, -70, -110, -70, 2], [150, -180, 150, -120, 1], [-70, 210, 0, 210, 3],
    ],
    well: true, hayCrates: true, fences: false, telegraph: false, carts: true, logs: false,
    haystacks: 0, rocks: 210, outcrops: 24, craters: 18, rubblePiles: 0,
  },

  horizon: {
    // banding up / grain down (r3): the far canyon walls must read as
    // stratified sandstone beds, not vertical fiber — constant-altitude
    // strata survive grazing angles where granular grain smears
    // r6: banding up / grain down again — constant-altitude beds are the only
    // feature that survives grazing-angle minification on the far ring
    baseHex: 0xa87c4e, amp: 1.15, style: 'mesa', banding: 0.30,
    rockHex: 0x96603a, haze: 0.85, grain: 0.7,
  },

  sky: {
    sunElevationDeg: 44, sunAzimuthDeg: 115,
    turbidity: 7, rayleigh: 0.55, mieCoefficient: 0.009, mieDirectionalG: 0.8,
    // 0.00105 washed the mesa tablelands to unshaded clay by 900 m — 0.00086
    // keeps the heat haze but lets the strata banding read on the skyline
    fogDensity: 0.00086, fogTintHex: 0xc7ac85, fogMix: 0.72, envIntensity: 0.22,
    cloudOpacity: 0.35, cloudOpacity2: 0.18, cloudTintHex: 0xfff2df,
    sunIntensity: 4.9, sunColorHex: 0xffe9c2, hemiIntensity: 0.34,
  },

  minimap: {
    base: [146, 122, 82], hard: [160, 140, 104], soft: [122, 104, 70],
    forest: 'rgba(88,104,44,0.85)', forestStroke: 'rgba(52,64,26,0.9)',
    water: 'rgba(140,118,80,0.6)', waterStroke: 'rgba(90,76,52,0.7)',
    roadCasing: 'rgba(88,72,48,0.9)', roadFill: 'rgba(214,192,150,0.95)',
    buildingFill: '#e0cba4',
  },

  shot: { pos: [-85, 46, -162], look: [60, 10, 172] },
};
