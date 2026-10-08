// src/world/maps/verdant.ts — Verdant Fields, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, the country cross of roads and its junction village with the classic town plan (every
// house and village wall where main has it, restored at the owner's request on 2026-10-03: "the old verdant town plan
// was better") are the map's identity and stay (every field the config leaves undefined still falls back to the
// defaults baked into terrain/vegetation/props); the battlefield around them is new. The old layout put alpha's pad
// beside the village, 457 m from bravo's arc and in its sight, on five generic landforms that eleven other maps then
// copied; the 2v2 pacing receipt's seed 21002 ended in 98 s.
//
// Reference: the black-earth farmland of the Kursk salient around Prokhorovka: open rolling fields on a broad plateau,
// a village where two country roads cross, field shelterbelts and hedgerow banks, and long low swells that hide a
// whole battalion behind them until it crests.
//
// The story on the ground: the two country roads cross at the village. South and north of it a long swell runs east to
// west across the fields, broken where the north-south road crosses it, and screens each team's assembly area from the
// other. Hedgerow banks and the farmsteads along the roads stand between the swells. The layout is rotationally
// symmetric about the village (10, 20) in its landforms, pads, strongpoints and field greens (the country roads and the
// town keep their own course): alpha assembles behind the southern swell's western arm, bravo behind the northern
// swell's eastern arm, so neither sees the other and every approach crests a swell or takes the road through a gap.
// The middle zone and the turbo-ball kickoff stand on the deployments' perpendicular bisector by the town, where the
// houses leave a disc clear.

import { DEFAULT_GARAGE_SKY } from './catalog.ts';

