// src/world/maps/alpine.ts — Glacier Pass, redesigned 2026-10-03 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The frozen lake, the mountain village, the five pass roads, the palette, sky, name and id are the map's identity and
// stay; the ground round them is new. The old pass was Verdant's five landforms (as glacial relief bars) under a
// stronger hill noise (1.46, now 1.25): its cross roads met the pass roads off any shared station, so a junction
// stepped to a 42 % grade on other terrain seeds, a south exit climbed the rim at 38 %, the turbo-ball goals stood
// 212 m from alpha's deployment and 28 m from bravo's, and the zone-control discs sat in one cluster by the lake.
//
// Reference: the Col du Mont-Cenis, April 1945: a high saddle holding its lake, the hospice beside the road on the
// north shore, the Grande Croix below the southern climb, and forts on the rock spurs above the pass.
//
// The story on the ground: the plateau floor is the lake basin, its village on the west shore. Rock spurs come down
// from the cirque walls at three corners; lateral moraines line the west and east sides; the terminal moraine's two
// arcs cross the south in front of alpha's assembly yard; ice-ground rock knobs stand on the floor. The cross roads
// meet the pass roads at shared stations. Alpha assembles in the south-west, bravo along the northern saddle. The
// zone-control discs stand on the line of equal driven distance: the col yard east of the west pass road, the lake
// ice off the village (also the turbo-ball kickoff) and the lake ice by the east shore.
//
// Landmarks: the frozen lake, the Hospice on its north shore, the Grande Croix chapel at the south crossroads, the
// western pass redoubt, the rescue station on the east shore, the three rock spurs and the moraines. At the square's
// edge the spurs run into the north-west, north-east and south-east corners, the west moraine runs along the west edge
// and the five roads cross the north and south edges: the borders lane carries them outward.
//
// The buildings (map revival lane 2, 2026-10-05; the owner: every map as new as Verdant): the Savoyard kit
// (maps/regional/savoyard.ts) builds every one in place as the high Maurienne's and the pass's own — the grey rubble
// houses of Bessans and Lanslevillard under broad lauze roofs, their openings banded in whitewash, the hayloft gables
// boarded in larch, the larch galleries; the granges, mazots on their stone mushrooms and woodsheds; the chapels with
// their bell turrets and porches; the parish church with its tin bulb; the Hospice under its hipped roof and bell; the
// Italian frontier guard's ochre barracks (the plateau was Italian until 1947); the Vallo Alpino's concrete blockhouse in
// the village and its casemate at the western pass redoubt; the houses shelled in April 1945, roofless.

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// Landform geology (landformGeology.ts): the spurs are arêtes, straight steep flanks to a narrow crest, cut by couloirs;
// the moraines are hummocky till with lobed margins; the knobs are ice-ground rock, rounded on top and steep at the sides.
const SPUR = { profile: 'cone', gullies: { count: 5, depthM: 3, width: 0.5 }, outline: 0.25, rough: 1.4 } as const;
const MORAINE = { outline: 0.2, rough: 0.9 } as const;
const KNOB = { profile: 'butte', wall: [0.35, 0.7], apron: 0.3, gullies: { count: 6, depthM: 1.5, width: 0.5 },
  outline: 0.3, rough: 1.0 } as const;

