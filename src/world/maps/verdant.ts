// src/world/maps/verdant.ts — Verdant Fields, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, the country cross of roads (on its classic courses, now authored paths whose exits are
// graded through the rim) and its junction village are the map's identity and stay (every field the config leaves
// undefined still falls back to the defaults baked into terrain/vegetation/props); the battlefield around them is new. The old layout put alpha's pad beside the village, 457 m from bravo's arc and in
// its sight, on five generic landforms that eleven other maps then copied; the 2v2 pacing receipt's seed 21002 ended
// in 98 s.
//
// Reference: the black-earth farmland of the Kursk salient around Prokhorovka: open rolling fields on a broad plateau,
// a village where two country roads cross, field shelterbelts and hedgerow banks, and long low swells that hide a
// whole battalion behind them until it crests.
//
// The story on the ground: the two country roads cross at the village. South and north of it a long swell runs east to
// west across the fields, broken where the north-south road crosses it, and screens each team's assembly area from the
// other. Hedgerow banks and the farmsteads along the roads stand between the swells. The layout is rotationally
// symmetric about the village (10, 20) in its landforms, pads, strongpoints and objectives (the country roads keep
// their own course): alpha assembles behind the southern swell's western arm, bravo behind the northern swell's eastern
// arm, so neither sees the other and every approach crests a swell or takes the road through a gap.

import { DEFAULT_GARAGE_SKY } from './catalog.ts';

// The two country roads on their classic courses (terrain.ts buildCountryRoads), as authored paths that stop inside
// the square, so the endpoint completion grades each exit through the rim (the full-span country cross climbed the
// rim at 30-36 %).
const countryNorthSouth = Array.from({ length: 29 }, (_, k): [number, number] => {
  const z = -448 + k * 32;
  return [10 + 26 * Math.sin(z * 0.0062) + 8 * Math.sin(z * 0.017 + 2.1), z];
});
const countryEastWest = Array.from({ length: 29 }, (_, k): [number, number] => {
  const x = -448 + k * 32;
  return [x, 46 + 34 * Math.sin(x * 0.0043 + 1.0) + 7 * Math.sin(x * 0.013 - 0.6)];
});

export default {
  id: 'verdant',
  name: 'Verdant Fields',
  blurb: 'Rolling grassland, hedgerows and a road-junction village',

  terrain: {
    // the classic village rect stays the default; the three default marsh dips go
    roads: { paths: [countryNorthSouth, countryEastWest] },
    hillScale: 0.6,   // the plateau's broad roll (the default 1.0 broke every sightline inside 80 m)
    microScale: 0.75, // field-scale folds (default 1.0)
    // the default rim, stated: the authored border roads' portal shoulders size their support from it
    rimH: 24,
    marshes: [],
    // The village square and the two field greens on the swells' inner slopes: level aprons the zone-control placement
    // seats its 30 m discs on, each clear of the country roads.
    hardstands: [
      { x: 10, z: 20, width: 60, length: 60, yawDeg: 0, grade: 0 },
      { x: -250, z: -150, width: 60, length: 60, yawDeg: 0, level: 0.9, grade: 0 },
      { x: 270, z: 190, width: 60, length: 60, yawDeg: 0, level: 2.7, grade: 0 },
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
    wallRuns: [
      // village walls (relative to the classic village rect)
      [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
      [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1], [-44, 108, -10, 108, 0],
      // field walls on the hedgerow banks between the swells, each with its rotation about the village
      [-320, -60, -260, -60, 3], [340, 100, 280, 100, 3], [80, -150, 150, -150, 2], [-60, 190, -130, 190, 2],
      [-160, -150, -100, -150, 1], [180, 190, 120, 190, 1],
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
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['m551_sheridan', 'marder1a3', 'leo2a7v', 'm1a1', 't90a'],
    },
    sandbagLines: 12,
    hedgehogs: 6,
    // r6 terrain_environment: standing grain plots on the open farmland —
    // "summer fields have no crops" was a major dressing gap; pairs with the
    // fieldPatch splat tint so plots sit inside visibly worked fields
    cropFields: 7,
    // world-dressing r1: destructible inhabiting objects — village market by
    // the well, working farm clutter through the yards, round bales + stooks
    // on the open fields; wooden fences are the breakable plank/picket kit
    wallStyle: 'fieldstone',
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
    baseHex: 0x4d6540, amp: 1.0, style: 'rolling', treeline: 0.94, treelineLayers: 2,
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
