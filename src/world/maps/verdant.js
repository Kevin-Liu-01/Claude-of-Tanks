// src/world/maps/verdant.js — the classic grassland village battlefield
// (Malinovka/Prokhorovka vibes). This config reproduces the original
// hardcoded map exactly: every field left undefined falls back to the
// defaults baked into terrain/vegetation/props.

export default {
  id: 'verdant',
  name: 'Verdant Fields',
  blurb: 'Rolling grassland, hedgerows and a road-junction village',

  terrain: {
    // defaults: country roads, classic village rect, three marshes
  },

  spawns: {
    // player pulled 20 m toward the establishing camera (was 14,-78): the
    // battlefield shot must show SEVERAL tanks (contract), and the ally
    // cluster (lateral ±22/44 m) now sits center-frame at ~70 m instead of
    // reading as two dark specks at the frame edge
    player: { x: 2, z: -95 },
    enemies: [
      { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
      { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
    ],
  },

  splat: {
    // r2 terrain_environment: agrarian field patchwork (crop plots, mowing
    // strips, field-margin lines) on the 150-800 m band — see terrain.js
    fieldPatch: 1,
    // dry-straw meadow tint softened off pure lime (was the default
    // 1.16/1.08/0.76 — hot yellow-green patches beside dark clover)
    tintA: [1.11, 1.05, 0.84],
  },

  vegetation: {
    species: ['pine', 'oak'],
    clusterMix: [['pine', 0.55], ['oak', 0.45]],
    loneMix: [['pine', 0.5], ['oak', 0.5]],
    rimMix: [['pine', 0.7], ['oak', 0.3]],
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
    plan: ['cottage', 'barn', 'cottage', 'tower', 'cottage', 'ruin',
      'cottage', 'barn', 'cottage', 'cottage'],
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
    // golf course; paired with the bigger crater radii in props.js
    haystacks: 26, rocks: 195, outcrops: 24, craters: 58, rubblePiles: 0,
  },

  horizon: {
    // warm green uplands: cooler bases washed the whole wall toward denim
    // once the fog lerp stacked on top
    // r7: treeline 0.62 -> 0.94 — the constant-altitude forest cutoff drew a
    // horizontal terrace band across every hill and left the outer domes
    // bald; hills at this distance read forested to the crest
    baseHex: 0x4d6540, amp: 1.0, style: 'rolling', treeline: 0.94,
    // r6: grain 0.7 — the residual granular speckle above the treeline still
    // smeared under tangential grazing on the highest bald summits
    forestHex: 0x33502e, rockHex: 0x77725f, haze: 0.85, grain: 0.7,
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
};
