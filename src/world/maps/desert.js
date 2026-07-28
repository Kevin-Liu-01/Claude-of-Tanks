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
    tintA: [1.10, 1.02, 0.85], tintB: [0.90, 0.84, 0.72], tintC: [1.12, 1.06, 0.90],
    roadTint: [1.12, 1.06, 0.94],
    strata: 0.12,           // horizontal rock banding on the mesa cliff walls
    microAmp: 0.4,          // tame the near-field dot speckle (ripples instead)
    rippleDir: [0.8, 0.6],  // global wind direction for the sand ripples
    rippleAmp: 0.30,        // anisotropic ripple normal strength
  },

  vegetation: {
    species: ['palm', 'oak'],
    clusterMix: [['palm', 1]],
    loneMix: [['palm', 0.85], ['oak', 0.15]],
    rimMix: [['palm', 1]],
    clusterCount: 13,
    loneCount: 42,
    rimCount: 22,
    grassDensity: 0.22,
    grassTexTone: (h, s, l) => [0.105, clamp01(s * 0.75), clamp01(l * 1.15 + 0.04)],
    tuftTone: (h, s, l) => [0.108, 0.28, clamp01(l * 1.05 + 0.06)],
    bushCount: 0.7,
    bushSpecies: 'oak',
    palettes: {
      oak: { // dusty olive scrub
        texTone: (h, s, l) => [0.15, clamp01(s * 0.6), clamp01(l * 0.95 + 0.03)],
        canopy: { hue: 0.16, sat: 0.22, l0: 0.22, l1: 0.34 },
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

  horizon: { baseHex: 0xa27446, amp: 1.1 },

  sky: {
    sunElevationDeg: 44, sunAzimuthDeg: 115,
    turbidity: 7, rayleigh: 0.55, mieCoefficient: 0.009, mieDirectionalG: 0.8,
    fogDensity: 0.00105, fogTintHex: 0xc7ac85, fogMix: 0.72, envIntensity: 0.22,
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
