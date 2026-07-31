// src/world/maps/railyard.js — maps r1: flat brownfield rail depot under an
// overcast sky (Ensk's industrial quarter, minus the town). Warehouse rows,
// container ranks and gantry cranes along a fan of sidings (maps/mapKits.js
// lays the physical track geometry), smokestack verticals, concrete/gravel
// splats, lamppost-lined paved roads and heavy battle scarring.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Yard plan: industry-heavy with a couple of worker rowhouses and ruins so
// the depot reads lived-in and fought-over. 'warehouse'/'containerRow'/
// 'gantry'/'watertower'/'stack'/'shed' come from maps/railKit.js; 'factory'
// from maps/urbanKit.js.
const PLAN = [
  'warehouse', 'containerRow', 'factory', 'shed', 'warehouse', 'watertower',
  'containerRow', 'ruin', 'warehouse', 'gantry', 'stack', 'shed',
  'containerRow', 'warehouse', 'ruin', 'rowhouse', 'shed', 'containerRow',
  'warehouse', 'stack', 'rowhouse', 'containerRow',
  // r3 tail — consumed by blockFill for the BLOCK INTERIORS (the road
  // frontage takes ~20 slots; everything after lands between the sidings)
  'containerRow', 'shed', 'containerRow', 'warehouse', 'containerRow',
  'shed', 'containerRow', 'ruin', 'containerRow', 'shed', 'containerRow',
  'warehouse',
];

