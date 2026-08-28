// src/world/maps/urban.ts — Himmelsdorf/Ensk vibes: a DENSE town core on
// flattened ground — a tight street grid walled with rowhouses, a central
// plaza, ruined shells and rubble at the intersections, park hills outside
// the blocks.

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// Street-wall plan: mostly rowhouses so every block frontage reads built-up,
// ruins interleaved (1 in 5) for shelled-town texture, plus real vertical
// landmarks — a church (spire) and a factory (chimney stack) — and two
// squat towers. 'church'/'factory' come from maps/urbanKit.ts (registered
// in props.js BUILDER_BY_NAME; they degrade to cottages if unregistered).
const PLAN = [];
for (let i = 0; i < 108; i++) {
  if (i === 4) PLAN.push('church');
  else if (i === 11) PLAN.push('factory');
  else if (i === 15) PLAN.push('firestation');
  else if (i === 25) PLAN.push('tavern');
  else if (i === 37) PLAN.push('schoolhouse');
  else if (i === 9 || i === 41) PLAN.push('tower');
  // world-dressing r1: corner shops (chamfered corner entrance, display
  // glass both faces) salt the block interiors — a third street archetype
  else if (i === 7 || i === 19 || i === 33 || i === 52) PLAN.push('cornershop');
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
    landforms: [
      { kind: 'ridge', x: -274, z: -18, length: 330, width: 72, height: 5.8, yawDeg: 4, settlementScale: 0.82 },
      { kind: 'ridge', x: 276, z: 18, length: 326, width: 72, height: 5.6, yawDeg: -4, settlementScale: 0.82 },
      { kind: 'ridge', x: -12, z: 274, length: 240, width: 64, height: 5.0, yawDeg: 88, settlementScale: 0.84 },
      { kind: 'knoll', x: 208, z: -232, rx: 82, rz: 64, height: 4.8, yawDeg: 18 },
      { kind: 'basin', x: -214, z: -226, rx: 92, rz: 68, height: -2.2, yawDeg: -16 },
    ],
    roads: { grid: { xs: [-112, -40, 36, 112], zs: [-96, -16, 60, 136], jitter: 0.8 } },
  },

  spawns: {
    player: { x: 0, z: -330 },
    // BATTLE-AI r7 TEAM SPAWNS: one enemy spawn arc north of the town (the
    // old list scattered to ±330 x with two points at z<=30 — practically
    // beside the player's own half). Flat-scanned via
    // tools/tmp-ai-r7-spawnscan.mjs — minNy>=0.86, relief<=5 m, outside the
    // town rect by 40 m, >=38 m apart, >=380 m from the player pad.
    enemies: [
      { x: 37, z: 300 }, { x: -18, z: 310 }, { x: 92, z: 310 }, { x: -73, z: 326 },
      { x: 139, z: 318 }, { x: -118, z: 354 }, { x: 192, z: 346 },
    ],
  },

  splat: {
    grassTone: (h: number, s: number, l: number) => [0.19, clamp01(s * 0.5), clamp01(l * 0.86)], // worn town green
    dirtTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.35), clamp01(l * 1.02 + 0.03)], // ash-grey rubble dust
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.5), clamp01(l * 1.0)],
    mudTone: (h: number, s: number, l: number) => [0.085, clamp01(s * 0.6), clamp01(l * 0.9)],
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
    // r5: town-core ground reads packed dirt/rubble dust, not lawn
    // terrain_environment r3: 2.3 -> 1.7 — at 2.3 the wear channel painted
    // one continuous muddy noise smear between the blocks; the new courtyard
    // wear DECALS (props.js) carry structured paths/yards instead
    townWear: 1.7,
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
    tuftTone: (h: number, s: number, l: number) => [0.185, clamp01(s * 0.7), clamp01(l * 0.92)],
    bushCount: 0.85, // r6: garden hedges/shrubs in the yards and block edges
    bushSpecies: 'oak',
    parks: [ // the hill-park belts where town trees are allowed
      { x: -255, z: -170, r: 95 }, { x: 260, z: -190, r: 85 },
      { x: -80, z: 275, r: 80 }, { x: 250, z: 265, r: 70 },
    ],
  },

  props: {
    plan: PLAN, // consumed by blockFill for the block interiors
    destructibleBuildings: ['guardpost', 'checkpointhut', 'fieldhospital', 'transformershed'],
    tacticalBeats: [
      { id: 'western-ringroad-gate', role: 'brawl', x: -250, z: -60, yawDeg: 2,
        structure: 'guardpost', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'eastern-overwatch-post', role: 'scout', x: 245, z: -70, yawDeg: -2,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'northern-relief-yard', role: 'support', x: 8, z: 252, yawDeg: 0,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -14 },
    ],
    // street frontage is built by CONTIGUOUS rowhouse strips (shared walls,
    // varied heights, collapsed slots spilling rubble) + kerbed pavements
    streetRows: true,
    curbs: true,
    monument: true,
    blockFill: true,
    tones: {
      plaster: (h: number, s: number, l: number) => [0.10, clamp01(s * 0.5), clamp01(l * 0.92)], // sooty render
      // r3 (content_breadth): two more render families for the street walls —
      // the whole town recycled ONE white-plaster box ("kit-bash at mid
      // distance" critique). plaster2 = warm ochre-cream (Central European
      // lime render), plaster3 = muted grey-green (weathered distemper).
      // Consumed by the props.js facade-variety patch (handoff r3); inert
      // until that lands.
      plaster2: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.45 + 0.14), clamp01(l * 0.84)],
      plaster3: (h: number, s: number, l: number) => [0.21, clamp01(s * 0.28 + 0.05), clamp01(l * 0.80)],
      // aged clay roofscape. r5: the old two-class split (red tiles vs hue-0.60
      // slate rows) striped every roof red/blue in wide shots — and even
      // neutral grey rows go blue under the sky fill. Keep the whole sheet in
      // one warm clay family: bright tile faces dusty red, dark rows deep
      // warm brown (row shadow), so roofs read tiled, not striped.
      roof: (h: number, s: number, l: number) => (l > 0.35
        ? [0.032, 0.30, clamp01(l * 0.72)]
        : [0.038, 0.24, clamp01(l * 0.55)]),
      stone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.6), clamp01(l * 0.95)],
      wood: null,
      straw: null,
    },
    ruinChance: 0.38, // r1: street-front collapse rate up (war-torn read)
    townCraters: true, // shell holes pock the streets/squares inside the rect
    // r1 (content_breadth): darker, slightly warm-grey rubble — the old pale
    // near-white smooth boulders read as "grey tent blobs" in the foreground
    // fields (critique); dropping the value keeps them below the grass tone
    rockTone: (h: number, s: number, l: number) => [0.085, 0.09, clamp01(l * 0.80)], // concrete rubble chunks
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
    // r7 terrain_environment: craters 88 -> 102, rubble 132 -> 152 — the
    // fought-over brief needs debris fields reading along the main streets
    haystacks: 0, rocks: 70, outcrops: 6, craters: 102, rubblePiles: 152,
    // r6 terrain_environment: street furniture + battle debris — lampposts
    // march the paved grid, anti-tank hedgehogs hold intersections/approaches
    // and two more road wrecks ("urban streets missing furniture, wrecks and
    // debris variety" critique)
    lampposts: true, hedgehogs: 16,
    // DESTRUCTIBLES r1: modern hulks in the streets (baked roster tanks) —
    // the shelled-town read finally includes the armor that died taking it
    tankWrecks: {
      era: 'modern', count: 6, debris: true,
      ids: ['leclerc', 'kf51', 'challenger2', 'm1a2', 't90m', 'leo2a7'],
    },
    sandbagLines: 12,
    // world-dressing r1: brick boundary walls w/ coping; street inhabitants —
    // a market ring on the central square, oil drums + pallet/crate work
    // clutter down the alleys, benches on the pavements (all destructible;
    // the lamppost systems above now ride the topple layer too)
    wallStyle: 'brick',
    inhabit: {
      stalls: 3, benches: 5, coreClutter: 12,
      drums: 12,
      handcarts: 1, carts: 2,
      roadFence: 'fenceplank',
      // DESTRUCTIBLES r1: abandoned vehicles + fuel points down the blocks
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 1,
      modernClutter: { barrier: 8, roadsign: 7, cone: 10, transformer: 5, cablespool: 5 },
    },
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
    // lighting_post r3 (round 3): 0.00078 -> 0.00062 — milky midfield; the
    // engine's FOG_EXTINCTION_SHARE split keeps hue in the aerial pass and
    // buildings at 300 m keep local contrast.
    fogDensity: 0.00062, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
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
