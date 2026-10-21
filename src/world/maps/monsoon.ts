// src/world/maps/monsoon.ts — Monsoon Ridge, redesigned 2026-10-02 (maps-and-layouts lane; docs/MAP-LAYOUT-BRIEF.md).
// The flood channel, the ruined hill town, the five roads, the jungle, palette, sky, name and id are the map's identity
// and stay; the hills are new. The old ones were Verdant's five landforms in a monsoon palette, and their ground closed
// the median sightline to 78 m.
//
// Reference: Kohima in the Naga Hills, April to June 1944: a hill town on a saddle between jungle spurs, Garrison Hill
// and Jail Hill above its streets, the road winding through, and the monsoon flooding the valley bottoms.
//
// The story on the ground: the flood channel runs through the valley from the south-west to the north-east, under the
// town. A spur ridge stands west of the town north of the channel and another east of it; Garrison Hill rises in the
// north-west and Jail Hill in the south-west, and two terrace knolls hold the east side. Alpha deploys in the south
// valley beside the road on its assembly apron, bravo on the northern slope. The zone-control discs stand on the line
// of equal driven distance: the temple forecourt by the west road, the town's square and the tea estate's drying yard
// on the east.

import { createMarshChannel } from './marshChannel.ts';

// Rainwater follows the lower saddle into the eastern floodplain; the
// original western/eastern bowls remain anchors along one continuous run.
// (the ground lane, 2026-10-17; MASTER #15, the critics: "a decal pasted on the valley" — at the default 1.15 spacing its
// cells read as a string of discs, the bank scalloped 0.21 of a radius deep between them) laid at 0.5, Amberford's law:
// a bank 0.03 of a radius deep, the closer cells proportionally shallower so the summed bed keeps its depth
const floodChannel = createMarshChannel([
  { x: -354, z: -250, r: 30, dip: 0.70 },
  { x: -236, z: -124, r: 58, dip: 2.0 },
  { x: -118, z: -144, r: 29, dip: 0.70 },
  { x: -18, z: -88, r: 30, dip: 0.70 },
  { x: 94, z: 10, r: 30, dip: 0.70 },
  { x: 152, z: 124, r: 32, dip: 0.75 },
  { x: 210, z: 184, r: 52, dip: 2.2 },
  { x: 318, z: 278, r: 30, dip: 0.70 },
], 0.5);