export default {
  id: 'railyard',
  name: 'Cinder Junction',
  blurb: 'Brownfield rail depot — warehouses, container ranks, gravel flats',

  terrain: {
    hillScale: 0.45,  // graded-flat brownfield...
    microScale: 0.5,  // ...with just enough settle to break the pancake
    rimH: 22,
    marshes: [],
    // the yard: one big graded rect with a whisper of elevation drift
    village: { x0: -200, x1: 200, z0: -170, z1: 190, cx: -10, cz: 10, feather: 55, flatten: 0.93, relief: 0.25 },
    roads: { grid: { xs: [-120, 0, 130], zs: [-110, 30, 150], jitter: 0.6 } },
  },

  spawns: {
    player: { x: 0, z: -330 },
    enemies: [
      { x: -145, z: 330 }, { x: 0, z: 365 }, { x: 150, z: 330 }, { x: -285, z: 205 },
      { x: 285, z: 195 }, { x: -330, z: -60 }, { x: 335, z: 30 },
    ],
  },

  splat: {
    grassTone: (h, s, l) => [0.16, clamp01(s * 0.42), clamp01(l * 0.88)], // trodden verge scrub
    dirtTone: (h, s, l) => [0.08, clamp01(s * 0.30), clamp01(l * 0.98 + 0.02)], // ash/cinder
    rockTone: (h, s, l) => [0.08, clamp01(s * 0.25), clamp01(l * 0.95)], // concrete grey
    mudTone: (h, s, l) => [0.085, clamp01(s * 0.5), clamp01(l * 0.9)],
    tintA: [1.02, 1.0, 0.92], tintB: [0.82, 0.84, 0.80], tintC: [1.04, 1.02, 0.96],
    // concrete-grey carriageway, fully paved (R layer = warm-neutral sett)
    roadTint: [0.60, 0.60, 0.58],
    roadTexMix: 0.9,
    townWear: 2.6, // the yard floor is worked bare — cinder, not lawn (r2: +0.4)
    microAmp: 0.7,
  },

  vegetation: {
    species: ['oak', 'birch'],
    clusterMix: [['oak', 0.6], ['birch', 0.4]],
    loneMix: [['oak', 0.65], ['birch', 0.35]],
    rimMix: [['oak', 0.5], ['birch', 0.5]],
    clusterCount: 9,  // scrub survives only outside the worked ground
    loneCount: 34,
    rimCount: 66,
    grassDensity: 0.45,
    bushCount: 0.7,
    bushSpecies: 'oak',
    grassTexTone: (h, s, l) => [0.14, clamp01(s * 0.55), clamp01(l * 0.95)],
    tuftTone: (h, s, l) => [0.135, clamp01(s * 0.6), clamp01(l * 0.88)],
    palettes: {
      oak: { // soot-dulled wasteland scrub
        texTone: (h, s, l) => [clamp01(h * 0.85), clamp01(s * 0.6), clamp01(l * 0.94)],
        cardHue: 0.17, cardSat: 0.22,
        canopy: { hue: 0.18, sat: 0.22, l0: 0.24, l1: 0.36 },
      },
      birch: {
        texTone: (h, s, l) => [0.12, clamp01(s * 0.5), clamp01(l * 0.9 + 0.04)],
        cardHue: 0.14, cardSat: 0.26, cardL0: 0.36,
        canopy: { hue: 0.15, sat: 0.26, l0: 0.32, l1: 0.46 },
        jitterHue: 0.5,
      },
    },
  },

  props: {
    plan: PLAN,
    blockFill: true, // r3: leftover plan slots fill the block interiors
    sideSkip: 0.08, spacingPad: 6,
    buildingLat: [12, 5], maxSpread: 2.4,
    tones: {
      plaster: (h, s, l) => [0.09, clamp01(s * 0.30), clamp01(l * 0.88)], // sooty render
      plaster2: (h, s, l) => [0.075, clamp01(s * 0.35 + 0.06), clamp01(l * 0.80)],
      plaster3: (h, s, l) => [0.55, clamp01(s * 0.15 + 0.03), clamp01(l * 0.78)],
      roof: (h, s, l) => [0.58, clamp01(s * 0.18), clamp01(l * 0.80 + 0.04)], // weathered sheet grey (r2: lifted — read near-black under the deck)
      stone: (h, s, l) => [0.05, clamp01(s * 0.55 + 0.08), clamp01(l * 0.98 + 0.03)], // smoke-stained brick (r2: lifted)
      wood: (h, s, l) => [0.08, clamp01(s * 0.55), clamp01(l * 0.85)], // creosoted timber
      straw: null,
    },
    rockTone: (h, s, l) => [0.085, 0.07, clamp01(l * 0.82)], // concrete rubble
    wallStoneChance: 0.75,
    wallRuns: [
      // yard perimeter + interior dividing walls
      [-190, -150, -120, -150, 2], [-190, -150, -190, -84, 1],
      [150, -150, 192, -150, 3], [192, -150, 192, -90, 1],
      [-190, 170, -120, 170, 2], [120, 176, 190, 176, 3],
      [-96, -60, -40, -60, 2], [96, 62, 152, 62, 1],
      [-160, 60, -104, 60, 3], [30, -150, 86, -150, 2],
      // approach-field boundaries (the establishing camera's foreground)
      [-90, -230, -26, -230, 2], [40, -210, 100, -210, 3],
      [-150, -200, -150, -252, 1],
    ],
    well: false, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 0, rocks: 60, outcrops: 4, craters: 62, rubblePiles: 90,
    lampposts: true, hedgehogs: 10, wrecks: 7,
    townCraters: true, // shell pocks on the hardstand
  },

  horizon: {
    // industrial hinterland: low escarpment under smoke-grey haze
    baseHex: 0x4f554a, amp: 0.8, style: 'escarpment', treeline: 0.90,
    forestHex: 0x35402f, rockHex: 0x62655c, haze: 1.25, grain: 0.8,
  },

  sky: {
    // FLAT OVERCAST (trips the sky.js overcast deck auto-detect: opacity 1.0
    // + layer2 0.95 + turbidity 9): weak high sun, dirty stratus, lifted fill
    sunElevationDeg: 42, sunAzimuthDeg: 115,
    turbidity: 9, rayleigh: 2.4, mieCoefficient: 0.0025, mieDirectionalG: 0.72,
    fogDensity: 0.00080, fogTintHex: 0x9aa0a6, fogMix: 0.9, envIntensity: 0.30,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xa39f98,
    cloudAltM: 300, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xd9dad6, hemiIntensity: 0.85,
  },

  minimap: {
    base: [104, 102, 92], hard: [96, 96, 98], soft: [84, 88, 76],
    forest: 'rgba(52,66,42,0.85)', forestStroke: 'rgba(32,42,26,0.9)',
    water: 'rgba(70,84,88,0.7)', waterStroke: 'rgba(42,52,56,0.8)',
    roadCasing: 'rgba(30,30,34,0.9)', roadFill: 'rgba(130,130,132,0.95)',
    buildingFill: '#c9c2b2',
  },

  // elevated SW: siding fan + container ranks mid-frame, stacks on the sky
  shot: { pos: [-170, 40, -240], look: [60, 0, 60] },
};
