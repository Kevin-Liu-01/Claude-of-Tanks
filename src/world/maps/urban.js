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
  // r1 (content_breadth): second ruin cadence — the town read too intact for
  // a battle-ready map ("rubble/destruction dressing too sparse"); ~1 in 3.5
  // interior slots is now a shelled ruin, clustering into visibly collapsed
  // blocks where the two cadences overlap
  else if (i % 5 === 2 || i % 9 === 5) PLAN.push('ruin');
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
    // r6: relief 0.30 (new knob, terrain.js) — keep ~30% of the smooth
    // terrain drift inside the town rect so the grid rolls over 1-3 m of
    // elevation instead of sitting on a perfectly flat pancake
    village: { x0: -168, x1: 168, z0: -152, z1: 176, cx: 36, cz: -16, feather: 55, flatten: 0.92, relief: 0.30 },
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
    // r6: [0.62,0.63,0.72] (B > R) over the pale sourced sett sheet + blue sky
    // fill rendered every street as a bluish-white water channel in the
    // establishing shot — pull the carriageway DOWN to a neutral warm asphalt
    // grey (R >= B) so streets read paved, not flooded.
    // (rebalanced up from 0.445: the splat shader now darkens the sett sheet
    // itself — 0.72+0.22 pvar — so the two stacked went near-black)
    roadTint: [0.58, 0.565, 0.53],
    // street paving strength: the splat shader lays the cobble/sett layer
    // across the full carriageway at all distances (uRoadTex uniform)
    roadTexMix: 0.85,
    townWear: 2.3, // r5: town-core ground reads packed dirt/rubble dust, not lawn
  },

  vegetation: {
    species: ['oak', 'pine'],
    clusterMix: [['oak', 0.7], ['pine', 0.3]],
    loneMix: [['oak', 0.8], ['pine', 0.2]],
    rimMix: [['pine', 0.6], ['oak', 0.4]],
    clusterCount: 14,
    loneCount: 40,
    rimCount: 72, // r7: fuller rim forest under the serrated backdrop tree line
    grassDensity: 0.5,
    tuftTone: (h, s, l) => [0.185, clamp01(s * 0.7), clamp01(l * 0.92)],
    bushCount: 0.85, // r6: garden hedges/shrubs in the yards and block edges
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
      // aged clay roofscape. r5: the old two-class split (red tiles vs hue-0.60
      // slate rows) striped every roof red/blue in wide shots — and even
      // neutral grey rows go blue under the sky fill. Keep the whole sheet in
      // one warm clay family: bright tile faces dusty red, dark rows deep
      // warm brown (row shadow), so roofs read tiled, not striped.
      roof: (h, s, l) => (l > 0.35
        ? [0.032, 0.30, clamp01(l * 0.72)]
        : [0.038, 0.24, clamp01(l * 0.55)]),
      stone: (h, s, l) => [0.09, clamp01(s * 0.6), clamp01(l * 0.95)],
      wood: null,
      straw: null,
    },
    ruinChance: 0.38, // r1: street-front collapse rate up (war-torn read)
    townCraters: true, // shell holes pock the streets/squares inside the rect
    // r1 (content_breadth): darker, slightly warm-grey rubble — the old pale
    // near-white smooth boulders read as "grey tent blobs" in the foreground
    // fields (critique); dropping the value keeps them below the grass tone
    rockTone: (h, s, l) => [0.085, 0.09, clamp01(l * 0.80)], // concrete rubble chunks
    wallStoneChance: 0.55,
    buildingLat: [9.5, 1.5], // tight, near-constant setback => street walls
    sideSkip: 0.04,
    spacingPad: 2,
    maxSpread: 2.4,
    wallRuns: [
      [-150, -60, -96, -60, 2], [64, -130, 64, -76, 1], [96, 88, 152, 88, 3],
      [-120, 152, -60, 152, 2], [-14, 22, 24, 22, 4], [140, -44, 140, 2, 1],
      [-76, -122, -20, -122, 2], [86, 154, 86, 108, 0],
      // r6: field-boundary walls in the open approaches (the establishing
      // camera at z~-240 saw nothing but empty lawn between it and the town)
      [-96, -206, -38, -206, 2], [8, -188, 66, -188, 3],
      [-46, -236, -46, -178, 1], [104, -172, 152, -172, 2],
      [-160, -180, -112, -180, 3],
      // r6: courtyard/garden wall rectangles inside the blocks — the map spec
      // calls for yards behind the street rows, not bare block interiors
      [-88, 8, -60, 8, 2], [-88, 8, -88, 38, 1], [-60, 8, -60, 38, 2],
      [58, -66, 92, -66, 1], [58, -66, 58, -40, 3], [92, -66, 92, -40, 1],
      [-16, 84, 16, 84, 2], [-16, 84, -16, 116, 1], [16, 84, 16, 116, 3],
      [64, 96, 96, 96, 1], [96, 96, 96, 126, 2],
    ],
    // r6: fences on — split-rail runs break up the open outskirt fields
    well: true, hayCrates: false, fences: true, telegraph: true, carts: true, logs: false,
    // r1: fewer bare boulders (they read as blobs on lawn), more rubble piles
    haystacks: 0, rocks: 70, outcrops: 6, craters: 88, rubblePiles: 132,
  },

  horizon: {
    // r7: treeline 0.5 -> 0.92 — kills the bald-ramp band above the forest
    // cutoff (see verdant.js note)
    baseHex: 0x525c50, amp: 0.85, style: 'escarpment', treeline: 0.92,
    forestHex: 0x323f30, haze: 1.15,
  },

  sky: {
    sunElevationDeg: 36, sunAzimuthDeg: 115,
    // lighting_post r5: turbidity 5.5->4.0, mie 0.007->0.005, fog 0.00092->
    // 0.00078 — finishes the engine-side haze-cap/far-shadow work; the urban
    // horizon share read as bleached white.
    turbidity: 4.0, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.8,
    fogDensity: 0.00078, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
    cloudOpacity: 0.85, cloudOpacity2: 0.5, cloudTintHex: 0xe8e4dc,
    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,
  },

  minimap: {
    base: [98, 104, 90], hard: [92, 92, 98], soft: [70, 84, 72],
    forest: 'rgba(48,72,40,0.85)', forestStroke: 'rgba(30,46,26,0.9)',
    water: 'rgba(70,88,90,0.7)', waterStroke: 'rgba(40,54,56,0.8)',
    roadCasing: 'rgba(34,34,40,0.9)', roadFill: 'rgba(138,138,142,0.95)',
    buildingFill: '#d9d2c4',
  },

  // r9: camera pulled ~30 m closer and 8 m higher — from z=-238 nearly half
  // the establishing frame was the empty grass approach field; the town brief
  // is "street grid, rowhouses, rubble", so the grid should fill the frame
  shot: { pos: [-48, 34, -208], look: [46, 2, 20] },
};
