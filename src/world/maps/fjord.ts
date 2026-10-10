// fjord.js — cold-water harbor approaches with a clipped coastal road grid,
// fishing yards, stone settlement, steep conifer shoulders and a deep bay.

import { gully, talusFan } from './geology.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export default {
  id: 'fjord',
  name: 'Nordhavn Fjord',
  blurb: 'A cold fjord harbor where cliff roads descend into a battered fishing town',
  terrain: {
    hillScale: 1.22, microScale: 0.92, rimH: 42, softLakes: true,
    coastRimFadeM: 90, // round 47 follow-up: the peninsulas between the arms climb to the rim over 90 m, not in one block
    // round 47 follow-up (2026-09-23, owner: "evident right angle with shore and water at the border"): three fjord ARMS
    // instead of three round bays — each disc is a westward lobe (stations start east and wind toward +z: 8 is the head,
    // 4 and 12 the narrow flanks at 0.44–0.50), the arms share one mouth past the red line, and two rock peninsulas
    // (the ridges below) run between them; the harbour terraces meet the heads at x ≈ 250–290 as before. The banks
    // grade over 0.14 of the local radius (15 m on a flank, 35 m at a head) — the fitted third of the radius pulled the
    // peninsulas down to the water level and buried their ridges.
    // No beached boats: a clinker hull on a 0.14 R rock bank buries its tips (beachedBoat.selftest); the three jetties,
    // buoys and driftwood keep the harbour dressing.
    lakes: [
      { x: 438, z: -142, r: 188, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.82, 0.60, 0.46, 0.50, 0.68, 0.93, 1.00, 0.94, 0.70, 0.52, 0.46, 0.58, 0.80, 0.96] },
      { x: 466, z: 70, r: 176, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.80, 0.58, 0.44, 0.50, 0.70, 0.95, 1.00, 0.95, 0.70, 0.50, 0.44, 0.56, 0.78, 0.96] },
      { x: 442, z: 262, r: 152, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.82, 0.60, 0.50, 0.56, 0.72, 0.94, 1.00, 0.95, 0.74, 0.54, 0.46, 0.56, 0.80, 0.96] },
    ],
    marshes: [{ x: 286, z: -218, r: 36, dip: 1.0 }],
    // 2026-10-03 (maps lane B): the north end of the two central roads crosses the terrace scarp under the northern
    // deployment (8-9 m in 30 m) on a diagonal instead of straight up it — 21-26 % at terrain seed 1337 — and then runs
    // north in parallel, 12 m apart, to the shared border cut roadBorderCorridor.ts grades
    // (alignFjordNorthernRoadGrades); the northern cross road meets the east road on the flat below the scarp, where
    // the two stand at one height.
    roads: { paths: [
      [[-398, -454], [-346, -278], [-318, -82], [-338, 116], [-286, 302], [-220, 474]],
      [[-126, -464], [-74, -286], [-32, -114], [18, 44], [62, 226], [36, 330], [106, 394], [106, 440]],
      [[214, -432], [228, -274], [202, -104], [222, 62], [190, 220], [172, 330], [118, 394], [118, 440]],
      [[-330, -204], [-192, -154], [-48, -96], [88, -52], [212, -94]],
      [[-312, 224], [-164, 198], [-28, 224], [102, 284], [180, 300]],
    ] },
    village: { x0: -210, x1: 254, z0: -286, z1: 278, cx: 18, cz: -8, feather: 48, flatten: 0.72, relief: 0.22 },
    landforms: [
      { kind: 'ridge', x: -272, z: 24, length: 420, width: 92, height: 11.5, yawDeg: 8, corridorScale: 0.78 },
      { kind: 'ridge', x: 118, z: 286, length: 230, width: 74, height: 7.4, yawDeg: 72 },
      { kind: 'ridge', x: 62, z: -292, length: 210, width: 68, height: 6.8, yawDeg: 76 },
      { kind: 'ridge', x: -42, z: 34, length: 250, width: 62, height: 7.6, yawDeg: 42, corridorScale: 0.76, settlementScale: 0.62 },
      { kind: 'ridge', x: 176, z: -108, length: 190, width: 54, height: 6.2, yawDeg: -38, corridorScale: 0.74, settlementScale: 0.64 },
      { kind: 'knoll', x: -112, z: 188, rx: 78, rz: 62, height: 6.4, yawDeg: -24 },
      { kind: 'basin', x: 252, z: 32, rx: 98, rz: 150, height: -3.2, yawDeg: 3, wetScale: 0.8 },
      // round 47 follow-up: the rock peninsulas between the fjord arms and the walls outside them — the arms' water
      // flattening wins inside the lobes, so each ridge's flanks drop straight into the fjord
      { kind: 'ridge', x: 395, z: -32, length: 210, width: 50, height: 13.0, yawDeg: 0 },
      { kind: 'ridge', x: 395, z: 170, length: 210, width: 46, height: 12.0, yawDeg: 0 },
      { kind: 'ridge', x: 430, z: -268, length: 170, width: 56, height: 12.0, yawDeg: -4 },
      { kind: 'ridge', x: 430, z: 378, length: 160, width: 56, height: 11.0, yawDeg: 4 },
      // 2026-10-03 (maps lane B): glacial geology (geology.ts). Roches moutonnées on the heights outside the town — the
      // ice that dug the fjord flowed east, so each knob rises gently from the west and breaks off steep to the east (a
      // long low dome with a short steep one at its lee end); two gullies cut the western heights' south face; and
      // scree cones lie at the feet of the two rock peninsulas on the harbour side.
      { kind: 'knoll', x: -400, z: -140, rx: 30, rz: 18, height: 3.0, yawDeg: 4 },
      { kind: 'knoll', x: -384, z: -139, rx: 10, rz: 14, height: 2.0, yawDeg: 4 },
      { kind: 'knoll', x: -432, z: -30, rx: 28, rz: 17, height: 2.8, yawDeg: -6 },
      { kind: 'knoll', x: -417, z: -32, rx: 10, rz: 13, height: 1.8, yawDeg: -6 },
      { kind: 'knoll', x: -384, z: 182, rx: 30, rz: 18, height: 3.2, yawDeg: 10 },
      { kind: 'knoll', x: -368, z: 185, rx: 10, rz: 14, height: 2.0, yawDeg: 10 },
      { kind: 'knoll', x: 300, z: -300, rx: 26, rz: 16, height: 2.6, yawDeg: -8 },
      { kind: 'knoll', x: 314, z: -302, rx: 9, rz: 12, height: 1.8, yawDeg: -8 },
      ...gully(-400, -70, -404, -10, 3.2, 11, 5),
      ...gully(-296, -66, -300, -8, 3.0, 10, -5),
      ...talusFan(350, -20, 310, -22, 36, 1.8),
      ...talusFan(352, 150, 312, 152, 34, 1.7),
    ],
  },
  spawns: {
    player: { x: -310, z: -350 },
    // 2026-10-03 (maps lane B, after the bots lane's deployment finding): bravo deploys in a 4 x 2 block, the rotation
    // of alpha's (8 m columns, 10 m rows; pad k is the rotation of alpha's slot k), 17 m west of its old line's centroid
    // (-7, 384), on the flattest ground near it. Its seven pads had spread about 430 m along the north edge while
    // alpha's seven start in a block, and the bots lane's swap test on Titan Gorge showed that such a lean follows the
    // deployment, not the team. The anchors the objectives derive from barely move.
    enemies: [
      { x: -9, z: 375 }, { x: -17, z: 375 }, { x: -25, z: 375 }, { x: -33, z: 375 },
      { x: -9, z: 385 }, { x: -17, z: 385 }, { x: -25, z: 385 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.39, clamp01(s * 0.34), clamp01(l * 0.82 + 0.03)],
    dirtTone: (h: number, s: number, l: number) => [0.09, clamp01(s * 0.28), clamp01(l * 0.88)],
    rockTone: (h: number, s: number, l: number) => [0.58, clamp01(s * 0.18), clamp01(l * 0.92 + 0.04)],
    mudTone: (h: number, s: number, l: number) => [0.54, clamp01(s * 0.85), clamp01(l * 0.68)],
    seaLake: true, seaFoam: 0.54, seaRamp: [0.22, 0.58], iceDrift: 0.08,
    marshGloss: 0.94, iceSky: [0.24, 0.39, 0.50],
    tintA: [0.86, 0.94, 0.92], tintB: [0.63, 0.72, 0.70], tintC: [0.98, 1.04, 1.02],
    roadTint: [0.66, 0.68, 0.67], midRelief: 0.94,
  },
  vegetation: {
    species: ['spruce', 'fir', 'birch'], clusterMix: [['spruce', 0.58], ['fir', 0.32], ['birch', 0.10]],
    loneMix: [['spruce', 0.50], ['fir', 0.30], ['birch', 0.20]], rimMix: [['spruce', 0.66], ['fir', 0.29], ['birch', 0.05]],
    // map pass 2026-09-12: the harbour terraces read as smooth lawn; dwarf
    // spruce scrub and more coastal rock give the slopes a fjord texture.
    clusterCount: 86, loneCount: 146, rimCount: 132, grassDensity: 0.78,
    bushCount: 1.15, bushSpecies: 'spruce',
  },
  props: {
    plan: ['fishery', 'netyard', 'depot', 'logcabin', 'alpine',
      'warehouse', 'boatshed', 'chapel', 'cornershop', 'ruin', 'netyard', 'depot', 'logcabin',
      'warehouse', 'boatshed', 'netyard', 'logcabin', 'alpine', 'depot', 'woodshed', 'chapel',
      'boatshed', 'warehouse', 'logcabin', 'ruin', 'netyard', 'depot'],
    destructibleBuildings: ['fishershack', 'saunahut', 'alpinerefuge', 'quonsethut'],
    tacticalBeats: [
      // 2026-10-03 (maps lane B): the gate moves from (-286, 62), 33 m from Verdant's western post, down the cliff road
      // to its southern bend (the layout brief's skeleton rule: no strongpoint within 60 m of one of Verdant's)
      { id: 'western-cliff-gate', role: 'brawl', x: -312, z: 20, yawDeg: 6,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 7, radius: 11 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'harbor-watch', role: 'scout', x: 206, z: -184, yawDeg: -12,
        structure: 'fishershack', outcrop: { count: 4, radius: 8, scaleMax: 2.7 } },
      { id: 'northern-service-yard', role: 'support', x: -252, z: 286, yawDeg: 28,
        structure: 'quonsethut', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
    ],
    // 2026-10-03 (maps lane B, gauntlet wave 28: "the town and an inland lighthouse sit on a wide, flat meadow … an
    // Atlantic coastal plain rather than a fjord harbour"): the town is the harbour's — its buildings, plaza and street
    // dressing stand on the strip between the terraces' lower slopes and the quay at the heads of the south and middle
    // arms, along the harbour road (the east road), not across the middle of the map, and clear of the harbour zone's
    // disc (150, -110); the terrain keeps its graded village ground and the scatter keeps off all of it, so the lanes,
    // sight lines and objectives keep their bands. The lighthouse stands on the south
    // headland's crest, 21 m over the water 20 m below it, where the roadside plan had put it 300 m inland.
    town: { x0: 170, x1: 254, z0: -236, z1: 166, cx: 214, cz: -40 },
    plannedSites: [{ structure: 'lighthouse', x: 392, z: -32, yawDeg: 270 }],
    blockFill: true,
    extraKits: ['coastal'], wallStyle: 'fieldstone', wallStoneChance: 0.72,
    wallRuns: [
      [-296, -156, -210, -120, 2], [-282, 142, -188, 170, 3],
      [-128, -218, -48, -194, 2], [-106, 204, -18, 232, 3],
      [82, -174, 166, -146, 2], [76, 168, 158, 202, 3],
    ],
    // 2026-10-03 (maps lane B): one metre farther back from the carriageway (was [11, 7]) and none in the acute corner
    // of the town crossroads — a warehouse on the town road's bend and a house in that corner reached into the
    // carriageway (the brief's solidPropsInRoad)
    buildingLat: [12, 7], sideSkip: 0.12, maxSpread: 3.0, spacingPad: 8,
    roadBuildingKeepouts: [{ x: 3, z: -67, r: 12 }],
    well: false, hayCrates: false, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 330, outcrops: 60, craters: 54, rubblePiles: 18, hedgehogs: 14,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    sandbagLines: 16, tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      stalls: 1, benches: 4, coreClutter: 22, trucks: 5, jeeps: 3,
      drumClusters: 6, camps: 2, modernClutter: 20,
      roadFence: 'fencerail', yardFence: 'fencepicket',
    },
  },
  horizon: {
    baseHex: 0x42535a, amp: 1.34, style: 'alpine', treeline: 0.74, snowline: 0.78,
    forestHex: 0x213b38, rockHex: 0x657077, haze: 0.9, grain: 0.58,
    // round 49 (owner audit 2026-09-23, "smooth green cone hill on the rim with a darker cap"): the softened alpine domes
    // never reached the vista's slope-keyed rock, so a hill was one green tint with the altitude-banded summit rock as
    // its cap; above the treeline the turf now greys to heath with gneiss ribs, scree fans and a broken summit
    // (horizon.ts bareRock) — the palette above is unchanged
    bareRock: 1,
    // round 55 (2026-09-24, the round-49 follow-up: the cone hills sit at hT 0.3–0.5, below the treeline that gates the
    // ribs): gneiss knobs and slabs through the turf on the steeper faces below the treeline, inside a halo of scree
    // (horizonVista.ts outcrops) — the palette is still unchanged
    outcrops: 1,
    // the mountains lane (2026-10-02): Fjord keeps its aiguilles — its crest was serrated, not coned (the skyline cone
    // measure, horizonMassif.selftest.mjs: 3 over three seeds), and the carved landform smoothed it into a wall (11)
    massif: false,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'broken-stratocumulus', windDirDeg: 250, scud: 0.35, farBand: 0.6, fogBank: 0.4, fogBankTopM: 90, rain: 0.3, virga: 0.15, nightGlow: 0.2, nightGlowHex: 0xffd2a0 },
  sky: {
    sunElevationDeg: 20, sunAzimuthDeg: 146, turbidity: 5.4, rayleigh: 1.55,
    mieCoefficient: 0.0072, mieDirectionalG: 0.84, fogDensity: 0.00072,
    fogTintHex: 0x8299a4, fogMix: 0.62, envIntensity: 0.26,
    cloudOpacity: 1.15, cloudOpacity2: 0.9, cloudTintHex: 0xd9e1e2,
    sunIntensity: 4.2, sunColorHex: 0xf7ecd9, hemiIntensity: 0.36, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.35 / 0xffdfbe / 0.52); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
  },
  minimap: {
    base: [68, 82, 76], hard: [92, 96, 94], soft: [42, 66, 68],
    forest: 'rgba(25,53,47,.86)', forestStroke: 'rgba(14,34,31,.94)',
    water: 'rgba(43,81,99,.88)', waterStroke: 'rgba(21,46,61,.95)',
    roadCasing: 'rgba(37,41,43,.95)', roadFill: 'rgba(143,151,150,.96)', buildingFill: '#c2c8ca',
  },
  shot: { pos: [-226, 42, -238], look: [218, -4, 38] },
  // round 66 (2026-09-24, the FFT ocean): a sheltered fjord — a light air down the arms, a faint swell from the mouth;
  // the owner's approved look is kept (amplitude 0.45: centimetres, read as the same water from the chase camera)
  ocean: { windSpeed: 3.2, windDirDeg: 250, fetchKm: 6, swell: 0.1, amplitude: 0.45, choppiness: 0.7, foam: 0.15, breakers: 0.3, caustics: 0.4 },
} satisfies import('./contracts.ts').MapCompositionConfig;