export default {
  id: 'alpine',
  name: 'Glacier Pass',
  blurb: 'A frozen alpine lake divides a fortified mountain village and two high passes',
  terrain: {
    hillScale: 1.25, microScale: 0.72, rimH: 52, frozenMarshes: true,
    // The base hill noise is lower than before (1.46): the geological landforms carry the relief, and the roads keep
    // the brief's 18 % grade law at every terrain seed.
    roads: { paths: [
      // Explicit approach bearings meet the north/south boundary normally. The cross roads end on stations the pass
      // roads share (west (-340, -240) and (-303, 200), east (264, -194) and (245, 272)), so each junction blends one
      // height; the pass roads' approach stations 14-30 m inside the south edge are gone, so the rim's rise there
      // spreads over the whole last leg.
      [[-346, -480], [-346, -278], [-340, -240], [-316, -90], [-330, 108], [-303, 200], [-276, 290], [-202, 468], [-202, 480]],
      [[-160, -480], [-160, -380], [-146, -304], [-154, -168], [-172, -28], [-138, 142], [-86, 316], [-18, 466], [-18, 480]],
      [[330, -480], [330, -400], [286, -282], [264, -194], [246, -122], [226, 42], [258, 218], [245, 272], [212, 410], [212, 480]],
      [[-303, 200], [-190, 166], [-86, 128], [24, 136], [146, 188], [245, 272]],
      [[-340, -240], [-166, -208], [-68, -158], [18, -176], [138, -220], [264, -194]],
    ] },
    lakes: [
      { x: 58, z: -34, r: 116, depth: 1.6 },
      { x: -258, z: 224, r: 42, depth: 1.3 },
    ],
    marshes: [{ x: 280, z: -192, r: 44, dip: 1.4 }],
    // The col yard (the western zone-control seat) and alpha's assembly yard (its turbo goal and its flag seat on it),
    // both level, both keeping the apron bank law with 24 m banks (docs/MAP-LAYOUT-BRIEF.md, "Apron banks").
    hardstands: [
      { x: -266, z: 44, width: 44, length: 44, yawDeg: 0, level: -3.9, grade: 0, bankM: 24 },
      { x: -204, z: -378, width: 40, length: 40, yawDeg: 0, level: 9.7, grade: 0, bankM: 24 },
    ],
    village: { x0: -204, x1: 202, z0: -212, z1: 222, cx: -42, cz: 28, feather: 58, flatten: 0.69, relief: 0.3 },
    landforms: [
      // The cirque walls' rock spurs come down at the plateau's corners, falling to their toes on the floor: steep
      // flanks to a narrow crest, rock where the slope passes the scree's angle, couloirs down them. The borders lane
      // carries them out to the ranges.
      { kind: 'ridge', x: -400, z: 330, length: 260, width: 54, height: 22, yawDeg: -35, geology: { ...SPUR, taper: 0.75 } },
      { kind: 'ridge', x: 400, z: 300, length: 260, width: 54, height: 22, yawDeg: 35, geology: { ...SPUR, taper: -0.75 } },
      { kind: 'ridge', x: 410, z: -280, length: 200, width: 46, height: 16, yawDeg: -30, geology: { ...SPUR, taper: -0.75 } },
      // the lateral moraines along the plateau's sides and the terminal moraine's two arcs across the south: hummocky
      // banks of till with lobed margins
      { kind: 'ridge', x: -390, z: -30, length: 280, width: 36, height: 6, yawDeg: 88, geology: MORAINE },
      { kind: 'ridge', x: 340, z: 20, length: 240, width: 40, height: 6, yawDeg: 92, geology: MORAINE },
      { kind: 'ridge', x: -120, z: -300, length: 240, width: 44, height: 6, yawDeg: -8, geology: MORAINE },
      { kind: 'ridge', x: 140, z: -320, length: 220, width: 44, height: 6, yawDeg: 12, geology: MORAINE },
      // roches moutonnées: rock knobs the ice ground smooth on top and plucked steep at their sides
      { kind: 'knoll', x: 320, z: 170, rx: 32, rz: 50, height: 9, geology: KNOB },
      { kind: 'knoll', x: -180, z: 290, rx: 30, rz: 44, height: 8, geology: KNOB },
      { kind: 'knoll', x: 40, z: -250, rx: 34, rz: 28, height: 7, geology: KNOB },
      { kind: 'knoll', x: 340, z: -130, rx: 36, rz: 28, height: 8, yawDeg: 25, geology: KNOB },
    ],
  },
  spawns: {
    player: { x: -214, z: -385 },
    // Bravo deploys in a 4 x 2 block like alpha's, centred where its old line of pads had its centroid, so every
    // objective keeps its reach (the bots lane, 2026-10-03: a corner block against a 500 m line of pads leans the battle).
    enemies: [{ x: 23.3, z: 383.7 }, { x: 15.3, z: 383.7 }, { x: 7.3, z: 383.7 }, { x: -0.7, z: 383.7 }, { x: 23.3, z: 393.7 }, { x: 15.3, z: 393.7 }, { x: 7.3, z: 393.7 }],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.575, 0.025, clamp01(0.64 + l * 0.36)],
    dirtTone: (h: number, s: number, l: number) => [0.075, 0.09, clamp01(l * 0.78 + 0.12)],
    rockTone: (h: number, s: number, l: number) => [0.59, 0.045, clamp01(l * 0.95 + 0.24)],
    mudTone: (h: number, s: number, l: number) => [0.55, 0.17, clamp01(0.54 + l * 0.32)],
    // map revival lane 2, round 2 (gauntlet wave 109b: "a treeless saddle around a large snow-covered lake"): the lake
    // under April's snow, drifted over its ice (was 0.16, a swept rink)
    iceLake: true, iceDrift: 0.7, marshGloss: 1.0, mudRough: 0.18,
    iceSky: [0.72, 0.82, 0.94],
    tintA: [1.02, 1.08, 1.16], tintB: [0.74, 0.84, 0.96], tintC: [1.12, 1.14, 1.18],
    roadTint: [1.30, 1.46, 1.70], shoulderDirt: 0.30, midRelief: 0.58, // map pass 2026-09-12: packed-snow pass roads, not black mud slashes
  },
  vegetation: {
    species: ['spruce', 'fir', 'pine'], clusterMix: [['spruce', 0.62], ['fir', 0.28], ['pine', 0.10]],
    loneMix: [['spruce', 0.52], ['fir', 0.30], ['pine', 0.18]], rimMix: [['spruce', 0.70], ['fir', 0.25], ['pine', 0.05]],
    // round 2 (wave 109b: "the plateau is a uniform white sheet salted evenly with identical conifers; the saddle should
    // be nearly treeless above the treeline"): the col stands at 2,080 m, above the larches; a few stands on the floor,
    // the forest on the slopes round it (the rim's ring)
    clusterCount: 12, loneCount: 10, rimCount: 30, grassDensity: 0.36,
    // map pass 2026-09-12: exposed stone/scrub on the snowfields (0.62)
    // (round 3, gauntlet wave 127: "a saturated summer-green broadleaf bush ... cannot grow on a 2,000 m col in April"):
    // no shrub layer above the larches
    bushCount: 0, bushSpecies: 'spruce',
  },
  props: {
    // map revival lane 2 (2026-10-05): the Savoyard kit (maps/regional/savoyard.ts)
    architecture: 'savoyard',
    plan: [],
    destructibleBuildings: ['alpinerefuge', 'saunahut', 'huntingblind', 'fieldhospital'],
    // the Hospice beside the north-shore road, and the Grande Croix chapel at the foot of the southern climb
    plannedSites: [{ structure: 'tavern', x: 66, z: 132, yawDeg: 0 }, { structure: 'chapel', x: -112, z: -216, yawDeg: 0 },
      { structure: 'rangerlodge', x: -139.14, z: -174.29, yawDeg: -93.4, terrace: true },
      { structure: 'alpine', x: -142.98, z: -160.61, yawDeg: -97.3, terrace: true },
      { structure: 'chapel', x: -145.29, z: -151.13, yawDeg: -97.3, terrace: true },
      { structure: 'alpine', x: -145.25, z: -141.19, yawDeg: -97.3, terrace: true },
      { structure: 'alpine', x: -165.19, z: -177.46, yawDeg: 86.6, terrace: true },
      { structure: 'onionchurch', x: -165.87, z: -165.06, yawDeg: 82.7, terrace: true },
      { structure: 'logcabin', x: -165.17, z: -156.19, yawDeg: 82.7, terrace: true },
      { structure: 'alpine', x: -171.42, z: -120.84, yawDeg: 82.7, terrace: true },
      { structure: 'logcabin', x: -130.64, z: -162.01, yawDeg: -97.3, terrace: true },
      { structure: 'granary', x: -133.05, z: -155.01, yawDeg: -97.3, terrace: true },
      { structure: 'woodshed', x: -133.77, z: -149.39, yawDeg: -97.3, terrace: true },
      { structure: 'woodshed', x: -134.55, z: -144.13, yawDeg: -97.3, terrace: true },
      { structure: 'tower', x: -149.65, z: 29.94, yawDeg: -78.7, terrace: true },
      { structure: 'depot', x: -185.95, z: -37.73, yawDeg: 82.7, terrace: true },
      { structure: 'alpine', x: -131.08, z: 115.16, yawDeg: -78.7, terrace: true },
      { structure: 'chapel', x: -130.59, z: 125.48, yawDeg: -78.7, terrace: true },
      { structure: 'logcabin', x: -124.9, z: 152.41, yawDeg: -73.4, terrace: true },
      { structure: 'ruin', x: -120.12, z: 161.7, yawDeg: -73.4, terrace: true },
      { structure: 'logcabin', x: -152.57, z: 117.49, yawDeg: 101.3, terrace: true },
      { structure: 'alpine', x: -152.44, z: 127.31, yawDeg: 101.3, terrace: true },
      { structure: 'granary', x: -148.19, z: 135.11, yawDeg: 101.3, terrace: true },
      { structure: 'logcabin', x: -143.11, z: 158.69, yawDeg: 106.6, terrace: true },
      { structure: 'ruin', x: -141.96, z: 168.27, yawDeg: 106.6, terrace: true },
      { structure: 'depot', x: -170.74, z: 127.6, yawDeg: 101.3, terrace: true },
      { structure: 'woodshed', x: -162, z: 135.56, yawDeg: 101.3, terrace: true },
      { structure: 'depot', x: -183.88, z: -169.74, yawDeg: 82.7, terrace: true },
    ],
    tacticalBeats: [
      { id: 'western-pass-redoubt', role: 'brawl', x: -283, z: 145, yawDeg: 8,
        structure: 'alpinerefuge', redoubt: true, outcrop: { count: 8, radius: 12 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'lake-overlook', role: 'scout', x: -162, z: -192, yawDeg: -16,
        structure: 'huntingblind', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-rescue-station', role: 'support', x: 204, z: 0, yawDeg: -10,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 15 },
    ],
    extraKits: ['winterLake'], snowCap: true, wallStyle: 'fieldstone', wallStoneChance: 0.82,
    wallRuns: [
      [-310, -132, -220, -96, 2], [-298, 132, -210, 168, 3],
      [210, -140, 304, -104, 3], [204, 132, 300, 168, 2],
      [-156, 244, -56, 274, 3], [72, -278, 166, -244, 2],
    ],
    buildingLat: [11, 6], sideSkip: 0.12, maxSpread: 3.2,
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 330, outcrops: 72, craters: 66, rubblePiles: 20, // map pass 2026-09-12: exposed windward stone on the snowfields
    sandbagLines: 20, hedgehogs: 18,
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      // (round 3, gauntlet waves 127 and 129: "traffic cones", "a modern candy-striped stall"): April 1945 at the
      // frontier — no market stalls, the cable reels and direction signs of the army's line works, no cones, Jersey
      // barriers or pad transformers
      stalls: 0, benches: 2, coreClutter: 20, sleds: 14,
      trucks: 5, jeeps: 4, drumClusters: 4, camps: 3, modernClutter: { cablespool: 10, roadsign: 8 },
      // Populate the pass with recoverable tools/cans/roadside hardware.
      // Existing instanced loose-prop families absorb these extra sleepers,
      // so the lived-in threshold rises without another draw/material family.
      looseClutter: 26,
      // (round 2, wave 109b: "white picket fences") the yards fenced in split larch boards, as the kit's own yards
      roadFence: 'fencerail', yardFence: 'fenceplank',
    },
  },
  // map revival lane 2 (2026-10-05): the Grande Croix at the foot of the southern climb, beside its chapel
  scenery: {
    landmarks: [{ kind: 'waysidecross', x: -96, z: -224, yawDeg: 0, scale: 1.15, name: 'the Grande Croix' }],
  },
  horizon: {
    baseHex: 0x708397, amp: 1.42, style: 'alpine', treeline: 0.80, snowline: 0.72,
    forestHex: 0x29434a, rockHex: 0x88929d, haze: 0.91, grain: 0.52,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'towering-cumulus', coverage: 0.26, baseM: 1900, thicknessM: 900, towers: 0.3, anvil: 0, shear: 0.1, streets: 0, fieldMix: 0.92, windSpeed: 4, cirrus: 0.3, farBand: 0.5, rain: 0.15 },
  sky: {
    sunElevationDeg: 16, sunAzimuthDeg: 132, turbidity: 4.2, rayleigh: 2.0,
    mieCoefficient: 0.0052, mieDirectionalG: 0.78, fogDensity: 0.00076,
    fogTintHex: 0x9eb1c3, fogMix: 0.64, envIntensity: 0.31,
    cloudOpacity: 1.12, cloudOpacity2: 0.82, cloudTintHex: 0xe8eef3,
    sunIntensity: 4.2, sunColorHex: 0xf8eedb, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.85 / 0xffddbe / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x9ea0a2, exposureEV: -0.25 },
  },
  minimap: {
    base: [154, 169, 183], hard: [132, 144, 154], soft: [105, 127, 143],
    forest: 'rgba(37,67,71,.86)', forestStroke: 'rgba(22,42,46,.94)',
    water: 'rgba(94,139,166,.84)', waterStroke: 'rgba(53,88,113,.95)',
    roadCasing: 'rgba(63,69,75,.94)', roadFill: 'rgba(187,194,199,.96)', buildingFill: '#d5d9dc',
  },
  shot: { pos: [-238, 54, -252], look: [62, -3, 54] },
} satisfies import('./contracts.ts').MapCompositionConfig;