export default {
  id: 'verdant',
  name: 'Verdant Fields',
  blurb: 'Rolling grassland, hedgerows and a road-junction village',

  terrain: {
    // the classic village rect and the country cross of roads stay the defaults (the town plan's frontage lots stand at
    // the cross's 32 m nodes; the map-borders lane grades its exits through the rim); the three default marsh dips go
    hillScale: 0.6,   // the plateau's broad roll (the default 1.0 broke every sightline inside 80 m)
    microScale: 0.75, // field-scale folds (default 1.0)
    // ground lane (wave 69, the establishing view: "near-circular blotches … rather than the rectilinear hedge- and
    // fence-bounded plots a real farmed valley would show"): the village's ground in its plots — yards, kitchen gardens
    // and paddocks running back from the two streets — not 22 m wear patches (terrain.ts createVillagePlotWear)
    villageWear: 'plots',
    // the default rim, stated: the authored border roads' portal shoulders size their support from it
    rimH: 24,
    marshes: [],
    // The village square and the two field greens on the swells' inner slopes: level aprons the zone-control placement
    // seats its 30 m discs on, each clear of the country roads.
    hardstands: [
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): 24 m north onto flatter ground, a 16 m bank
      { x: -250, z: -126, width: 60, length: 60, yawDeg: 0, level: 1.0, grade: 0, bankM: 16 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): 24 m south onto flatter ground, a 16 m bank
      { x: 270, z: 166, width: 60, length: 60, yawDeg: 0, level: 1.5, grade: 0, bankM: 16 },
    ],
    landforms: [
      // The swells: the southern one broken at the north-south road (x -25..50); the northern one is its rotation.
      { kind: 'ridge', x: -190, z: -245, length: 330, width: 80, height: 10, yawDeg: 0 },
      { kind: 'ridge', x: 150, z: -270, length: 200, width: 70, height: 8, yawDeg: 0 },
      { kind: 'ridge', x: 210, z: 285, length: 330, width: 80, height: 10, yawDeg: 0 },
      { kind: 'ridge', x: -130, z: 310, length: 200, width: 70, height: 8, yawDeg: 0 },
      // the barrow on each swell's crest where the line between the pads crosses it (a kurgan, as on the Psyol plateau)
      { kind: 'knoll', x: -75, z: -245, rx: 50, rz: 40, height: 6 },
      { kind: 'knoll', x: 95, z: 285, rx: 50, rz: 40, height: 6 },
      // Hedgerow banks between the swells, each with its rotation: hull-down lines for both teams.
      ...[[-260, -90, 130, 0], [120, -110, 120, 4]].flatMap(([x, z, length, yaw]) => [
        { kind: 'ridge', x, z, length, width: 22, height: 2.4, yawDeg: yaw },
        { kind: 'ridge', x: 20 - x, z: 40 - z, length, width: 22, height: 2.4, yawDeg: yaw },
      ]),
    ],
  },

  spawns: {
    // Alpha assembles behind the southern swell's western arm, 180 m off the north-south road; bravo's seven pads stand
    // behind the northern swell's eastern arm, their centroid the rotation of alpha's pad about the village. Off the
    // road, neither side's first bound runs straight down it into the village. 850 m between the anchors.
    player: { x: -170, z: -365 },
    enemies: [
      { x: 130, z: 390 }, { x: 190, z: 390 }, { x: 250, z: 390 },
      { x: 160, z: 426 }, { x: 220, z: 426 }, { x: 90, z: 408 }, { x: 290, z: 408 },
    ],
  },

  splat: {
    // r2 terrain_environment: agrarian field patchwork (crop plots, mowing
    // strips, field-margin lines) on the 150-800 m band — see terrain.js
    fieldPatch: 1,
    // r7 terrain_environment: full straw/olive/brown macro range — the
    // meadow read as "one saturated spring green" (critique). tintA leans
    // harder into dry straw, tintB is a real olive-brown darkener, tintC a
    // pale hay lift; pairs with the olive-shifted grass layer in terrain.js
    tintA: [1.14, 1.05, 0.78],
    tintB: [0.76, 0.80, 0.62],
    tintC: [1.09, 1.03, 0.80],
    // ground lane (wave 83: "a cold blue-black surface"; wave 88: at 1.16 / 0.95 / 0.75 "a warm reddish-maroon"): the
    // chernozem a very dark brown-black, only a little warm (~0.087 / 0.056 / 0.038), its plough a shade lifted
    // (~0.070 / 0.042 / 0.026, luminance ~0.047: at 0.035 the sky's reflection outweighed it)
    soilTint: [1.04, 0.98, 0.90], ploughLift: 1.35,
  },

  vegetation: {
    species: ['oak', 'poplar', 'willow', 'pine'],
    clusterMix: [['oak', 0.34], ['poplar', 0.28], ['willow', 0.20], ['pine', 0.18]],
    loneMix: [['oak', 0.32], ['poplar', 0.28], ['willow', 0.22], ['pine', 0.18]],
    rimMix: [['pine', 0.32], ['poplar', 0.28], ['oak', 0.24], ['willow', 0.16]],
    // r5 density push: designated forest strips must read as closed tree
    // lines in establishing shots, not loose orchards
    // r2 terrain_environment: midground push — the 250-450 m band read as
    // bald gumdrop hills with sparse tree sprinkles; more clusters + lone
    // trees fill it (far-LOD instances, no shadow casters, cheap)
    clusterCount: 72,
    loneCount: 185,
    rimCount: 102, // closed rim tree line bridging field -> horizon ring
    grassDensity: 1,
    bushCount: 1,
    bushSpecies: 'oak',
  },

  props: {
    // regional-buildings lane: the Prokhorovka kolkhoz kit (maps/regional/kolkhoz.ts)
    architecture: 'kolkhoz',
    // world-dressing r1: farm-theme catalog — farmhouse (L-wing + porch),
    // raised granary, chapel and a tower windmill join the cottage/barn set
    plan: ['farmhouse', 'barn', 'tavern', 'chapel', 'cottage', 'ruin',
      'granary', 'schoolhouse', 'mill', 'cottage', 'farmhouse', 'cottage'],
    destructibleBuildings: ['fieldhut', 'leanto', 'huntingblind', 'commandtent'],
    // Three strongpoint pairs by the country roads and the swells, each the other's rotation about the village.
    tacticalBeats: [
      { id: 'south-road-observer', role: 'scout', x: -60, z: -200, yawDeg: 8,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-road-observer', role: 'scout', x: 80, z: 240, yawDeg: 188,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'south-assembly-post', role: 'brawl', x: 90, z: -320, yawDeg: 0,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'north-assembly-post', role: 'brawl', x: -70, z: 360, yawDeg: 180,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 14 },
      { id: 'west-command-fold', role: 'support', x: -300, z: 0, yawDeg: 90,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -14 },
      { id: 'east-command-fold', role: 'support', x: 320, z: 40, yawDeg: 270,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: 14 },
    ],
    // The village walls of the classic town plan (relative to the classic village rect; restored at the owner's request,
    // 2026-10-03: "the old verdant town plan was better"). The midfield field-boundary walls stay out: the hedgerow
    // banks above are the field edges now.
    wallRuns: [
      [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
      [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1], [-44, 108, -10, 108, 0],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // r2: more midfield material breakup (craters/haystacks) — the open
    // field between orchards and village read as a manicured golf course
    // r4: another push (haystacks 18 -> 26, craters 42 -> 58, outcrops 16 ->
    // 24, rocks 170 -> 195) — the critique still read "one lone bale" and a
    // golf course; paired with the bigger crater radii in props.ts
    haystacks: 26, rocks: 150, outcrops: 18, craters: 58, rubblePiles: 0,
    // Legacy-map quality backport: a deliberate modern wreck cast staged as
    // roadside kills +
    // paired duels (baked static via src/world/wrecks.ts), soft-vehicle and
    // military-clutter dressing, and more sandbag lines along the roads —
    // all destructible (drive-through, shell-breakable)
    // the map-vehicles lane (2026-10-06, the period ruling): Kursk, 1943: the KV-2, the fleet's one Soviet tank of
    // the war
    tankWrecks: { era: 'ww2', count: 5, debris: true, ids: ['kv2'] },
    sandbagLines: 12,
    hedgehogs: 6,
    // r6 terrain_environment: standing grain plots on the open farmland —
    // "summer fields have no crops" was a major dressing gap; pairs with the
    // fieldPatch splat tint so plots sit inside visibly worked fields
    cropFields: 7,
    // ground lane (wave 71 on the close-up: "a picket fence of chopsticks … no ears, awns or leaves"): ripe grain in
    // uneven clumps with its ears and awns (props.ts paintGrainStalk), its plots inside the land use's grain fields
    cropForm: 'grain',
    // world-dressing r1: destructible inhabiting objects — village market by
    // the well, working farm clutter through the yards, round bales + stooks
    // on the open fields; wooden fences are the breakable plank/picket kit
    wallStyle: 'fieldstone',
    // the stone that remains (house plinths, the well, rubble) is a dark, warm fieldstone: the default pale grey read
    // as concrete on the black earth
    tones: {
      stone: (_h: number, s: number, l: number) => [0.075, Math.min(1, s * 1.3 + 0.02), l * 0.76],
    },
    inhabit: {
      stalls: 3, benches: 2, coreClutter: 10,
      bales: 10, stooks: 8,
      troughs: 1, churns: 1, laundry: 1, handcarts: 1, carts: 3,
      roadFence: 'fenceplank', yardFence: 'fencepicket',
      // DESTRUCTIBLES r1: parked supply trucks + field cars on the lanes,
      // fuel-drum clusters (rare red explosive), roadside camps in the
      // hedgerow clearings
      trucks: 3, jeeps: 2, drumClusters: 3, camps: 2,
      modernClutter: { barrier: 4, roadsign: 4, cone: 6, transformer: 3, cablespool: 3 },
    },
  },

  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the black-earth plateau's
  // marks. A standing stone on each kurgan's crown, as the steppe's stone idols stood; an Orthodox roadside cross at the
  // village's south and north entries; a 110 kV line across the southern fields below the swell.
  scenery: {
    landmarks: [
      { kind: 'menhir', x: -75, z: -245, scale: 0.8, height: 2.6, name: 'the standing stone on the south kurgan' },
      { kind: 'menhir', x: 95, z: 285, scale: 0.8, height: 2.6, name: 'the standing stone on the north kurgan' },
      { kind: 'orthodoxcross', x: 14.4, z: -70, yawDeg: 180, name: 'the cross at the south village entry' },
      { kind: 'orthodoxcross', x: 13.9, z: 150, yawDeg: 0, name: 'the cross at the north village entry' },
    ],
    powerLines: [{ towers: [[-440, -170], [-150, -180], [140, -190], [440, -200]], heightM: 30, name: 'the 110 kV line' }],
  },

  horizon: {
    // Low pastoral watersheds and supported woodland across the slopes.
    // The user chose this newer horizon over the original mountain wall.
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the Prokhorovka forest-steppe
    // rolls away to a low skyline of shelterbelts and balka woods: the ring's swells at a third, the far country plain
    baseHex: 0x4d6540, amp: 0.35, style: 'rolling', treeline: 0.94, treelineLayers: 2, panorama: { regional: 'plain' },
    forestHex: 0x33502e, rockHex: 0x77725f, haze: 0.95, grain: 0.7,
  },

  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', streets: 0.45, coverage: 0.36, contrails: 0.35, contrailAge: 0.7 },
  sky: DEFAULT_GARAGE_SKY,

  minimap: {
    base: [70, 94, 52], hard: [104, 96, 78], soft: [48, 70, 54],
    forest: 'rgba(36,64,30,0.82)', forestStroke: 'rgba(22,40,18,0.9)',
    water: 'rgba(50,84,82,0.7)', waterStroke: 'rgba(28,48,48,0.8)',
    roadCasing: 'rgba(46,40,28,0.9)', roadFill: 'rgba(196,178,140,0.95)',
    buildingFill: '#ccd1d9',
  },

  shot: { pos: [-64, 34, -148], look: [80, 0, 156] },
} satisfies import('./contracts.ts').MapCompositionConfig;
