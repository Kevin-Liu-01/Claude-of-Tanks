// src/world/maps/frontier.ts — Frontier Basin, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The palette, sky, vegetation, name and id are the map's identity and stay; the battlefield under them is new. The
// old layout was Verdant's five landforms with relief spurs added, its western beat site, three straight north-south
// roads and an east-west cross road through a village rect; its bumpy floor broke every sightline inside 74 m and
// bots met in the open middle within two minutes.
//
// Reference: the Fulda Gap's Huenfeld basin in eastern Hesse, NATO's Cold War frontier: a broad farming basin
// drained west to east by a small river between two wooded Buntsandstein ridges, with a village at the crossing, mills
// on the river, farm estates on the slopes, field lanes and stone field walls, and a checkpoint where the main road
// crosses each ridge.
//
// The story on the ground: the river valley runs west to east across the middle of the map, a broad shallow floor of
// open fields. A wooded sandstone ridge closes each side, broken by one saddle where the main road crosses it, with a
// checkpoint beside the road. Lynchet banks (old field terraces) step down each slope toward the river. The village
// stands at the crossing of the main road and the valley road. A mill stands on the river west and east of it, and a
// farm estate stands on each slope between the saddle and the river.
//
// The layout is rotationally symmetric about the village crossroads (0, 0): every feature in one half has a
// counterpart of the same kind and value turned through 180 degrees. Alpha deploys south of the southern ridge, bravo
// north of the northern ridge; each ridge screens its pad, and the two saddles sit on opposite sides of the line
// between the pads, so neither pad sees the other and every approach crosses a ridge. The three zone-control
// objectives stand on the valley floor: the west river meadow below its mill, the village square and the east river
// meadow. Three lanes cross the slopes: the west farm lane, the main road, and the ridge lane past the estate.

const rot = ([x, z]: readonly [number, number]): [number, number] => [-x, -z];
const both = (path: readonly (readonly [number, number])[]): [number, number][][] => [
  path.map(([x, z]) => [x, z] as [number, number]), path.map(rot),
];

// The valley's trough: broad, shallow gorge segments along the river, symmetric through the crossroads.
const RIVER = [[-512, 34], [-400, 30], [-300, 22], [-200, 14], [-110, 8], [0, 0],
  [110, -8], [200, -14], [300, -22], [400, -30], [512, -34]] as const;
function valleyTrough(): { kind: string; x: number; z: number; length: number; width: number; height: number;
  yawDeg: number }[] {
  const out = [];
  for (let i = 1; i < RIVER.length; i++) {
    const [ax, az] = RIVER[i - 1], [bx, bz] = RIVER[i];
    const leg = Math.hypot(bx - ax, bz - az);
    out.push({ kind: 'gorge', x: (ax + bx) / 2, z: (az + bz) / 2, length: Math.round(leg / 0.86), width: 150,
      height: -3.2, yawDeg: Math.round(Math.atan2(bz - az, bx - ax) * 1800 / Math.PI) / 10 });
  }
  return out;
}

