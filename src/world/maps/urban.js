// src/world/maps/urban.js — Himmelsdorf vibes: a dense town grid on flattened
// ground, cobbled streets, rubble barricades and shell craters, a hilly park
// belt outside the blocks.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'urban',
  name: 'Steinburg',
  blurb: 'Dense town grid — cobbled streets, rubble cover, park hills',

  terrain: {
    hillScale: 0.55,
    microScale: 0.5,
    rimH: 20,
    marshes: [],
    village: { x0: -170, x1: 170, z0: -150, z1: 175, cx: 0, cz: 12, feather: 60, flatten: 0.93 },
    roads: { grid: { xs: [-112, 0, 116], zs: [-98, 12, 122], jitter: 2 } },
  },

  spawns: {
    player: { x: 0, z: -330 },
    enemies: [
      { x: -145, z: 330 }, { x: 0, z: 365 }, { x: 150, z: 330 }, { x: -285, z: 205 },
      { x: 285, z: 195 }, { x: -330, z: -60 }, { x: 335, z: 30 },
    ],
  },

  splat: {
    grassTone: (h, s, l) => [0.19, clamp01(s * 0.55), clamp01(l * 0.88)], // worn town green
    dirtTone: (h, s, l) => [0.09, clamp01(s * 0.4), clamp01(l * 1.0 + 0.02)], // ash-grey rubble dust
    rockTone: (h, s, l) => [0.08, clamp01(s * 0.5), clamp01(l * 1.0)],
    mudTone: (h, s, l) => [0.085, clamp01(s * 0.6), clamp01(l * 0.9)],
    tintA: [1.06, 1.03, 0.90], tintB: [0.86, 0.90, 0.84], tintC: [1.05, 1.03, 0.95],
    roadTint: [0.84, 0.86, 1.02], // grey cobble/sett streets
  },

  vegetation: {
    species: ['oak', 'pine'],
    clusterMix: [['oak', 0.7], ['pine', 0.3]],
    loneMix: [['oak', 0.8], ['pine', 0.2]],
    rimMix: [['pine', 0.6], ['oak', 0.4]],
    clusterCount: 12,
    loneCount: 30,
    rimCount: 42,
    grassDensity: 0.5,
    tuftTone: (h, s, l) => [0.185, clamp01(s * 0.7), clamp01(l * 0.92)],
    bushCount: 0.5,
    bushSpecies: 'oak',
    parks: [ // the hill-park belts where town trees are allowed
      { x: -240, z: -150, r: 95 }, { x: 250, z: -180, r: 85 },
      { x: -60, z: 250, r: 80 }, { x: 230, z: 250, r: 70 },
    ],
  },

  props: {
    plan: [
      'rowhouse', 'rowhouse', 'rowhouse', 'ruin', 'rowhouse', 'rowhouse',
      'tower', 'rowhouse', 'rowhouse', 'ruin', 'rowhouse', 'rowhouse',
      'rowhouse', 'ruin', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse',
      'rowhouse', 'ruin', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse',
      'rowhouse', 'rowhouse', 'ruin', 'rowhouse', 'rowhouse', 'rowhouse',
      'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse', 'ruin',
      'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse',
      'ruin', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse', 'rowhouse',
    ],
    blockFill: true,
    tones: {
      plaster: (h, s, l) => [0.10, clamp01(s * 0.6), clamp01(l * 0.95)], // sooty render
      roof: (h, s, l) => [0.02, clamp01(s * 0.55), clamp01(l * 0.85)], // dark slate-ish tile
      stone: (h, s, l) => [0.09, clamp01(s * 0.6), clamp01(l * 0.95)],
      wood: null,
      straw: null,
    },
    rockTone: (h, s, l) => [0.09, 0.04, clamp01(l * 1.05)], // concrete rubble chunks
    wallStoneChance: 0.6,
    buildingLat: [11, 2],
    sideSkip: 0.06,
    spacingPad: 3,
    maxSpread: 2.2,
    wallRuns: [
      [-150, -60, -96, -60, 2], [40, -130, 40, -76, 1], [96, 60, 152, 60, 3],
      [-120, 140, -60, 140, 2], [-40, -20, 20, -20, 4], [130, -40, 130, 6, 1],
    ],
    well: true, hayCrates: false, fences: false, telegraph: true, carts: true, logs: false,
    haystacks: 0, rocks: 60, outcrops: 6, craters: 48, rubblePiles: 30,
  },

  sky: {
    sunElevationDeg: 36, sunAzimuthDeg: 115,
    turbidity: 5.5, rayleigh: 1.4, mieCoefficient: 0.007, mieDirectionalG: 0.8,
    fogDensity: 0.00092, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
    cloudOpacity: 0.85, cloudOpacity2: 0.5, cloudTintHex: 0xe8e4dc,
    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,
  },

  minimap: {
    base: [98, 104, 90], hard: [92, 92, 98], soft: [70, 84, 72],
    forest: 'rgba(48,72,40,0.85)', forestStroke: 'rgba(30,46,26,0.9)',
    water: 'rgba(70,88,90,0.7)', waterStroke: 'rgba(40,54,56,0.8)',
    roadCasing: 'rgba(34,34,40,0.9)', roadFill: 'rgba(172,172,182,0.95)',
    buildingFill: '#d9d2c4',
  },

  shot: { pos: [-150, 34, -215], look: [40, 6, 55] },
};
