// src/world/maps/mars.ts — Olympus Basin: a rust-red impact basin under a galaxy sky, its research
// station scattered across the floor (owner 2026-09-18: "add mars map mode (called mars mode), make it have
// space bases and make it look like a proper galaxy map"). The sky preset forces the night dome's starfield
// with a wide galactic band, magenta nebula clouds and a large pale planet; a low cold key light keeps the
// dunes and mesas readable. No vegetation: the station pieces, boulders, craters and wrecks carry the field.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export default {
  id: 'mars',
  name: 'Olympus Basin',
  blurb: 'A rust-red impact basin under a galaxy sky, its research station scattered across the floor',

  terrain: {
    hillScale: 0.8,
    microScale: 0.75,
    rimH: 34,
    dunes: { amp: 5.5 },
    mesas: {
      amp: 30, thr0: 0.72, thr1: 0.77,
      wallWidth: 2.0, tierWidth: 0.18, tierScale: 0.24,
      corridorFloor: 1,
    },
    marshes: [],
    // the station compound on the basin floor
    village: { x0: -110, x1: 110, z0: -80, z1: 120, cx: 0, cz: 20, feather: 44, flatten: 0.94 },
    landforms: [
      { kind: 'ridge', x: -262, z: 40, length: 290, width: 84, height: 5.2, yawDeg: 12 },
      { kind: 'ridge', x: 250, z: 70, length: 270, width: 80, height: 4.8, yawDeg: -10 },
      { kind: 'basin', x: -150, z: -190, rx: 112, rz: 84, height: -3.6, yawDeg: -16 },
      { kind: 'basin', x: 170, z: 250, rx: 96, rz: 70, height: -3.0, yawDeg: 24 },
      { kind: 'knoll', x: 40, z: -250, rx: 88, rz: 66, height: 5.4, yawDeg: 20 },
    ],
  },

  spawns: {
    player: { x: 68, z: -82 },
    enemies: [
      { x: -10, z: 378 }, { x: -114, z: 389 }, { x: 59, z: 410 }, { x: -179, z: 365 },
      { x: 96, z: 313 }, { x: -218, z: 364 }, { x: 146, z: 419 },
    ],
  },

  splat: {
    // regolith: rust-orange with a compressed luminance range under the dim cold key light
    grassTone: (h: number, s: number, l: number) => [0.048, 0.50, clamp01(0.20 + l * 0.66)],
    dirtTone: (h: number, s: number, l: number) => [0.040, 0.42, clamp01(0.24 + l * 0.36)],
    sandstone: true,
    rockTone: (h: number, s: number, l: number) => [0.035, clamp01(s * 0.55), clamp01(0.40 + (l - 0.5) * 0.62)],
    mudTone: (h: number, s: number, l: number) => [0.05, 0.36, clamp01(l * 1.2 + 0.06)],
    mudRough: 1.1,
    tintA: [1.06, 0.90, 0.76], tintB: [0.82, 0.66, 0.56], tintC: [1.08, 0.94, 0.82],
    roadTint: [0.86, 0.74, 0.64],
    strata: 0.12,
    microAmp: 0.42,
    rippleDir: [0.7, 0.7],
    rippleAmp: 0.48,
    midRelief: 0.6,
    midReliefFar: 820,
    sandMacro: 1.0,
    // the sourced ground sets: Redrock's rust sand palette (sourcedTextures.ts TERRAIN_PLAN) until Mars owns one
    sourcedPalette: 'badlands',
  },

  vegetation: {
    // no life: the three-archetype species table keeps the vegetation pipeline typed, every count is zero
    species: ['acacia', 'cedar', 'oak'],
    clusterMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    loneMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    rimMix: [['acacia', 0.5], ['cedar', 0.3], ['oak', 0.2]],
    clusterCount: 0,
    loneCount: 0,
    rimCount: 0,
    clusterScrub: 0,
    grassDensity: 0,
    // the ground detail and tuft textures follow the regolith, not the temperate green defaults
    grassTexTone: (h: number, s: number, l: number) => [0.048, clamp01(s * 0.55), clamp01(l * 0.88 + 0.08)],
    tuftTone: (h: number, s: number, l: number) => [0.045, 0.30, clamp01(l * 0.7 + 0.12)],
    bushCount: 0,
    bushSpecies: 'acacia',
  },

  props: {
    // sourced building tints (sourcedTextures BUILDING plan): the badlands dust set for the station's huts
    sourcedPalette: 'badlands',
    // the research station: station pieces carry the compound; the town plan keeps to yard gantries and
    // container rows so nothing reads as a terrestrial street
    plan: ['gantry', 'containerRow', 'containerRow', 'gantry', 'containerRow', 'gantry'],
    // one placement per id (props.ts destructibleBuildings loop; the structureKit receipt pins
    // uniqueness): six orbital pieces plus the station's industrial and military support huts.
    destructibleBuildings: ['habdome', 'habmodule', 'solararray', 'commsmast', 'fueltanks', 'landingpad',
      'quonsethut', 'transformershed', 'motorpool', 'guardpost'],
    tacticalBeats: [
      { id: 'west-habitat-ring', role: 'brawl', x: -246, z: 58, yawDeg: 14,
        structure: 'habdome', redoubt: true, outcrop: { count: 7, radius: 12, scaleMax: 3.4 }, wreck: true, wreckOffsetX: -16 },
      { id: 'east-relay-station', role: 'scout', x: 250, z: 66, yawDeg: -12,
        structure: 'commsmast', outcrop: { count: 6, radius: 10, scaleMax: 3.0 } },
      { id: 'north-fuel-depot', role: 'support', x: 26, z: 268, yawDeg: 4,
        structure: 'fueltanks', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetZ: -15 },
    ],
    sideSkip: 0.14, spacingPad: 8,
    buildingLat: [12, 5], maxSpread: 2.0,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.58, 0.05, clamp01(l * 0.92 + 0.10)],
      roof: (h: number, s: number, l: number) => [0.6, clamp01(s * 0.3), clamp01(l * 1.0)],
      stone: (h: number, s: number, l: number) => [0.04, clamp01(s * 0.9 + 0.05), clamp01(l * 1.0)],
      wood: (h: number, s: number, l: number) => [0.06, clamp01(s * 0.6), clamp01(l * 0.9)],
      straw: null,
    },
    rockTone: (h: number, s: number, l: number) => [0.035, 0.40, clamp01(l * 0.92 + 0.04)],
    wallStoneChance: 1.0,
    wallRuns: [],
    well: false, hayCrates: false, fences: false, telegraph: false, carts: false, logs: false,
    haystacks: 0, rocks: 380, outcrops: 72, craters: 128,
    rubblePiles: 10,
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['m60a3', 'merkava4b', 'm1a2', 'type99a', 'ariete'],
    },
    // 2026-09-19: the station perimeter keeps a ring of steel anti-tank
    // hedgehogs (every map fields complete three-beam compounds).
    sandbagLines: 0,
    hedgehogs: 12,
    wallStyle: 'adobe',
    inhabit: {
      stalls: 0, benches: 0, coreClutter: 6,
      pots: 0,
      troughs: 0, laundry: 0, handcarts: 0, carts: 0,
      trucks: 3, jeeps: 2, drumClusters: 6, camps: 3,
      modernClutter: { barrier: 6, roadsign: 0, cone: 6, transformer: 3, cablespool: 4 },
    },
  },

  horizon: {
    baseHex: 0x6a3a2b, amp: 1.2, style: 'mesa', banding: 0.22,
    rockHex: 0x8a4a34, haze: 0.38, grain: 0.85,
  },

  sky: {
    // galaxy sky: the dimmed dome carries the night starfield with a wide band, nebula clouds and a planet
    skyIntensity: 0.06, nightSky: 1, galaxy: 1.9, nebulaHex: 0x9a4c88, planetDeg: 3.4, planetHex: 0xd2e0ff,
    sunElevationDeg: 24, sunAzimuthDeg: 122,
    turbidity: 2.2, rayleigh: 0.35, mieCoefficient: 0.0045, mieDirectionalG: 0.78,
    fogDensity: 0.00022, fogTintHex: 0x3b2a33, fogMix: 0.72, envIntensity: 0.34,
    cloudOpacity: 0, cloudOpacity2: 0, cloudTintHex: 0xffffff,
    sunIntensity: 3.2, sunColorHex: 0xe4ebff, hemiIntensity: 0.56, fillIntensity: 0.36,
    postExposure: 1.04,
  },

  minimap: {
    base: [128, 70, 48], hard: [146, 90, 66], soft: [104, 58, 42],
    forest: 'rgba(90,60,44,0.6)', forestStroke: 'rgba(60,38,28,0.8)',
    water: 'rgba(80,60,60,0.5)', waterStroke: 'rgba(50,36,36,0.7)',
    roadCasing: 'rgba(70,40,30,0.92)', roadFill: 'rgba(196,150,120,0.95)',
    buildingFill: '#e2e6ea',
  },

  shot: { pos: [-90, 44, -170], look: [50, 8, 160] },
} satisfies import('./contracts.ts').MapCompositionConfig;