// Kohima's town (the maps lane, 2026-10-14; the owner: Monsoon Ridge among the maps to bring up, built the way Verdant
// was). The hill town stood as 16 buildings over a 290 m saddle. Kohima in 1944 is a town of terraces: the bazaar's shops
// in rows along the Imphal road, the colonial bungalows on the terraces above it to the west, each in its garden behind
// a hedge, the Angami village's thatched houses with their granaries on the north-west spur, the mission church facing
// the town's square, and the Deputy Commissioner's bungalow and its tennis court above the square (landmarks below);
// one in five of the town's buildings shelled to a ruin, as the siege left them. The plan is authored in the road's own
// frame (u north along the Imphal road from its crossing with the valley road at (10, -34), v across it to the east).
const KOH_U = [0.19, 0.982] as const, KOH_V = [0.982, -0.19] as const;
const kohAt = (u: number, v: number): [number, number] => [10 + u * KOH_U[0] + v * KOH_V[0], -34 + u * KOH_U[1] + v * KOH_V[1]];
const kohHash = (u: number, v: number, k: number) => {
  let h = Math.imul(Math.round(u * 10) + 7919 * k, 0x9e3779b1) ^ Math.imul(Math.round(v * 10) + 104729, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
type KohFront = 'road' | 'north' | 'south' | 'east' | 'west';
const kohSite = (structure: string, u0: number, v0: number, front: KohFront, jitter = 1) => {
  const u = u0 + (kohHash(u0, v0, 2) - 0.5) * 3.2 * jitter, v = v0 + (kohHash(u0, v0, 3) - 0.5) * 2.2 * jitter;
  const [x, z] = kohAt(u, v);
  const dir = front === 'road' ? (v > 0 ? [-KOH_V[0], -KOH_V[1]] : [KOH_V[0], KOH_V[1]])
    : front === 'north' ? KOH_U : front === 'south' ? [-KOH_U[0], -KOH_U[1]] : front === 'east' ? KOH_V : [-KOH_V[0], -KOH_V[1]];
  const yawDeg = Math.atan2(dir[0], dir[1]) * 180 / Math.PI + (kohHash(u0, v0, 4) - 0.5) * 8 * jitter;
  return { structure, x: +x.toFixed(2), z: +z.toFixed(2), yawDeg: +yawDeg.toFixed(1), terrace: true };
};
/** A shop, a bungalow or a house; one in five of the town's shelled to a ruin, one in sixteen an empty lot. */
const kohLot = (structure: string, u: number, v: number, front: KohFront) => {
  const r = kohHash(u, v, 1);
  if (r < 0.06) return [];
  return [kohSite(r > 0.8 && structure !== 'farmhouse' ? 'ruin' : structure, u, v, front)];
};
const KOHIMA_TOWN = [
  // the bazaar: shop rows and shops along the Imphal road north of the crossing, both sides (south of it the road crosses
  // the flood channel's bottoms, which the monsoon floods)
  ...[24, 39, 54, 69, 84, 99, 114, 129, 144, 159, 174, 189, 204].flatMap((u) => [
    ...kohLot(u % 2 === 0 ? 'marketRow' : 'cornershop', u, 16, 'road'), ...kohLot(u % 2 === 0 ? 'cornershop' : 'marketRow', u, -16, 'road')]),
  // the lane behind the bazaar on the east, short of the flood channel
  ...[30, 48, 66, 84, 102, 120, 138, 156].flatMap((u) => kohLot(u % 36 === 30 ? 'cornershop' : 'bathhouse', u, 38, 'west')),
  // the bungalows on the terraces west of the road, each in its garden
  ...[26, 50, 74, 98, 122, 146, 170].flatMap((u) => kohLot('bathhouse', u, -44, 'east')),
  ...[96, 120, 144, 168].flatMap((u) => kohLot('bathhouse', u, -74, 'east')),
  ...[-26, 4, 130, 156].flatMap((u) => kohLot('bathhouse', u, -104, 'south')),
  // south of the crossing, on the dry ground above the channel: the garrison's sheds and a bungalow or two
  ...[[-36, 46], [-58, 60], [-40, -60], [-70, -86]].flatMap(([u, v]) => kohLot(v > 0 ? 'depot' : 'bathhouse', u, v, v > 0 ? 'south' : 'east')),
  // the Angami village on the north-west spur: thatched houses round their granaries
  ...[[176, -40], [190, -64], [172, -88], [200, -100], [186, -124], [214, -76], [206, -140], [226, -112], [232, -54], [244, -88]].flatMap(([u, v]) => kohLot('farmhouse', u, v, 'south')),
  // the mission church facing the town's square from the north, and the square framed: the Deputy Commissioner's garden
  // west of it (landmarks), a shelled house south of it
  kohSite('chapel', 96, -82, 'south', 0),
  kohSite('ruin', -12, -84, 'north', 0.5),
  // the east terraces between the bazaar's back lane and the channel's bank, north of the bend
  ...[120, 138, 156, 174, 192, 210].flatMap((u) => kohLot('bathhouse', u, 60, 'west')),
  // the upper terraces west, toward the spur
  ...[100, 124, 148, 172].flatMap((u) => kohLot('bathhouse', u, -134, 'east')),
  ...[[118, -160], [142, -168], [166, -158], [96, -172]].flatMap(([u, v]) => kohLot('farmhouse', u, v, 'east')),
// the square's zone disc (matchObjectiveLayouts: the middle zone at (-60, 24), its 30 m footprint clear of every solid)
// keeps a 46 m ring free of the town's buildings and their yards
].filter((site) => Math.hypot(site.x + 60, site.z - 24) >= 46);

export default {
  id: 'monsoon',
  name: 'Monsoon Ridge',
  blurb: 'A storm rolls across jungle ridges and the shattered town in the valley',
  terrain: {
    hillScale: 1.0, microScale: 1.1, rimH: 44, clearMarshVeg: true,
    roads: { paths: [
      [[-424, -442], [-342, -274], [-306, -82], [-322, 108], [-254, 286], [-174, 462]],
      [[-62, -468], [-42, -282], [-8, -112], [28, 48], [54, 224], [106, 466]],
      [[350, -450], [294, -286], [264, -104], [288, 72], [242, 250], [180, 450]],
      [[-356, -172], [-214, -132], [-76, -60], [62, -18], [208, -66], [264, -104], [322, -146]],
      [[-310, 204], [-164, 168], [-18, 210], [120, 274], [238, 328]],
      // (the maps lane, 2026-10-14: Kohima's terrace road, from the bazaar up past the bungalows' terraces and the
      // Angami village to the north road)
      [[25.2, 44.6], [-11.8, 63.9], [-55.5, 90.7], [-69.5, 134.2], [-73.7, 175.8], [-76.8, 201.8]],
    ] },
    marshes: [
      ...floodChannel,
      { x: 294, z: -260, r: 38, dip: 1.8 },
    ],
    // The aprons keep the apron bank law (docs/MAP-LAYOUT-BRIEF.md, "Apron banks"): none makes its bank steeper than
    // the hills round it. The zone-control seats stand on the line of equal driven distance. The temple forecourt by
    // the west road and the tea estate's drying yard east of the east spur are aprons; the town's own square needs
    // none.
    hardstands: [
      // Alpha's assembly apron round its pad in the south valley, where road 2 crosses it. It takes the road's own
      // height and grade (6 % down the valley on this seed), so the road keeps its grade at every terrain seed. Its
      // turbo goal and its flag seat on it.
      { x: -40, z: -340, width: 32, length: 32, yawDeg: 6, grade: 'road', bankM: 16 },
      // the temple forecourt astride the west road, on the road's own grade, with a 24 m bank down to the channel
      { x: -306, z: 16, width: 44, length: 44, yawDeg: -5, grade: 'road', bankM: 24 },
      // the drying yard at its ground's median height
      { x: 400, z: 8, width: 56, length: 56, yawDeg: 0, level: 4.5, grade: 0 },
    ],
    village: { x0: -132, x1: 156, z0: -112, z1: 174, cx: 12, cz: 26, feather: 50, flatten: 0.74, relief: 0.28 },
    landforms: [
      // the spur ridges west and east of the town, Garrison Hill, Jail Hill, the flood basin and the terrace knolls
      { kind: 'ridge', x: -200, z: 120, length: 240, width: 70, height: 9, yawDeg: 80 },
      { kind: 'ridge', x: 215, z: -40, length: 280, width: 60, height: 9, yawDeg: 100 },
      { kind: 'knoll', x: -100, z: 280, rx: 70, rz: 55, height: 12 },
      { kind: 'knoll', x: -110, z: -260, rx: 60, rz: 50, height: 10 },
      { kind: 'basin', x: -300, z: -320, rx: 80, rz: 60, height: -3, wetScale: 0.75 },
      { kind: 'knoll', x: 330, z: 160, rx: 60, rz: 50, height: 8 },
      { kind: 'knoll', x: 230, z: -300, rx: 60, rz: 45, height: 8 },
    ],
  },
  spawns: {
    // Alpha forms up on its apron in the south valley beside the road. The old pad (10, -398) stood on a 30 % hillside:
    // every level apron there inside the turbo arena (|z| <= 402 for the goal) cut a wall into the hill, and its goal
    // seated 300 m forward. Bravo's pads stand 16 m farther north than before, so the deployments stay 744 m apart.
    player: { x: -40, z: -340 },
    enemies: [
      { x: -196, z: 388 }, { x: -126, z: 426 }, { x: -50, z: 382 },
      { x: 28, z: 430 }, { x: 108, z: 384 }, { x: 188, z: 420 }, { x: 258, z: 372 },
    ],
  },
  splat: {
    seaLake: true, seaFoam: 0.06, seaRamp: [0.10, 0.44], iceDrift: 0.02,
    marshGloss: 0.84, iceSky: [0.20, 0.34, 0.32],
    tintA: [0.67, 0.93, 0.65], tintB: [0.41, 0.61, 0.43], tintC: [0.85, 1.02, 0.72],
    roadTint: [0.55, 0.49, 0.40], midRelief: 1.0,
    // round 45 (2026-09-23, AAA checks 3/15): the SW corner mound rendered as bare mud from ~30°; a monsoon hill holds
    // its turf to ~38° — the slope→rock thresholds shift by 0.10 (rock from ~38°, full at ~50°).
    slopeGrassHold: 0.10,
  },
  vegetation: {
    species: ['eucalyptus', 'palm', 'willow', 'oak'], clusterMix: [['eucalyptus', 0.36], ['willow', 0.28], ['palm', 0.22], ['oak', 0.14]],
    loneMix: [['eucalyptus', 0.34], ['palm', 0.28], ['willow', 0.24], ['oak', 0.14]], rimMix: [['eucalyptus', 0.38], ['willow', 0.28], ['palm', 0.22], ['oak', 0.12]],
    // GND (2026-10-15): the ring's trees at each species' own rim stature (vegetation.ts `ringStature`): eucalyptus x1.27, willow x0.83 of the one mean
    ringStature: 'species',
    clusterCount: 118, loneCount: 238, rimCount: 148, grassDensity: 1.38,
    clusterScrub: 2.7, bushCount: 1.72, bushSpecies: 'oak',
  },
  props: {
    // regional-buildings lane: the Kohima 1944 kit (maps/regional/kohima.ts)
    architecture: 'kohima',
    // (the maps lane, 2026-10-14: the plan is Kohima's own, KOHIMA_TOWN above; the roadside plan's 26 buildings stood as 16
    // on the saddle; was ['ruin', 'chapel', 'bathhouse', 'marketRow', ... 26 entries])
    plan: [],
    plannedSites: KOHIMA_TOWN,
    // (the maps lane, 2026-10-14: the hero of Kohima's siege) the Deputy Commissioner's bungalow on the terrace above the
    // square, its veranda to the town, and its tennis court on the terrace below it, the front line across which the
    // garrison and the attackers fought for a fortnight (landmarks/colonial.ts, built by the landmarks lane for this map)
    landmarks: [
      { kind: 'colonialBungalow', x: -105.6, z: 63.7, yawDeg: 101, ground: 'veto', name: "the Deputy Commissioner's bungalow" },
      { kind: 'tennisCourt', x: -109, z: 24.7, yawDeg: 11, ground: 'veto', name: "the Deputy Commissioner's tennis court", params: { steps: 1 } },
    ],
    destructibleBuildings: ['stilthouse', 'longhouse', 'fieldhospital', 'commandtent'],
    tacticalBeats: [
      { id: 'western-temple-ridge', role: 'brawl', x: -250, z: 140, yawDeg: 12,
        structure: 'longhouse', redoubt: true, outcrop: { count: 7, radius: 11 }, wreck: true, wreckOffsetZ: -16 },
      { id: 'floodplain-listening-post', role: 'scout', x: 44, z: -184, yawDeg: 18,
        structure: 'commandtent', outcrop: { count: 4, radius: 8, scaleMax: 2.6 } },
      { id: 'eastern-field-hospital', role: 'support', x: 310, z: -80, yawDeg: -16,
        structure: 'fieldhospital', redoubt: true, outcrop: { count: 5, radius: 9 }, wreck: true, wreckOffsetX: 15 },
    ],
    wallStyle: 'fieldstone', wallStoneChance: 0.78,
    wallRuns: [
      [-292, -116, -204, -80, 2], [-282, 116, -190, 154, 3],
      [188, -136, 282, -102, 3], [194, 138, 286, 170, 2],
      [-134, 230, -34, 260, 3], [66, -252, 158, -218, 2],
    ],
    well: true, hayCrates: true, fences: true, telegraph: true, carts: true, logs: true,
    rocks: 235, outcrops: 48, craters: 82, rubblePiles: 28,
    sandbagLines: 22, hedgehogs: 16,
    // (2026-10-17, the maps lane; the fleet dressing rules 227, props.ts dressingRules) a fence run's module or gate that
    // meets a building's plot is left out; (229) and a run in line with a shop's front keeps clear of its corners (the
    // market's wattle pressed against the cornershop's counter, the 227 blind's split pose). The field works sit on their
    // own ground since 229 (props.ts placeFieldWorks).
    dressingRules: { fencesClearBuildings: true, fenceFrontageClear: true },
    // the map-vehicles lane (2026-10-06, the period ruling): no tank hulks — the public fleet has no tank of this
    // front's war; the war shows through the burnt period trucks and carts
    tankWrecks: { era: 'ww2', count: 0, debris: true, ids: [] },
    inhabit: {
      stalls: 4, benches: 3, coreClutter: 26, pots: 5, laundry: 4,
      handcarts: 4, carts: 3, trucks: 6, jeeps: 5, drumClusters: 6,
      camps: 5, modernClutter: 22, roadFence: 'fencewattle', yardFence: 'fencewattle',
    },
  },
  // The scenery lane (2026-10-03, world/scenery.ts; docs/MAP-LAYOUT-BRIEF.md "Scenery"): the Naga Hills' stones. A
  // memorial monolith stands on Garrison Hill's crown, as the Kohima memorial does; a row of Naga memorial stones,
  // raised for a village's feasts of merit, stands by the temple forecourt.
  scenery: {
    landmarks: [
      { kind: 'menhir', x: -100, z: 276, scale: 1.4, height: 5.2, name: 'the memorial stone on Garrison Hill' },
      { kind: 'menhir', x: -286, z: -26, scale: 1.0, height: 3.4, name: 'the Naga stones by the temple' },
      { kind: 'menhir', x: -280, z: -31, scale: 0.8, height: 2.6 },
      { kind: 'menhir', x: -292, z: -21, scale: 0.7, height: 2.1 },
    ],
  },
  horizon: {
    // the mountains lane (2026-10-03, gauntlet waves 15 and 24): Kohima stands on the Naga Hills' ridges — long, steep,
    // forested to their crests (the regional 'ridges', rebuilt after wave 24 read bare pale rock and a needle spike); the
    // ring keeps the PR head's height
    baseHex: 0x355344, amp: 1.08, style: 'alpine', treeline: 0.97, treelineLayers: 3, snowline: 2, panorama: { regional: 'ridges' },
    forestHex: 0x193a28, rockHex: 0x59635a, haze: 0.97, grain: 0.64,
  },
  // round 71 (2026-09-25): the volumetric layer's cloudscape (engine/cloudscapes.ts; opt-in, ?clouds=volumetric)
  clouds: { regime: 'cumulonimbus-front', windDirDeg: 200 },
  sky: {
    sunElevationDeg: 24, sunAzimuthDeg: 124, turbidity: 7.8, rayleigh: 2.05,
    mieCoefficient: 0.012, mieDirectionalG: 0.88, fogDensity: 0.00088,
    fogTintHex: 0x708c86, fogMix: 0.66, envIntensity: 0.27,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.9 / 0xffdfc0 / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses
    // 2026-10-01: the grounded light model's map levers (lightModel.ts LightingConfig)
    lighting: { groundAlbedoHex: 0x61694b },
    // 2026-10-14 (the SKY lane, SKY-02: a sky grade per place; atmosphere.ts sky grade, faded at a low sun and at night): a monsoon ridge — a heavy grey-green humid band, a slate blue under the storm
    atmosphere: { horizonTintHex: 0xc6cec8, horizonTintAmount: 0.45, horizonBandDeg: 12, zenithTintHex: 0x7c94aa, zenithTintAmount: 0.3 },
  },
  minimap: {
    base: [51, 84, 59], hard: [82, 82, 70], soft: [37, 65, 55],
    forest: 'rgba(19,61,35,.9)', forestStroke: 'rgba(9,35,19,.97)',
    water: 'rgba(43,80,78,.8)', waterStroke: 'rgba(22,48,48,.94)',
    roadCasing: 'rgba(38,35,29,.94)', roadFill: 'rgba(133,124,100,.94)', buildingFill: '#bfc3b9',
  },
  shot: { pos: [-176, 44, -232], look: [44, 3, 92] },
  // round 66 (2026-09-24, the FFT ocean): the flooded river under the monsoon air — a low ripple, silt hides the bed
  // so the caustics stay faint; the owner's approved look is kept (amplitude 0.6)
  ocean: { windSpeed: 2.8, windDirDeg: 200, fetchKm: 2.5, amplitude: 0.6, foam: 0, breakers: 0.05, caustics: 0.2 },
} satisfies import('./contracts.ts').MapCompositionConfig;