export default {
  id: 'frontier',
  name: 'Frontier Basin',
  blurb: 'A broad farming basin between two wooded ridges, a river village, mills and ridge checkpoints',

  terrain: {
    hillScale: 0.55,  // the basin's broad swell (was 1.08: the bumpy floor broke every sightline inside 74 m)
    microScale: 0.75, // field-scale folds (was 1.16)
    rimH: 31,
    marshes: [],
    // The village: one graded rect around the crossroads.
    village: { x0: -128, x1: 128, z0: -86, z1: 86, cx: 0, cz: 0, feather: 44, flatten: 0.86, relief: 0.14 },
    // Authored paths stop inside the square; the endpoint completion grades each exit through the rim
    // (maps/roadEndpoints.ts).
    roads: { paths: [
      // 0 — the main road: south edge, over the southern saddle past its checkpoint, through the crossroads, over the
      // northern saddle, north edge. Road 0 carries the utility-pole line (mapQuality).
      [[62, -448], [60, -380], [54, -300], [40, -220], [24, -140], [8, -60], [0, 0],
        [-8, 60], [-24, 140], [-40, 220], [-54, 300], [-60, 380], [-62, 448]],
      // 1 — the valley road: west edge, along the river's north bank past the west mill, through the crossroads, past
      // the east mill, east edge.
      [[-448, 44], [-380, 40], [-300, 34], [-200, 22], [-120, 10], [-60, 4], [0, 0],
        [60, -4], [120, -10], [200, -22], [300, -34], [380, -40], [448, -44]],
      // 2 / 3 — the farm lanes: from the edge past the west end of a ridge, down the slope past the farm estate to
      // the valley road.
      ...both([[-366, -448], [-356, -380], [-346, -300], [-306, -214], [-250, -138], [-214, -70], [-200, 22]]),
      // 4 / 5 — the ridge lanes: from the main road at the saddle along the ridge's foot to the support camp, then
      // down to the valley road at the east mill.
      ...both([[54, -300], [130, -236], [206, -176], [268, -110], [300, -34]]),
    ] },
    // The village square and the two river meadows below the mills, the mowing grounds by the river: level aprons the
    // zone-control placement seats its 30 m discs on. Each meadow lies on the river flats clear of the valley road
    // (an apron on the road would ramp it past a road grade), at the flats' own level.
    hardstands: [
      { x: 0, z: 0, width: 60, length: 60, yawDeg: 0, grade: 0 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 24 m bank
      { x: -290, z: -30, width: 60, length: 60, yawDeg: 0, level: -3.4, grade: 0, bankM: 24 },
      // apron bank law (docs/MAP-LAYOUT-BRIEF.md): a 16 m bank
      { x: 290, z: 30, width: 60, length: 60, yawDeg: 0, level: -2.5, grade: 0, bankM: 16 },
    ],
    landforms: [
      ...valleyTrough(),
      // The southern ridge, broken at the saddle (x 20..126) where the main road crosses; the northern ridge is its
      // rotation, its saddle on the other side of the line between the pads.
      { kind: 'ridge', x: -150, z: -262, length: 340, width: 84, height: 12, yawDeg: -4 },
      { kind: 'ridge', x: 236, z: -290, length: 220, width: 80, height: 9, yawDeg: 6 },
      { kind: 'ridge', x: 150, z: 262, length: 340, width: 84, height: 12, yawDeg: -4 },
      { kind: 'ridge', x: -236, z: 290, length: 220, width: 80, height: 9, yawDeg: 6 },
      // The wooded knob at each ridge's saddle end, over the hollow the line between the pads crosses.
      { kind: 'knoll', x: -48, z: -266, rx: 56, rz: 44, height: 6, yawDeg: -4 },
      { kind: 'knoll', x: 48, z: 266, rx: 56, rz: 44, height: 6, yawDeg: -4 },
      // Lynchet banks: old field terraces stepping down each slope toward the river, hull-down lines for both teams.
      ...[[-250, -168, 160, -3], [110, -176, 150, 4], [-110, -122, 130, 2], [-70, -100, 80, -2]].flatMap(([x, z, length, yaw]) => [
        { kind: 'ridge', x, z, length, width: 26, height: 2.6, yawDeg: yaw },
        { kind: 'ridge', x: -x, z: -z, length, width: 26, height: 2.6, yawDeg: yaw },
      ]),
    ],
  },

  spawns: {
    // Alpha deploys behind the southern ridge's western arm; bravo's seven pads are the rotation of that ground,
    // behind the northern ridge's eastern arm. 830 m between the anchors.
    player: { x: -70, z: -410 },
    enemies: [
      { x: 70, z: 410 }, { x: 22, z: 400 }, { x: 118, z: 400 }, { x: -22, z: 382 },
      { x: 162, z: 382 }, { x: 46, z: 442 }, { x: 94, z: 442 },
    ],
  },

  splat: {
    fieldPatch: 1, tintA: [1.10, 1.03, 0.78], tintB: [0.72, 0.78, 0.58],
    tintC: [1.04, 0.98, 0.73], roadTint: [0.82, 0.77, 0.66], midRelief: 0.82,
    // ground lane (wave 83: Hesse "a neutral charcoal grey, a black-earth colour wrong for Hesse's brown loess and
    // red-sandstone soils"): the loam warmer at its own luminance (~0.157 / 0.096 / 0.052) and its plough a warm mid
    // brown (~0.12 / 0.070 / 0.036), not the chernozem's near-black
    soilTint: [1.22, 0.98, 0.78], ploughLift: 1.3,
  },
  vegetation: {
    species: ['pine', 'spruce', 'oak', 'aspen'], clusterMix: [['pine', 0.36], ['spruce', 0.28], ['oak', 0.24], ['aspen', 0.12]],
    loneMix: [['oak', 0.34], ['aspen', 0.26], ['pine', 0.22], ['spruce', 0.18]], rimMix: [['pine', 0.38], ['spruce', 0.34], ['oak', 0.18], ['aspen', 0.10]],
    clusterCount: 78, loneCount: 188, rimCount: 116, grassDensity: 1.08,
    bushCount: 1.18, bushSpecies: 'oak',
  },
  props: {
    // regional-buildings lane: the Hessian Fachwerk kit (maps/regional/hessian.ts)
    architecture: 'hessian',
    plan: ['farmhouse', 'tavern', 'barn', 'schoolhouse', 'cottage', 'granary', 'depot', 'cottage', 'farmhouse',
      'woodshed', 'cornershop', 'barn', 'cottage', 'ruin', 'farmhouse', 'depot', 'cottage', 'granary', 'barn',
      'woodshed', 'cottage', 'ruin'],
    // The landmarks: the church on the square, the two mills on the river, the farm estates on the slopes.
    plannedSites: [
      { structure: 'church', x: -34, z: 40, yawDeg: 180 }, { structure: 'chapel', x: 34, z: -40, yawDeg: 0 },
      { structure: 'mill', x: -370, z: 58, yawDeg: 180 }, { structure: 'mill', x: 352, z: -64, yawDeg: 0 },
      // the farm estates by the farm lanes: house, barn and granary round a yard (sited on the slope's level shelves,
      // so the halves differ by a few metres)
      { structure: 'farmhouse', x: -214, z: -112, yawDeg: 90 }, { structure: 'barn', x: -208, z: -138, yawDeg: 0 },
      { structure: 'granary', x: -186, z: -96, yawDeg: 90 },
      { structure: 'farmhouse', x: 172, z: 100, yawDeg: 270 }, { structure: 'barn', x: 214, z: 112, yawDeg: 180 },
      { structure: 'granary', x: 210, z: 92, yawDeg: 270 },
      // the farmsteads by the ridge lanes
      { structure: 'farmhouse', x: 202, z: -136, yawDeg: 0 }, { structure: 'barn', x: 250, z: -70, yawDeg: 90 },
      { structure: 'farmhouse', x: -214, z: 112, yawDeg: 180 }, { structure: 'barn', x: -238, z: 88, yawDeg: 270 },
    ],
    destructibleBuildings: ['fieldhut', 'huntingblind', 'commandtent', 'checkpointhut'],
    tacticalBeats: [
      { id: 'south-saddle-checkpoint', role: 'scout', x: 90, z: -330, yawDeg: 8,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'north-saddle-checkpoint', role: 'scout', x: -90, z: 330, yawDeg: 188,
        structure: 'checkpointhut', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'west-hof', role: 'brawl', x: -320, z: -60, yawDeg: 90,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: -14 },
      { id: 'east-hof', role: 'brawl', x: 320, z: 60, yawDeg: 270,
        structure: 'fieldhut', redoubt: true, outcrop: { count: 6, radius: 10 }, wreck: true, wreckOffsetX: 14 },
      { id: 'south-ridge-camp', role: 'support', x: 255, z: -160, yawDeg: 20,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: -15 },
      { id: 'north-ridge-camp', role: 'support', x: -255, z: 160, yawDeg: 200,
        structure: 'commandtent', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetZ: 15 },
    ],
    buildingLat: [11, 4], maxSpread: 2.4,
    wallStyle: 'fieldstone', wallStoneChance: 0.55,
    // Field walls: the estate yards and the field boundaries on the slopes, each with its rotated twin.
    wallRuns: [
      [-286, -150, -200, -150, 3], [286, 150, 200, 150, 3],
      [-170, -190, -100, -190, 2], [170, 190, 100, 190, 2],
      [120, -200, 200, -200, 3], [-120, 200, -200, 200, 3],
      [-60, -110, 0, -116, 2], [60, 110, 0, 116, 2],
      [300, -150, 360, -170, 2], [-300, 150, -360, 170, 2],
      // the village's orchard and churchyard walls on the valley floor
      [-160, -40, -160, -100, 3], [160, 40, 160, 100, 3],
      [-110, 96, -40, 104, 2], [110, -96, 40, -104, 2],
      [70, 30, 70, 80, 1], [-70, -30, -70, -80, 1],
      [-210, 40, -150, 56, 2], [210, -40, 150, -56, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    haystacks: 24, rocks: 150, outcrops: 20, craters: 48, rubblePiles: 10,
    cropFields: 9, hedgehogs: 10, sandbagLines: 14,
    // the map-vehicles lane (2026-10-06, the period ruling): the Fulda Gap in the 1980s: V Corps' M60A3s and M1A1s,
    // the Bundeswehr's Leopard 1A5 and Marder, the 8th Guards Army's T-80B and BMP-2
    tankWrecks: { era: 'cold-war', count: 6, debris: true, ids: ['m60a3', 'm1a1', 'leo1a5', 'marder1a3', 't80b', 'bmp2'] },
    inhabit: {
      stalls: 2, benches: 3, coreClutter: 18, bales: 14, stooks: 12,
      troughs: 2, churns: 2, laundry: 2, handcarts: 3, carts: 4,
      trucks: 5, jeeps: 4, drumClusters: 5, camps: 4, modernClutter: 18,
      roadFence: 'fenceplank', yardFence: 'fencepicket',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Buntsandstein breaks out
  // of each wooded ridge's valley flank in red ledges; a carved shrine (Bildstock) stands where each farm lane meets
  // the valley road, as they do all over the Fulda country; a timber field cross stands by the main road below each
  // saddle; a 380 kV line on lattice towers strides through the basin past the village. Rotated through 180 degrees
  // about the crossroads like the rest of the map.
  scenery: {
    rocks: [
      { form: 'outcrop', geology: 'sandstone', x: -200, z: -236, radius: 8, height: 4.5, yawDeg: -4, name: 'the south ridge ledges' },
      { form: 'outcrop', geology: 'sandstone', x: 200, z: 236, radius: 8, height: 4.5, yawDeg: 176, name: 'the north ridge ledges' },
    ],
    // the red sandstone breaking out under the ridge woods
    rockFields: [
      { geology: 'sandstone', x: -150, z: -262, radius: 140, count: 6, slopeBias: 0.7, size: [2.5, 5], name: 'the south ridge sandstone' },
      { geology: 'sandstone', x: 150, z: 262, radius: 140, count: 6, slopeBias: 0.7, size: [2.5, 5], name: 'the north ridge sandstone' },
    ],
    landmarks: [
      { kind: 'bildstock', x: -208, z: 36, yawDeg: 150, name: 'the shrine at the west farm lane' },
      { kind: 'bildstock', x: 208, z: -36, yawDeg: -30, name: 'the shrine at the east farm lane' },
      { kind: 'waysidecross', x: 32, z: -270, yawDeg: 90, name: 'the field cross below the south saddle' },
      { kind: 'waysidecross', x: -32, z: 270, yawDeg: -90, name: 'the field cross below the north saddle' },
    ],
    // the 380 kV line across the basin, one tower in each half of the valley floor on either side of the village
    powerLines: [{ towers: [[-440, -150], [-147, -50], [147, 50], [440, 150]], heightM: 36, name: 'the 380 kV line' }],
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet wave 15: "mountain ranges behind places that have none"): the Fulda Gap's basin under the
    // Rhön: low rounded forested hills, no peaks
    baseHex: 0x526344, amp: 0.8, style: 'rolling', treeline: 0.91, treelineLayers: 3, panorama: { regional: 'upland' },
    forestHex: 0x2f472d, rockHex: 0x6c6b5c, haze: 0.94, grain: 0.66,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cloud-streets', contrails: 0.35 },
  sky: {
    sunElevationDeg: 27, sunAzimuthDeg: 121, turbidity: 4.4, rayleigh: 1.25,
    mieCoefficient: 0.0058, mieDirectionalG: 0.82, fogDensity: 0.00066,
    fogTintHex: 0x8293a5, fogMix: 0.50, envIntensity: 0.22,
    cloudOpacity: 1.0, cloudOpacity2: 0.7, cloudTintHex: 0xf4f4ef,
    sunIntensity: 4.25, sunColorHex: 0xffebcf, hemiIntensity: 0.38,
  },
  minimap: {
    base: [82, 94, 55], hard: [112, 105, 86], soft: [48, 69, 55],
    forest: 'rgba(36,61,31,.84)', forestStroke: 'rgba(21,38,18,.92)',
    water: 'rgba(54,78,80,.72)', waterStroke: 'rgba(28,44,46,.9)',
    roadCasing: 'rgba(46,40,31,.92)', roadFill: 'rgba(188,171,137,.96)', buildingFill: '#cbd0d2',
  },
  // from the southern saddle over the estate and the lynchets to the village, the river and the northern ridge
  shot: { pos: [150, 40, -330], look: [-20, 2, 40] },
} satisfies import('./contracts.ts').MapCompositionConfig;
