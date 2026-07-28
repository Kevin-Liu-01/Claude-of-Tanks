// src/world/maps/urban.js — Himmelsdorf/Ensk vibes: a DENSE town core on
// flattened ground — a tight street grid walled with rowhouses, a central
// plaza, ruined shells and rubble at the intersections, park hills outside
// the blocks.

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Street-wall plan: mostly rowhouses so every block frontage reads built-up,
// ruins interleaved (1 in 5) for shelled-town texture, plus real vertical
// landmarks — a church (spire) and a factory (chimney stack) — and two
// squat towers. 'church'/'factory' come from maps/urbanKit.js (registered
// in props.js BUILDER_BY_NAME; they degrade to cottages if unregistered).
const PLAN = [];
for (let i = 0; i < 108; i++) {
  if (i === 4) PLAN.push('church');
  else if (i === 11) PLAN.push('factory');
  else if (i === 9 || i === 41) PLAN.push('tower');
  else if (i % 5 === 2) PLAN.push('ruin');
  else PLAN.push('rowhouse');
}

export default {
  id: 'urban',
  name: 'Steinburg',
  blurb: 'Dense town grid — paved streets, rowhouse blocks, rubble cover',

  terrain: {
    hillScale: 0.55,
    microScale: 0.45,
    rimH: 25,
    marshes: [],
    // Tight core: blocks of ~65 m so the grid actually reads as a town, not
    // farmhouses scattered over 350 m of open grass.
    village: { x0: -168, x1: 168, z0: -152, z1: 176, cx: 36, cz: -16, feather: 55, flatten: 0.94 },
    roads: { grid: { xs: [-112, -40, 36, 112], zs: [-96, -16, 60, 136], jitter: 0.8 } },
  },

  spawns: {
    player: { x: 0, z: -330 },
    enemies: [
      { x: -145, z: 330 }, { x: 0, z: 365 }, { x: 150, z: 330 }, { x: -285, z: 205 },
      { x: 285, z: 195 }, { x: -330, z: -60 }, { x: 335, z: 30 },
    ],
  },

  splat: {
    grassTone: (h, s, l) => [0.19, clamp01(s * 0.5), clamp01(l * 0.86)], // worn town green
    dirtTone: (h, s, l) => [0.09, clamp01(s * 0.35), clamp01(l * 1.02 + 0.03)], // ash-grey rubble dust
    rockTone: (h, s, l) => [0.08, clamp01(s * 0.5), clamp01(l * 1.0)],
    mudTone: (h, s, l) => [0.085, clamp01(s * 0.6), clamp01(l * 0.9)],
    tintA: [1.04, 1.02, 0.92], tintB: [0.86, 0.90, 0.84], tintC: [1.05, 1.03, 0.95],
    roadTint: [0.62, 0.63, 0.72], // dark grey sett/asphalt streets
    // street paving strength: the splat shader lays the cobble/sett layer
    // across the full carriageway at all distances (uRoadTex uniform)
    roadTexMix: 0.85,
    townWear: 1.8, // town-core ground reads packed dirt/rubble dust, not lawn
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
      { x: -255, z: -170, r: 95 }, { x: 260, z: -190, r: 85 },
      { x: -80, z: 275, r: 80 }, { x: 250, z: 265, r: 70 },
    ],
  },

  props: {
    plan: PLAN, // consumed by blockFill for the block interiors
    // street frontage is built by CONTIGUOUS rowhouse strips (shared walls,
    // varied heights, collapsed slots spilling rubble) + kerbed pavements
    streetRows: true,
    curbs: true,
    monument: true,
    blockFill: true,
    tones: {
      plaster: (h, s, l) => [0.10, clamp01(s * 0.5), clamp01(l * 0.92)], // sooty render
      // aged patchwork roofscape: the brighter tiles of the procedural sheet
      // become replaced clay-red tiles, the rest stays dark slate — breaks
      // the single maroon tone the whole town used to wear
      roof: (h, s, l) => (l > 0.35
        ? [0.045, 0.40, clamp01(l * 0.82)]
        : [0.60, 0.15, clamp01(l * 0.70)]),
      stone: (h, s, l) => [0.09, clamp01(s * 0.6), clamp01(l * 0.95)],
      wood: null,
      straw: null,
    },
    ruinChance: 0.30, // street-front collapse rate (streetRows, props.js)
    townCraters: true, // shell holes pock the streets/squares inside the rect
    rockTone: (h, s, l) => [0.09, 0.04, clamp01(l * 1.05)], // concrete rubble chunks
    wallStoneChance: 0.55,
    buildingLat: [9.5, 1.5], // tight, near-constant setback => street walls
    sideSkip: 0.04,
    spacingPad: 2,
    maxSpread: 2.4,
    wallRuns: [
      [-150, -60, -96, -60, 2], [64, -130, 64, -76, 1], [96, 88, 152, 88, 3],
      [-120, 152, -60, 152, 2], [-14, 22, 24, 22, 4], [140, -44, 140, 2, 1],
      [-76, -122, -20, -122, 2], [86, 154, 86, 108, 0],
    ],
    well: true, hayCrates: false, fences: false, telegraph: true, carts: true, logs: false,
    haystacks: 0, rocks: 90, outcrops: 6, craters: 88, rubblePiles: 72,
  },

  horizon: {
    baseHex: 0x525c50, amp: 0.85, style: 'escarpment', treeline: 0.5,
    forestHex: 0x323f30, haze: 1.15,
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

  shot: { pos: [-58, 26, -238], look: [44, 6, 28] },
};
