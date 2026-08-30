// src/world/maps/verdant.ts — the classic grassland village battlefield
// (Malinovka/Prokhorovka vibes). This config reproduces the original
// hardcoded map exactly: every field left undefined falls back to the
// defaults baked into terrain/vegetation/props.

export default {
  id: 'verdant',
  name: 'Verdant Fields',
  blurb: 'Rolling grassland, hedgerows and a road-junction village',

  terrain: {
    // defaults: country roads, classic village rect, three marshes
    landforms: [
      { kind: 'ridge', x: -244, z: 18, length: 318, width: 70, height: 6.4, yawDeg: 10 },
      { kind: 'ridge', x: 246, z: 54, length: 304, width: 72, height: 6.0, yawDeg: -14 },
      { kind: 'ridge', x: -54, z: 232, length: 190, width: 56, height: 4.6, yawDeg: 74 },
      { kind: 'knoll', x: 168, z: -218, rx: 82, rz: 62, height: 5.2, yawDeg: 22 },
      { kind: 'basin', x: -142, z: -176, rx: 96, rz: 72, height: -2.4, yawDeg: -16 },
    ],
  },

  spawns: {
    // player pulled 20 m toward the establishing camera (was 14,-78): the
    // battlefield shot must show SEVERAL tanks (contract), and the ally
    // cluster (lateral ±22/44 m) now sits center-frame at ~70 m instead of
    // reading as two dark specks at the frame edge
    player: { x: 2, z: -95 },
    // BATTLE-AI r7 TEAM SPAWNS: the seven enemy points form ONE spawn arc on
    // the enemy base side (two staggered rows around the base bearing) instead
    // of the old mid-map east/west scatter (±330,~135 sat abreast of the
    // village). Cells flat-scanned via tools/tmp-ai-r7-spawnscan.mjs — raw
    // terrain (pads stripped) minNy>=0.86, relief<=5 m over the 22 m pad
    // radius, no soft ground/lakes, >=38 m apart, >=380 m from the player pad.
    enemies: [
      { x: 37, z: 331 }, { x: -25, z: 337 }, { x: 101, z: 322 }, { x: -63, z: 364 },
      { x: 188, z: 382 }, { x: -123, z: 395 }, { x: 235, z: 384 },
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
    tacticalBeats: [
      { id: 'western-hedgerow-post', role: 'brawl', x: -254, z: 64, yawDeg: 12,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: -14 },
      { id: 'eastern-field-observer', role: 'scout', x: 246, z: 70, yawDeg: -12,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'northern-command-fold', role: 'support', x: 24, z: 270, yawDeg: 4,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -14 },
    ],
    wallRuns: [
      // village walls (relative to the classic village rect)
      [-56, 8, -56, 64, 2], [-56, 8, -20, 8, 3], [74, 30, 74, 96, 4],
      [-8, 110, 52, 110, 2], [38, -34, 74, -34, 1], [-44, 108, -10, 108, 0],
      // midfield field-boundary walls
      [-186, -62, -118, -62, 3], [-118, -62, -118, -14, 1], [148, -196, 148, -132, 2],
      [-64, 218, 8, 218, 4], [196, 108, 258, 108, 2], [-266, 66, -212, 66, 1],
      [96, -320, 158, -320, 3],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    // r2: more midfield material breakup (craters/haystacks) — the open
    // field between orchards and village read as a manicured golf course
    // r4: another push (haystacks 18 -> 26, craters 42 -> 58, outcrops 16 ->
    // 24, rocks 170 -> 195) — the critique still read "one lone bale" and a
    // golf course; paired with the bigger crater radii in props.ts
    haystacks: 26, rocks: 195, outcrops: 24, craters: 58, rubblePiles: 0,
    // Legacy-map quality backport: a deliberate modern wreck cast staged as
    // roadside kills +
    // paired duels (baked static via src/world/wrecks.ts), soft-vehicle and
    // military-clutter dressing, and more sandbag lines along the roads —
    // all destructible (drive-through, shell-breakable)
    tankWrecks: {
      era: 'modern', count: 5, debris: true,
      ids: ['m1a1', 'leo2a7', 'challenger2', 'leclerc', 't90a'],
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

  horizon: {
    // warm green uplands: cooler bases washed the whole wall toward denim
    // once the fog lerp stacked on top
    // r7: treeline 0.62 -> 0.94 — the constant-altitude forest cutoff drew a
    // horizontal terrace band across every hill and left the outer domes
    // bald; hills at this distance read forested to the crest
    // r5 terrain_environment: haze 0.85 -> 0.95 — where the aerial ramp ran
    // thin (left third of battlefield.png) the conifer comb resolved as a
    // repeating vertical-stroke carpet; a higher haze floor at ring distance
    // plus the comb's new stand-scale variation breaks the print
    baseHex: 0x4d6540, amp: 1.0, style: 'rolling', treeline: 0.94, treelineLayers: 2,
    // r6: grain 0.7 — the residual granular speckle above the treeline still
    // smeared under tangential grazing on the highest bald summits
    forestHex: 0x33502e, rockHex: 0x77725f, haze: 0.95, grain: 0.7,
  },

  sky: {
    sunElevationDeg: 32, sunAzimuthDeg: 115,
    turbidity: 4, rayleigh: 1.2, mieCoefficient: 0.006, mieDirectionalG: 0.82,
    fogDensity: 0.00074, fogTintHex: 0x7e97b8, fogMix: 0.55, envIntensity: 0.2,
    cloudOpacity: 1.0, cloudOpacity2: 0.6, cloudTintHex: 0xffffff,
    sunIntensity: 4.5, sunColorHex: 0xfff1dc, hemiIntensity: 0.32,
  },

  minimap: {
    base: [70, 94, 52], hard: [104, 96, 78], soft: [48, 70, 54],
    forest: 'rgba(36,64,30,0.82)', forestStroke: 'rgba(22,40,18,0.9)',
    water: 'rgba(50,84,82,0.7)', waterStroke: 'rgba(28,48,48,0.8)',
    roadCasing: 'rgba(46,40,28,0.9)', roadFill: 'rgba(196,178,140,0.95)',
    buildingFill: '#ccd1d9',
  },

  shot: { pos: [-64, 34, -148], look: [80, 0, 156] },
} satisfies import('../terrain.ts').TerrainMapConfig & Record<string, unknown>;
