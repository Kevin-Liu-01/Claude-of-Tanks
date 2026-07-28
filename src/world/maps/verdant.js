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
    player: { x: 14, z: -78 },
    enemies: [
      { x: -30, z: 320 }, { x: 140, z: 350 }, { x: 265, z: 235 }, { x: -215, z: 270 },
      { x: -330, z: 140 }, { x: 330, z: 130 }, { x: 15, z: 430 },
    ],
  },

  splat: {}, // stock grass/dirt/rock/mud palette

  vegetation: {
    species: ['pine', 'oak'],
    clusterMix: [['pine', 0.55], ['oak', 0.45]],
    loneMix: [['pine', 0.5], ['oak', 0.5]],
    rimMix: [['pine', 0.7], ['oak', 0.3]],
    clusterCount: 46,
    loneCount: 95,
    rimCount: 58,
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
    haystacks: 15, rocks: 170, outcrops: 16, craters: 30, rubblePiles: 0,
  },

  horizon: { baseHex: 0x38542c, amp: 1.0 },

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
