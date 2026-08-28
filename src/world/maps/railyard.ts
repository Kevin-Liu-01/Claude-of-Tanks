// src/world/maps/railyard.ts — maps r1: flat brownfield rail depot under an
// overcast sky (Ensk's industrial quarter, minus the town). Warehouse rows,
// container ranks and gantry cranes along a fan of sidings (maps/mapKits.ts
// lays the physical track geometry), smokestack verticals, concrete/gravel
// splats, lamppost-lined paved roads and heavy battle scarring.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Yard plan: industry-heavy with a couple of worker rowhouses and ruins so
// the depot reads lived-in and fought-over. 'warehouse'/'containerRow'/
// 'gantry'/'watertower'/'stack'/'shed' come from maps/railKit.ts; 'factory'
// from maps/urbanKit.ts.
const PLAN = [
  // world-dressing r1: 'depot' (canopied platform hall, maps/villageKit.ts)
  // anchors the passenger side of the yard
  'warehouse', 'containerRow', 'factory', 'depot', 'foundryoffice', 'watertower',
  'containerRow', 'ruin', 'warehouse', 'gantry', 'stack', 'shed',
  'containerRow', 'depot', 'ruin', 'rowhouse', 'shed', 'containerRow',
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
    landforms: [
      { kind: 'ridge', x: -286, z: -8, length: 348, width: 76, height: 5.2, yawDeg: 2, settlementScale: 0.86 },
      { kind: 'ridge', x: 286, z: 12, length: 344, width: 76, height: 5.0, yawDeg: -2, settlementScale: 0.86 },
      { kind: 'ridge', x: -8, z: 286, length: 270, width: 66, height: 4.8, yawDeg: 88, settlementScale: 0.86 },
      { kind: 'knoll', x: 226, z: -248, rx: 82, rz: 62, height: 5.6, yawDeg: 18 },
      { kind: 'basin', x: -224, z: -244, rx: 92, rz: 68, height: -2.0, yawDeg: -16 },
    ],
  },

  spawns: {
    player: { x: 0, z: -330 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc north of the yard (the
    // old list scattered to ±330 x with two points at z<=30 — beside the
    // player's own half). Flat-scanned via tools/tmp-ai-r7-spawnscan.mjs —
    // minNy>=0.86, relief<=5 m, outside the yard rect by 40 m, >=38 m apart,
    // >=380 m from the player pad.
    enemies: [
      { x: -9, z: 350 }, { x: -64, z: 360 }, { x: 46, z: 360 }, { x: -119, z: 376 },
      { x: 85, z: 392 }, { x: -164, z: 397 }, { x: 146, z: 396 },
    ],
  },

  splat: {
    grassTone: (h: number, s: number, l: number) => [0.16, clamp01(s * 0.42), clamp01(l * 0.88)], // trodden verge scrub
    dirtTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.30), clamp01(l * 0.98 + 0.02)], // ash/cinder
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.25), clamp01(l * 0.95)], // concrete grey
    mudTone: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.5), clamp01(l * 0.9)],
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
    grassTexTone: (h: number, s: number, l: number) => [0.14, clamp01(s * 0.55), clamp01(l * 0.95)],
    tuftTone: (h: number, s: number, l: number) => [0.135, clamp01(s * 0.6), clamp01(l * 0.88)],
    palettes: {
      oak: { // soot-dulled wasteland scrub
        texTone: (h: number, s: number, l: number) => [clamp01(h * 0.85), clamp01(s * 0.6), clamp01(l * 0.94)],
        cardHue: 0.17, cardSat: 0.22,
        canopy: { hue: 0.18, sat: 0.22, l0: 0.24, l1: 0.36 },
      },
      birch: {
        texTone: (h: number, s: number, l: number) => [0.12, clamp01(s * 0.5), clamp01(l * 0.9 + 0.04)],
        cardHue: 0.14, cardSat: 0.26, cardL0: 0.36,
        canopy: { hue: 0.15, sat: 0.26, l0: 0.32, l1: 0.46 },
        jitterHue: 0.5,
      },
    },
  },

  props: {
    plan: PLAN,
    destructibleBuildings: ['quonsethut', 'transformershed', 'motorpool', 'guardpost'],
    tacticalBeats: [
      { id: 'western-freight-gate', role: 'brawl', x: -250, z: -68, yawDeg: 0,
        structure: 'motorpool', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -15 },
      { id: 'eastern-switch-post', role: 'scout', x: 245, z: -70, yawDeg: 0,
        structure: 'guardpost', outcrop: { count: 4, radius: 8, scaleMax: 2.5 } },
      { id: 'northern-power-yard', role: 'support', x: -8, z: 260, yawDeg: 0,
        structure: 'transformershed', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
    ],
    blockFill: true, // r3: leftover plan slots fill the block interiors
    sideSkip: 0.08, spacingPad: 6,
    buildingLat: [12, 5], maxSpread: 2.4,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.30), clamp01(l * 0.88)], // sooty render
      plaster2: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.35 + 0.06), clamp01(l * 0.80)],
      plaster3: (h: number, s: number, l: number) => [0.55, clamp01(s * 0.15 + 0.03), clamp01(l * 0.78)],
      roof: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.18), clamp01(l * 0.80 + 0.04)], // weathered sheet grey (r2: lifted — read near-black under the deck)
      stone: (h: number, s: number, l: number) => [0.05, clamp01(s * 0.55 + 0.08), clamp01(l * 0.98 + 0.03)], // smoke-stained brick (r2: lifted)
      wood: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.55), clamp01(l * 0.85)], // creosoted timber
      straw: null,
    },
    rockTone: (h: number, s: number, l: number) => [0.085, 0.07, clamp01(l * 0.82)], // concrete rubble
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
    lampposts: true, hedgehogs: 10,
    // Legacy-map quality backport: modern hulks on the yard aprons (baked roster tanks) —
    // the armor that fought over the railhead
    tankWrecks: {
      era: 'modern', count: 6, debris: true,
      ids: ['kf51', 'challenger2', 'leo2a7', 'leclerc', 't90m', 'type99a'],
    },
    sandbagLines: 10,
    // world-dressing r1: brick yard walls; industrial inhabitants — oil-drum
    // ranks + pallet/crate stacks along the aprons, benches by the depot
    wallStyle: 'brick',
    inhabit: {
      benches: 3, coreClutter: 10,
      drums: 16,
      handcarts: 1, carts: 1,
      roadFence: 'fencerail',
      // DESTRUCTIBLES r1: railhead logistics — truck ranks on the aprons,
      // fuel points between the sidings, ammo stacks
      trucks: 4, jeeps: 1, drumClusters: 4, camps: 1,
      modernClutter: { barrier: 9, roadsign: 7, cone: 10, transformer: 7, cablespool: 7 },
    },
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
