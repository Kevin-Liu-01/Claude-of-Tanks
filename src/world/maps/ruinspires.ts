// src/world/maps/ruinspires.ts — Ruinspires, redesigned 2026-10-02 (maps-and-layouts lane B; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, building tones, the monumental tower plan and the name are the map's identity and stay; the city
// under them is new. The old layout was a 6 x 6 street lattice run edge to edge across a flat square (relief σ 2.9 m),
// under three of Verdant's landform kinds and on one of its beat sites, with 17 street-row houses standing in the
// carriageways at its 36 crossings.
//
// Reference: Sarajevo under siege (1992-1996). The city fills the floor of a river valley between steep hills; one wide
// boulevard (Zmaja od Bosne, "Sniper Alley") runs the length of the valley, lined with the high-rises of the modern
// centre — the twin office towers, the parliament, the Holiday Inn — and the older districts climb the slopes on
// terrace streets, linked to the boulevard by steep cross streets. The hills above the rooftops were the front line.
//
// The story on the ground: the boulevard runs west to east along the valley floor; at its centre is the Square of the
// Republic, and its two ends bend down the valley out of the city. Two hill flanks rise south and north to the wooded
// ridges each team assembles behind. On each flank a terrace street follows the contour above the boulevard, a trunk
// road climbs from the boulevard over the ridge to the outside world, and one cross street links the terrace street to
// the boulevard. The towers stand along the boulevard; the old districts' street rows line the terrace and cross
// streets; a television hill rises on each flank.
//
// The layout is rotationally symmetric about the Square of the Republic (0, 0): alpha deploys behind the south ridge,
// bravo behind the north ridge. The three zone-control discs stand on the boulevard's three squares — the west square,
// the Square of the Republic (also the turbo-ball kickoff) and the east square — so both teams fight down into the
// valley; the trunk roads reach the boulevard 50 m apart, so neither runs straight on into the other.
import { makeRealisticCityBuildingTones } from './buildingTonePresets.ts';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// The towers, halls and works of the city: authored sites in rotation pairs about the Square of the Republic, so each
// side of the valley holds the same weight of cover (the roadside builder handed the plan out in road order, which
// stacked the tallest towers along one trunk road). South side authored; the north side is its rotation.
const SOUTH_LANDMARKS = [
  // along the boulevard
  { structure: 'parkingdeck', x: -335, z: -34, yawDeg: 0 },
  { structure: 'megatower', x: -150, z: -36, yawDeg: 0 },
  { structure: 'civichall', x: -96, z: -34, yawDeg: 0 },
  { structure: 'arcology', x: 84, z: -38, yawDeg: 0 },
  { structure: 'needletower', x: 136, z: -32, yawDeg: 0 },
  { structure: 'terracetower', x: 335, z: -40, yawDeg: 0 },
  // along the trunk road
  { structure: 'broadcasttower', x: -60, z: -92, yawDeg: 90 },
  { structure: 'foundryoffice', x: 10, z: -128, yawDeg: 90 },
  // along the terrace street
  { structure: 'factory', x: -186, z: -208, yawDeg: 0 },
  { structure: 'warehouse', x: 60, z: -206, yawDeg: 0 },
  { structure: 'depot', x: 222, z: -204, yawDeg: 0 },
  { structure: 'firestation', x: -262, z: -112, yawDeg: 90 },
  // the slope between the boulevard and the terrace street
  { structure: 'parkingdeck', x: -250, z: -64, yawDeg: 0 },
  { structure: 'terracetower', x: -112, z: -118, yawDeg: 0 },
  { structure: 'megatower', x: 108, z: -100, yawDeg: 0 },
  { structure: 'parkingdeck', x: 182, z: -122, yawDeg: 90 },
  { structure: 'civichall', x: 240, z: -96, yawDeg: 90 },
];
const rotateSite = (site: { structure: string; x: number; z: number; yawDeg: number }) =>
  ({ ...site, x: -site.x, z: -site.z, yawDeg: site.yawDeg + 180 });


export default {
  id: 'ruinspires',
  name: 'Ruinspires',
  blurb: 'A shattered high-rise capital where armored columns fight through six-lane street canyons',
  terrain: {
    hillScale: 0.40, microScale: 0.52, rimH: 32, marshes: [],
    // The city fills the valley floor and climbs both flanks to the terrace streets and above.
    village: { x0: -360, x1: 360, z0: -280, z1: 280, cx: 0, cz: 0, feather: 52, flatten: 0.86, relief: 0.10 },
    // The boulevard's three squares: level paved aprons the zone-control discs seat on.
    hardstands: [
      { x: 0, z: 0, width: 76, length: 60, yawDeg: 0 },
      { x: -225, z: 0, width: 76, length: 60, yawDeg: 0 },
      { x: 225, z: 0, width: 76, length: 60, yawDeg: 0 },
    ],
    // Authored paths stop inside the square; the endpoint completion adds each exit and grades it through the rim.
    // Inside the city every street runs on the bot planner's 25 m lattice lines where it can.
    roads: { paths: [
      // 0 — the boulevard, edge to edge along the valley floor through its three squares; its ends bend down the
      // valley.
      [[-448, -64], [-400, -40], [-350, -16], [-325, -5], [-300, 0], [-275, 0], [-250, 0], [-225, 0], [-200, 0],
        [-175, 0], [-150, 0], [-125, 0], [-100, 0], [-75, 0], [-50, 0], [-25, 0], [0, 0], [25, 0], [50, 0], [75, 0],
        [100, 0], [125, 0], [150, 0], [175, 0], [200, 0], [225, 0], [250, 0], [275, 0], [300, 0], [325, 5],
        [350, 16], [400, 40], [448, 64]],
      // 1 / 2 — the trunk roads: from the boulevard up each flank and over the ridge to the outside world.
      [[-25, 0], [-25, -50], [-25, -100], [-25, -150], [-25, -175], [-30, -225], [-44, -275], [-62, -330],
        [-76, -390], [-84, -448]],
      [[25, 0], [25, 50], [25, 100], [25, 150], [25, 175], [30, 225], [44, 275], [62, 330], [76, 390], [84, 448]],
      // 3 / 4 — the south terrace street, west and east halves: from the west crossing up to the contour, along it to
      // the trunk, on to the east and down to the east crossing.
      [[-300, 0], [-300, -40], [-294, -80], [-282, -115], [-266, -145], [-244, -165], [-215, -175], [-175, -175],
        [-125, -175], [-75, -175], [-25, -175]],
      [[-25, -175], [25, -175], [75, -175], [100, -175], [150, -175], [175, -175], [215, -175], [244, -165],
        [266, -145], [282, -115], [294, -80], [300, -40], [300, 0]],
      // 5 / 6 — the north terrace street, east and west halves (the south street's rotation).
      [[300, 0], [300, 40], [294, 80], [282, 115], [266, 145], [244, 165], [215, 175], [175, 175], [125, 175],
        [75, 175], [25, 175]],
      [[25, 175], [-25, 175], [-75, 175], [-100, 175], [-150, 175], [-175, 175], [-215, 175], [-244, 165],
        [-266, 145], [-282, 115], [-294, 80], [-300, 40], [-300, 0]],
      // 7 - 10 — the cross streets, boulevard to terrace street: on the south flank one east and one west of the trunk,
      // on the north flank their rotations.
      [[150, 0], [150, -50], [150, -100], [150, -150], [150, -175]],
      [[-150, 0], [-150, 50], [-150, 100], [-150, 150], [-150, 175]],
      [[-200, 0], [-200, -50], [-200, -100], [-200, -150], [-200, -175]],
      [[200, 0], [200, 50], [200, 100], [200, 150], [200, 175]],
    ] },
    landforms: [
      // The two hill flanks and their wooded ridges, each the other's rotation about the square.
      { kind: 'ridge', x: 60, z: -335, length: 760, width: 140, height: 7.5, yawDeg: 4, settlementScale: 0.6 },
      { kind: 'ridge', x: -60, z: 335, length: 760, width: 140, height: 7.5, yawDeg: 4, settlementScale: 0.6 },
      // The television hills on each flank (rotation pair).
      { kind: 'knoll', x: 310, z: -215, rx: 80, rz: 60, height: 9, yawDeg: 20, settlementScale: 0.7 },
      { kind: 'knoll', x: -310, z: 215, rx: 80, rz: 60, height: 9, yawDeg: 20, settlementScale: 0.7 },
      // Garden terraces stepping up each flank above the terrace street (rotation pairs).
      ...[[-220, -232], [-120, -240], [200, -236]].flatMap(([x, z]) => [
        { kind: 'ridge', x, z, length: 110, width: 18, height: 1.9, yawDeg: 0, settlementScale: 1 },
        { kind: 'ridge', x: -x, z: -z, length: 110, width: 18, height: 1.9, yawDeg: 0, settlementScale: 1 },
      ]),
    ],
  },
  spawns: {
    // Alpha assembles behind the south ridge, west of the trunk road; bravo's seven pads are its rotation behind the
    // north ridge. The ridges and the towers screen each anchor from the other. The pads stand 45 m inside the
    // playable edge, so a 1 v 41 field's rear seats stay inside it.
    player: { x: -75, z: -405 },
    enemies: [
      { x: -15, z: 393 }, { x: 30, z: 413 }, { x: 75, z: 378 }, { x: 120, z: 413 },
      { x: 165, z: 393 }, { x: 52, z: 423 }, { x: 98, z: 423 },
    ],
  },
  splat: {
    grassTone: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.32), clamp01(l * 0.62)],
    dirtTone: (h: number, s: number, l: number) => [0.075, clamp01(s * 0.25), clamp01(l * 0.60 + 0.04)],
    rockTone: (h: number, s: number, l: number) => [0.08, clamp01(s * 0.20), clamp01(l * 0.68)],
    // round 47 (2026-09-23): the grey city's own sourced sets (sourcedTextures.ts TERRAIN_PLAN) — it used to fall
    // through to Verdant's green grass, orange dirt and raw near-black rock
    sourcedPalette: 'ruinspires',
    tintA: [0.82, 0.82, 0.78], tintB: [0.48, 0.51, 0.53], tintC: [0.90, 0.84, 0.73],
    roadTint: [0.39, 0.40, 0.41], roadTexMix: 0.92, townWear: 2.2, midRelief: 0.72,
  },
  vegetation: {
    // the map-revival lane (2026-10-05): Sarajevo's trees, not the Mediterranean's — broadleaves (the stand-in for the
    // planes, limes and chestnuts of its parks and avenues), poplars along the streets, birch in the parks, the black
    // pine and spruce of the ridges (Trebević, Igman) on the rim
    species: ['oak', 'poplar', 'pine', 'birch', 'spruce'],
    clusterMix: [['oak', 0.36], ['pine', 0.26], ['poplar', 0.16], ['birch', 0.12], ['spruce', 0.10]],
    loneMix: [['oak', 0.44], ['poplar', 0.28], ['birch', 0.16], ['pine', 0.12]],
    rimMix: [['pine', 0.42], ['spruce', 0.24], ['oak', 0.34]],
    clusterCount: 10, loneCount: 24, rimCount: 54, grassDensity: 0.25,
    bushCount: 0.30, bushSpecies: 'oak',
    // the parks on the flanks above the terrace streets and the cemetery slopes below the ridges (rotation pairs)
    parks: [{ x: -200, z: 230, r: 52 }, { x: 200, z: -230, r: 52 }, { x: 170, z: 250, r: 46 }, { x: -170, z: -250, r: 46 }],
  },
  props: {
    // the map-revival lane (2026-10-05): the city's own architecture (maps/regional/sarajevo.ts) — the boulevard's
    // Austro-Hungarian blocks and Yugoslav towers, the slopes' mahala houses, the mosques and churches, the siege on
    // every one — in place of the megacity kit; the render takes Steinburg's lime-render photo tint, warm enough for
    // the kit's ochre, cream, green and pink washes
    architecture: 'sarajevo', sourcedPalette: 'urban',
    // the boulevard's tram line, catenary, burnt trams and the container screens at its crossings, the white stones of the
    // cemeteries on the slopes below the ridges (maps/sarajevoStreets.ts)
    extraKits: ['sarajevo'],
    plan: [],
    plannedSites: [...SOUTH_LANDMARKS, ...SOUTH_LANDMARKS.map(rotateSite)],
    destructibleBuildings: [
      'guardpost', 'transformershed', 'fieldhospital', 'quonsethut', 'motorpool',
      'securityoffice', 'servicegarage', 'relaystation', 'corneroffice',
    ],
    // Three strongpoint pairs, each the other's rotation: the tram depots by the cross streets, the hotel ruins above
    // the west and east crossings, the battery posts on the slopes above the terrace streets.
    tacticalBeats: [
      { id: 'north-tram-depot', role: 'brawl', x: -175, z: 75, yawDeg: 90,
        structure: 'servicegarage', redoubt: true, wreck: true, wreckOffsetX: 18 },
      { id: 'south-tram-depot', role: 'brawl', x: 175, z: -75, yawDeg: -90,
        structure: 'servicegarage', redoubt: true, wreck: true, wreckOffsetX: -18 },
      { id: 'west-hotel-ruin', role: 'scout', x: -300, z: -120, yawDeg: 0,
        structure: 'securityoffice', outcrop: { count: 6, radius: 10, scaleMax: 2.8 } },
      { id: 'east-hotel-ruin', role: 'scout', x: 300, z: 120, yawDeg: 180,
        structure: 'securityoffice', outcrop: { count: 6, radius: 10, scaleMax: 2.8 } },
      { id: 'south-battery-post', role: 'support', x: -130, z: -225, yawDeg: 0,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: -16 },
      { id: 'north-battery-post', role: 'support', x: 130, z: 225, yawDeg: 180,
        structure: 'transformershed', redoubt: true, wreck: true, wreckOffsetZ: 16 },
    ],
    blockFill: false, streetRows: true, streetRowsAfterLandmarks: true,
    streetRowRoadStride: 1, ruinChance: 0.48, curbs: true, lampposts: true,
    // The boulevard's three squares stay open: the row houses face each one from beyond its zone-control disc. The
    // terrace streets' uphill sides stay gardens (rotation pair): a row there sealed the blocks below from the slope,
    // and a bot hunting a hull on the far ridge pressed at its gaps until a pacing match timed out.
    streetRowKeepouts: [{ x: -225, z: 0, r: 31 }, { x: 0, z: 0, r: 31 }, { x: 225, z: 0, r: 31 },
      { x0: -215, z0: -192, x1: 215, z1: -182 }, { x0: -215, z0: 182, x1: 215, z1: 192 }],
    // the city's palette (the realistic city tones) with the Sarajevo kit's two renders carried over it: a map's tones
    // override its kit's (props.ts), so the Austro-Hungarian ochre and the Yugoslav concrete of maps/regional/sarajevo.ts
    // surfaces.tones stand here as they stand there
    tones: {
      ...makeRealisticCityBuildingTones({ value: 0.80, saturation: 0.86, soot: 0.045, roofValue: 0.78, coolAccent: 0.01 }),
      plaster2: (h: number, s: number, l: number) => [0.105, clamp01(s * 0.4 + 0.34), clamp01(l * 0.82 + 0.06)],
      plaster3: (h: number, s: number, l: number) => [0.11, clamp01(s * 0.12 + 0.03), clamp01(l * 0.78 + 0.04)],
    },
    wallStyle: 'brick', wallStoneChance: 0.74, buildingLat: [21, 4],
    sideSkip: 0.04, spacingPad: 4.5, maxSpread: 4.2,
    // Park walls on the flanks and the barricades across the boulevard's ends (rotation pairs).
    wallRuns: [
      [-240, 205, -160, 205, 2], [240, -205, 160, -205, 2], [140, 230, 200, 230, 3], [-140, -230, -200, -230, 3],
      [-345, -40, -345, 40, 1], [345, 40, 345, -40, 1], [-110, 120, -110, 60, 2], [110, -120, 110, -60, 2],
    ],
    // no overhead utility line: the boulevard is a city street, lit by its lampposts
    well: false, hayCrates: false, fences: true, telegraph: false, carts: false, logs: false,
    rocks: 96, outcrops: 10, craters: 128, rubblePiles: 160,
    hedgehogs: 38, sandbagLines: 26, townCraters: true,
    tankWrecks: { era: 'modern', count: 9, debris: true,
      ids: ['bmpt_t90', 'leclerc_xlr', 'm1a2_sepv3', 'ua_t84_oplot_m', 'kf51', 'pl01', 'm2a2_bradley', 'leo2a7v', 't90m'] },
    inhabit: {
      stalls: 1, benches: 8, coreClutter: 34, drums: 20,
      trucks: 10, jeeps: 8, drumClusters: 10, camps: 3, modernClutter: 44,
      roadFence: 'fenceplank', yardFence: 'fencerail',
    },
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): a ruined city's low rolling country
    baseHex: 0x434a4d, amp: 0.75, style: 'escarpment', treeline: 0.18, panorama: { regional: 'upland', ampM: 180, trees: 4 },
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): thin grey beds on the escarpment faces
    // (the escarpment style authored none), boulder outcrops on the outland (treeline 0.18 fell in the rockfield's
    // dead zone) and more tone grain on the flattest escarpment ring (0.42 -> 0.60)
    banding: 0.12, outlandRocks: 0.50,
    forestHex: 0x2f3937, rockHex: 0x5c5e5c, haze: 0.95, grain: 0.60,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'fair-weather-cumulus', coverage: 0.42, streets: 0.3, baseM: 1100, virga: 0.6, rain: 0.25 },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 118, turbidity: 7.0, rayleigh: 1.15,
    mieCoefficient: 0.010, mieDirectionalG: 0.86, fogDensity: 0.00068,
    fogTintHex: 0x8e979c, fogMix: 0.60, envIntensity: 0.19,
    // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the near-overcast deck (1.08 / 0.82) missed the
    // low-stratus auto branch (0.95 / 0.90), so its texture sat 6-7 km out in the 2-12° band — an explicit 360 m
    // broken deck of 2400 m masses; diffuse light patchiness (cloudShadowAmp 0.12)
    cloudOpacity: 1.08, cloudOpacity2: 0.82, cloudTintHex: 0xd0d1ce,
    cloudAltM: 360, cloudHazeK: 0.00014, cloudUvM: 2400, cloudShadowAmp: 0.12,
    sunIntensity: 3.8, sunColorHex: 0xffd0aa, hemiIntensity: 0.34, postExposure: 0.94,
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0xad9b7c },
  },
  minimap: {
    base: [76, 79, 78], hard: [88, 88, 87], soft: [59, 65, 64],
    forest: 'rgba(42,55,48,.62)', forestStroke: 'rgba(25,34,30,.82)',
    water: 'rgba(70,82,86,.52)', waterStroke: 'rgba(42,50,53,.74)',
    roadCasing: 'rgba(24,26,28,.96)', roadFill: 'rgba(105,107,108,.96)', buildingFill: '#c1bab0',
  },
  shot: { pos: [-244, 30, -274], look: [36, 12, 46] },
} satisfies import('./contracts.ts').MapCompositionConfig;
